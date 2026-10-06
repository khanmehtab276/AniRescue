const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");

const authRoutes = require("./routes/auth.routes");
const casesRoutes = require("./routes/cases.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const feedbackRoutes = require("./routes/feedback.routes");
const adminRoutes = require("./routes/admin.routes");
const { requireCsrf } = require("./middleware/auth");
const { requestLogger } = require("./middleware/requestLogger");
const { snapshotMetrics } = require("./utils/metrics");
const { apiLimiter } = require("./middleware/rateLimiter");
const { pool } = require("./config/db");
const { getChannel } = require("./config/rabbitmq");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins =
  configuredOrigins.length > 0
    ? configuredOrigins
    : process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:5173", "http://127.0.0.1:5173"];

const corsOptions = {
  origin(origin, callback) {
    // Non-browser requests have no Origin header.
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  maxAge: 600,
};

app.use(helmet());

// Generate request IDs before CORS so rejected requests remain traceable.
app.use((req, res, next) => {
  const requestId = req.get("X-Request-ID") || crypto.randomUUID();
  req.requestId = requestId;
  res.set("X-Request-ID", requestId);
  next();
});

app.use(requestLogger);
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "100kb", extended: false }));
app.use(compression());

app.use("/api", apiLimiter);
app.use("/api", (req, res, next) => {
  // Authenticated/session-bearing API responses must not be cached.
  if (req.path !== "/health" && req.path !== "/health/ready") {
    res.set("Cache-Control", "no-store");
  }
  next();
});
app.use("/api", requireCsrf);

app.use("/api/auth", authRoutes);
app.use("/api/cases", casesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.json({
    name: "AniRescue API",
    status: "online",
    version: "1.1.0",
  });
});

app.get("/health/live", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
  });
});

app.get("/health/ready", async (req, res) => {
  const checks = {
    database: false,
    rabbitmq: Boolean(getChannel()),
  };

  try {
    await pool.query("SELECT 1");
    checks.database = true;
  } catch (error) {
    console.error("Readiness database check failed:", error?.message || error);
  }

  const ready = checks.database && checks.rabbitmq;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    checks,
  });
});

app.get("/health/worker", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         service_name,
         last_seen_at,
         last_success_at,
         last_error_at,
         last_error,
         processed_count
       FROM worker_heartbeats
       WHERE service_name = 'anirescue-ai-worker'`,
    );

    const worker = result.rows[0] || null;
    const healthy = Boolean(
      worker &&
      new Date(worker.last_seen_at).getTime() >
        Date.now() - 90 * 1000,
    );

    res.status(200).json({
      status: healthy ? "online" : "offline",
      worker,
      note: "Worker health is informational and is not part of backend readiness.",
    });
  } catch (error) {
    console.error("Worker health check failed:", error?.message || error);
    res.status(200).json({
      status: "unknown",
      worker: null,
      note: "Worker health is informational and is not part of backend readiness.",
    });
  }
});

app.get("/health/metrics", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    status: "ok",
    metrics: snapshotMetrics(),
  });
});

app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    status: "ok",
    uptime: process.uptime(),
  });
});

// JSON 404 for API clients.
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API route not found.",
    requestId: req.requestId,
  });
});

// Central error boundary. Do not leak stack traces or database details.
app.use((err, req, res, next) => {
  console.error("Unhandled API error:", {
    requestId: req.requestId,
    message: err?.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
  });

  if (res.headersSent) return next(err);

  res.status(err.status || 500).json({
    error:
      err.status && err.status < 500
        ? err.message
        : "An unexpected server error occurred.",
    requestId: req.requestId,
  });
});

module.exports = app;
