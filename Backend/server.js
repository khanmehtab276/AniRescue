const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { Pool } = require("pg");
const amqp = require("amqplib");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const NodeCache = require("node-cache");

const app = express();
const port = process.env.PORT || 3000;

// --------------------------------------------------
// REQUIRED ENVIRONMENT VARIABLES
// --------------------------------------------------
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing from environment variables.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing from environment variables.");
  process.exit(1);
}

// --------------------------------------------------
// IN-MEMORY CACHE
// --------------------------------------------------
const apiCache = new NodeCache({ stdTTL: 15 });

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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    error: "Too many authentication attempts. Please try again later.",
  },
});

const normalizeEnum = (val) => (val ? String(val).trim().toUpperCase() : null);

// --------------------------------------------------
// NEON POSTGRESQL DATABASE POOL
// --------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle DB client:", err?.stack || err);
});

// --------------------------------------------------
// DATABASE CONNECTION INITIALIZATION
// --------------------------------------------------
const ensureDbConnection = async () => {
  let attempt = 0;
  const maxDelay = 60000;

  while (true) {
    try {
      attempt += 1;

      const client = await pool.connect();

      console.log(
        `✅ Connected to Neon PostgreSQL Database (attempt ${attempt})`,
      );

      client.release();
      break;
    } catch (err) {
      const base = 1000;

      const delay = Math.min(
        maxDelay,
        base * Math.pow(2, Math.max(0, attempt - 1)),
      );

      const jitter = Math.floor(Math.random() * 1000);

      console.error(
        `Database connection attempt ${attempt} failed:`,
        err?.message || err,
      );

      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }
};

ensureDbConnection().catch((err) =>
  console.error("Database connection initialization error:", err),
);

// --------------------------------------------------
// DATABASE KEEPALIVE
// --------------------------------------------------
setInterval(() => {
  pool
    .query("SELECT 1")
    .catch((err) => console.warn("DB keepalive failed:", err?.message || err));
}, 60 * 1000);

// --------------------------------------------------
// RABBITMQ PRODUCER CONNECTION
// --------------------------------------------------
let rabbitChannel = null;
let rabbitConnection = null;

const connectRabbitMQ = async () => {
  let attempt = 0;

  while (!rabbitChannel) {
    try {
      attempt += 1;

      const rabbitUrl = process.env.RABBITMQ_URL;

      if (!rabbitUrl) {
        console.error("❌ RABBITMQ_URL is missing from environment variables.");
        process.exit(1);
      }

      console.log(`🔄 Connecting to RabbitMQ (attempt ${attempt})...`);

      rabbitConnection = await amqp.connect(rabbitUrl);

      rabbitChannel = await rabbitConnection.createChannel();

      await rabbitChannel.assertQueue("yolo_processing_queue", {
        durable: true,
      });

      console.log("✅ Connected to RabbitMQ Queue: yolo_processing_queue");

      rabbitConnection.on("error", (err) => {
        console.error("RabbitMQ connection error:", err?.message || err);

        rabbitChannel = null;
      });

      rabbitConnection.on("close", () => {
        console.warn(
          "⚠️ RabbitMQ connection closed. Reconnecting in 5 seconds...",
        );

        rabbitChannel = null;
        rabbitConnection = null;

        setTimeout(() => {
          if (!rabbitChannel) {
            connectRabbitMQ().catch((err) =>
              console.error("RabbitMQ reconnect error:", err),
            );
          }
        }, 5000);
      });

      break;
    } catch (err) {
      rabbitChannel = null;
      rabbitConnection = null;

      console.error(`RabbitMQ attempt ${attempt} failed:`, err?.message || err);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

connectRabbitMQ().catch((err) =>
  console.error("RabbitMQ initialization error:", err),
);

// --------------------------------------------------
// AUTHENTICATION & ROLE MIDDLEWARE
// --------------------------------------------------
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Access Denied. Token missing or malformed.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);

    req.user = verified;

    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired token.",
    });
  }
};

const requireActiveAccount = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required.'
      });
    }

    const result = await pool.query(
      `SELECT account_status
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User account not found.'
      });
    }

    const accountStatus = result.rows[0].account_status;

    if (accountStatus !== 'ACTIVE') {
      return res.status(403).json({
        error: 'Your account is not active.',
        account_status: accountStatus
      });
    }

    next();
  } catch (err) {
    console.error('Account status check error:', err);

    return res.status(500).json({
      error: 'Failed to verify account status.'
    });
  }
};

const authorizeRoles = (...allowedRoles) => {
  const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());

  return async (req, res, next) => {
    try {
      const userRole = (req.user?.role || '').toUpperCase();

      if (!req.user || !normalizedAllowed.includes(userRole)) {
        return res.status(403).json({
          error: `Access denied. Allowed roles: [${allowedRoles.join(', ')}]`
        });
      }

      const result = await pool.query(
        `SELECT account_status
         FROM users
         WHERE id = $1`,
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User account not found.'
        });
      }

      const accountStatus = result.rows[0].account_status;

      if (accountStatus !== 'ACTIVE') {
        return res.status(403).json({
          error: 'Your account is not active.',
          account_status: accountStatus
        });
      }

      next();
    } catch (err) {
      console.error('Authorization error:', err);

      return res.status(500).json({
        error: 'Failed to verify account authorization.'
      });
    }
  };
};

// --------------------------------------------------
// AUTHENTICATION ENDPOINTS
// --------------------------------------------------

// REGISTER
app.post("/api/auth/register", authLimiter, async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({
      error: "Name, email, and password are required.",
    });
  }

  try {
    const saltRounds = 10;

    const passwordHash = await bcrypt.hash(password, saltRounds);

    const requestedRole = normalizeEnum(role);

    // ADMIN accounts can never be created through
    // public registration.
    if (requestedRole === "ADMIN") {
      return res.status(403).json({
        error: "Admin accounts cannot be created through public registration.",
      });
    }

    const assignedRole = ["USER", "VOLUNTEER", "NGO"].includes(requestedRole)
      ? requestedRole
      : "USER";

    const accountStatus = assignedRole === "USER" ? "ACTIVE" : "PENDING";

    const result = await pool.query(
      `INSERT INTO users
          (full_name, email, password_hash, role, account_status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, full_name, email, role, account_status`,
      [
        name.trim(),
        email.toLowerCase().trim(),
        passwordHash,
        assignedRole,
        accountStatus,
      ],
    );

    const user = result.rows[0];

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        account_status: user.account_status,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.status(201).json({
      token,
      user,
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({
        error: "Email address is already registered.",
      });
    }

    console.error("Registration error:", err);

    res.status(500).json({
      error: "Server error during registration.",
    });
  }
});

// LOGIN
app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required.",
    });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User account not found.",
      });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        error: "Invalid password credentials.",
      });
    }
    
    if (user.account_status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'Your account is not active.',
        account_status: user.account_status
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    delete user.password_hash;

    res.json({
      token,
      user,
    });
  } catch (err) {
    console.error("Login error:", err);

    res.status(500).json({
      error: "Server error during login.",
    });
  }
});

// CURRENT USER
app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, account_status
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found.'
      });
    }

    res.json({
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Auth check error:', err);

    res.status(500).json({
      error: 'Server error during token verification.'
    });
  }
});

// --------------------------------------------------
// RESCUE CASE ENDPOINTS
// --------------------------------------------------

// 1. SUBMIT CASE
app.post(
  "/api/cases/report",
  verifyToken,
  authorizeRoles("USER", "VOLUNTEER", "ADMIN"),
  async (req, res) => {
    const { location, description, imageUrl } = req.body;

    const reporterId = req.user.id;

    if (!description) {
      return res.status(400).json({
        error: "Rescue case description is required.",
      });
    }

    try {
      const lat = location?.lat ?? null;

      const lng = location?.lng ?? null;

      const manualAddress = location?.address ?? null;

      const isCustom = location?.isCustom ?? location?.isManual ?? false;

      const result = await pool.query(
        `INSERT INTO rescue_cases
          (
            issue_description,
            latitude,
            longitude,
            manual_address,
            is_custom_location,
            image_payload,
            reporter_id,
            status
          )
         VALUES
          (
            $1,$2,
            $3,
            $4,
            $5,
            $6, $7, 'PENDING_VALIDATION'
          )
         RETURNING
           id,
           status,
           image_payload,
           created_at`,
        [
          description.trim(),
          lat,
          lng,
          manualAddress,
          isCustom,
          imageUrl || null,
          reporterId,
        ],
      );

      const savedCase = result.rows[0];

      apiCache.flushAll();

      // Send case to YOLO worker through RabbitMQ.
      if (rabbitChannel) {
        const messagePayload = JSON.stringify({
          reportId: savedCase.id,
          imageUrl: savedCase.image_payload,
        });

        rabbitChannel.sendToQueue(
          "yolo_processing_queue",
          Buffer.from(messagePayload),
          {
            persistent: true,
          },
        );

        console.log(`📡 Case #${savedCase.id} queued for YOLO evaluation.`);
      } else {
        console.warn(
          `⚠️ Case #${savedCase.id} saved, but RabbitMQ is currently unavailable.`,
        );
      }

      res.status(201).json({
        success: true,
        case: savedCase,
      });
    } catch (err) {
      console.error("Failed to report rescue case:", err?.stack || err);

      res.status(500).json({
        error: "Failed to submit rescue case.",
      });
    }
  },
);

// 2. FETCH REJECTED JUNK QUEUE
app.get(
  "/api/cases/admin/junk",
  verifyToken,
  authorizeRoles("ADMIN"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
           id,
           species,
           issue_description,
           priority,
           latitude,
           longitude,
           image_payload,
           created_at
         FROM rescue_cases
         WHERE status = 'REJECTED_JUNK'
         ORDER BY created_at DESC`,
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Junk review queue fetch error:", err);

      res.status(500).json({
        error: "Failed to retrieve junk review queue.",
      });
    }
  },
);

// 3. ADMIN JUNK REVIEW OVERRIDE
app.put(
  "/api/cases/:id/verify-junk",
  verifyToken,
  authorizeRoles("ADMIN"),
  async (req, res) => {
    const { id } = req.params;
    const { approved } = req.body;

    // Explicitly require a boolean.
    if (typeof approved !== "boolean") {
      return res.status(400).json({
        error: "The approved field must be a boolean.",
      });
    }

    const newStatus = approved ? "VALIDATION_PASSED" : "REJECTED_JUNK";

    try {
      const result = await pool.query(
        `UPDATE rescue_cases
         SET status = $1
         WHERE id = $2
         RETURNING *`,
        [newStatus, id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Case not found.",
        });
      }

      apiCache.flushAll();

      res.json({
        success: true,
        case: result.rows[0],
      });
    } catch (err) {
      console.error("Junk verification override error:", err);

      res.status(500).json({
        error: "Failed to update junk verification state.",
      });
    }
  },
);

// 4. HAVERSINE 5KM NEARBY VOLUNTEERS
app.get(
  "/api/cases/:id/nearby-volunteers",
  verifyToken,
  authorizeRoles("ADMIN", "VOLUNTEER"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const caseResult = await pool.query(
        `SELECT latitude, longitude
           FROM rescue_cases
           WHERE id = $1`,
        [id],
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: "Case not found.",
        });
      }

      const { latitude, longitude } = caseResult.rows[0];

      if (
        latitude === null ||
        latitude === undefined ||
        longitude === null ||
        longitude === undefined
      ) {
        return res.status(400).json({
          error: "Case lacks GPS coordinates.",
        });
      }

      const volunteers = await pool.query(
        `SELECT *
           FROM (
             SELECT
               id,
               full_name,
               email,
               (
                 6371 * acos(
                   LEAST(
                     1,
                     GREATEST(
                       -1,
                       cos(radians($1))
                       * cos(radians(latitude))
                       * cos(
                           radians(longitude)
                           - radians($2)
                         )
                       + sin(radians($1))
                       * sin(radians(latitude))
                     )
                   )
                 )
               ) AS distance_km
             FROM users
             WHERE LOWER(role) = 'volunteer'
               AND latitude IS NOT NULL
               AND longitude IS NOT NULL
           ) AS nearby
           WHERE distance_km <= 5.0
           ORDER BY distance_km ASC`,
        [latitude, longitude],
      );

      res.json({
        caseId: id,
        totalNearby: volunteers.rows.length,
        volunteers: volunteers.rows,
      });
    } catch (err) {
      console.error("Haversine search error:", err);

      res.status(500).json({
        error: "Failed to find nearby volunteers within 5km radius.",
      });
    }
  },
);

// 5. AVAILABLE CASES FOR VOLUNTEERS
app.get(
  "/api/cases/volunteer/available",
  verifyToken,
  authorizeRoles("VOLUNTEER", "ADMIN"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
             id,
             species,
             issue_description,
             priority,
             latitude,
             longitude,
             manual_address,
             image_payload,
             created_at
           FROM rescue_cases
           WHERE status = 'VALIDATION_PASSED'
             AND assigned_volunteer_id IS NULL
           ORDER BY created_at DESC`,
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Available cases fetch error:", err);

      res.status(500).json({
        error: "Failed to load available cases feed.",
      });
    }
  },
);

// 6. ATOMIC CLAIM CASE
app.put(
  "/api/cases/:id/claim",
  verifyToken,
  authorizeRoles("VOLUNTEER", "ADMIN"),
  async (req, res) => {
    const caseId = req.params.id;

    const volunteerId = req.user.id;

    try {
      const result = await pool.query(
        `UPDATE rescue_cases
           SET
             status = 'IN_PROGRESS',
             assigned_volunteer_id = $1
           WHERE id = $2
             AND status = 'VALIDATION_PASSED'
             AND assigned_volunteer_id IS NULL
           RETURNING *`,
        [volunteerId, caseId],
      );

      if (result.rows.length === 0) {
        return res.status(409).json({
          error: "Case is already claimed or not verified for rescue.",
        });
      }

      apiCache.flushAll();

      res.json({
        success: true,
        case: result.rows[0],
      });
    } catch (err) {
      console.error("Claim case error:", err);

      res.status(500).json({
        error: "Failed to claim case.",
      });
    }
  },
);

// 7. GENERAL STATUS UPDATE
app.put(
  "/api/cases/:id/status",
  verifyToken,
  authorizeRoles("VOLUNTEER", "ADMIN"),
  async (req, res) => {
    const { id } = req.params;

    const normalizedStatus = normalizeEnum(req.body.status);

    const volunteerId = req.user.id;

    const validStatuses = [
      "PENDING_VALIDATION",
      "PROCESSING_ANALYSIS",
      "VALIDATION_PASSED",
      "REJECTED_JUNK",
      "IN_PROGRESS",
      "RESOLVED",
      "CANCELLED",
    ];

    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        error: `Invalid status value. Permitted: [${validStatuses.join(", ")}]`,
      });
    }

    try {
      let result;

      const userRole = (req.user.role || "").toUpperCase();

      if (userRole === "ADMIN") {
        result = await pool.query(
          `UPDATE rescue_cases
             SET status = $1
             WHERE id = $2
             RETURNING *`,
          [normalizedStatus, id],
        );
      } else {
        result = await pool.query(
          `UPDATE rescue_cases
             SET status = $1
             WHERE id = $2
               AND assigned_volunteer_id = $3
             RETURNING *`,
          [normalizedStatus, id, volunteerId],
        );
      }

      if (result.rows.length === 0) {
        return res.status(403).json({
          error: "Operation prohibited or case is not assigned to you.",
        });
      }

      apiCache.flushAll();

      res.json({
        success: true,
        case: result.rows[0],
      });
    } catch (err) {
      console.error("Status update error:", err);

      res.status(500).json({
        error: "Failed to update case status.",
      });
    }
  },
);

// 8. MAP DATA
app.get("/api/cases/map", async (req, res) => {
  try {
    if (apiCache.has("map_data")) {
      return res.json(apiCache.get("map_data"));
    }

    const result = await pool.query(
      `SELECT
             id,
             species,
             issue_description,
             priority,
             latitude,
             longitude,
             status
           FROM rescue_cases
           WHERE status NOT IN
             (
               'RESOLVED',
               'REJECTED_JUNK',
               'CANCELLED'
             )
             AND latitude IS NOT NULL
             AND longitude IS NOT NULL`,
    );

    apiCache.set("map_data", result.rows);

    res.json(result.rows);
  } catch (err) {
    console.error("Map data fetch error:", err);

    res.status(500).json({
      error: "Failed to retrieve active map entries.",
    });
  }
});

// 9. ALL CASES DASHBOARD FEED
app.get(
  "/api/cases",
  verifyToken,
  authorizeRoles("VOLUNTEER", "ADMIN"),
  async (req, res) => {
    try {
      const skipCache = req.query.nocache === "true";

      if (!skipCache && apiCache.has("dashboard_data")) {
        return res.json(apiCache.get("dashboard_data"));
      }

      const result = await pool.query(
        `SELECT
             id,
             species,
             issue_description,
             priority,
             status,
             manual_address,
             latitude,
             longitude,
             image_payload,
             assigned_volunteer_id,
             created_at
           FROM rescue_cases
           ORDER BY created_at DESC
           LIMIT 100`,
      );

      if (!skipCache) {
        apiCache.set("dashboard_data", result.rows);
      }

      res.json(result.rows);
    } catch (err) {
      console.error("Dashboard query error:", err);

      res.status(500).json({
        error: "Failed to fetch dashboard records.",
      });
    }
  },
);

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

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`🚀 AniRescue API server listening on port ${port}`),
);

// --------------------------------------------------
// GRACEFUL SHUTDOWN
// --------------------------------------------------
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down services cleanly...`);

  try {
    if (server?.close) {
      server.close(() => console.log("HTTP server terminated."));
    }

    if (rabbitChannel) {
      await rabbitChannel.close();
    }

    if (rabbitConnection) {
      await rabbitConnection.close();
    }

    if (pool) {
      await pool.end();
    }

    process.exit(0);
  } catch (err) {
    console.error("Shutdown error:", err);

    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
