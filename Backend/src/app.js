const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");

const authRoutes = require("./routes/auth.routes");
const casesRoutes = require("./routes/cases.routes");

const app = express();

// --------------------------------------------------
// SECURITY & MIDDLEWARE
// --------------------------------------------------
app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
      : "*",
    credentials: true,
  }),
);

// Images are uploaded directly to Cloudinary.
// The backend receives only URLs and small JSON payloads.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ limit: "2mb", extended: true }));

app.use(compression());

// --------------------------------------------------
// ROUTES
// --------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/cases", casesRoutes);

// --------------------------------------------------
// SYSTEM DIAGNOSTICS
// --------------------------------------------------
app.get("/", (req, res) => {
  res.json({
    name: "AniRescue API Gateway",
    status: "online",
    version: "1.0.0",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
  });
});

module.exports = app;
