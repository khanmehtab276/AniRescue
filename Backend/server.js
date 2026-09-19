require("dotenv").config();

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

const app = require("./src/app");
const { pool, ensureDbConnection, startKeepalive } = require("./src/config/db");
const { connectRabbitMQ, closeRabbitMQ } = require("./src/config/rabbitmq");

const port = process.env.PORT || 3000;

// --------------------------------------------------
// STARTUP: DB + RABBITMQ
// --------------------------------------------------
ensureDbConnection().catch((err) =>
  console.error("Database connection initialization error:", err),
);

startKeepalive();

connectRabbitMQ().catch((err) =>
  console.error("RabbitMQ initialization error:", err),
);

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

    await closeRabbitMQ();

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
