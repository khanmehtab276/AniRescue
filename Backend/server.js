require("dotenv").config();

// --------------------------------------------------
// REQUIRED ENVIRONMENT VARIABLES
// --------------------------------------------------
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  console.error("❌ JWT_SECRET must be set and contain at least 32 characters.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing from environment variables.");
  process.exit(1);
}

const app = require("./src/app");
const { pool, ensureDbConnection, startKeepalive } = require("./src/config/db");
const { connectRabbitMQ, closeRabbitMQ } = require("./src/config/rabbitmq");
const {
  startCaseNotificationConsumer,
} = require("./src/services/caseNotificationConsumer");
const {
  startCaseProcessingDispatcher,
  stopCaseProcessingDispatcher,
} = require("./src/services/caseProcessingDispatcher");
const {
  startAiProcessingWatchdog,
  stopAiProcessingWatchdog,
} = require("./src/services/aiProcessingWatchdog");
const { runMigrations } = require("./src/services/migrations");

const port = process.env.PORT || 3000;

let server;
let notificationConsumerTimer;

async function start() {
  try {
    await ensureDbConnection();
    await runMigrations();

    startKeepalive();

    await connectRabbitMQ();
    startCaseProcessingDispatcher();
    startAiProcessingWatchdog();
    await startCaseNotificationConsumer();

    notificationConsumerTimer = setInterval(() => {
      startCaseNotificationConsumer().catch((error) => {
        console.error(
          "Notification consumer reconnect check failed:",
          error?.message || error,
        );
      });
    }, 5000);
    notificationConsumerTimer.unref?.();

    server = app.listen(port, "0.0.0.0", () =>
      console.log(`🚀 AniRescue API server listening on port ${port}`),
    );
  } catch (error) {
    console.error("❌ AniRescue startup failed:", error?.stack || error);
    process.exit(1);
  }
}

start();


// --------------------------------------------------
// GRACEFUL SHUTDOWN
// --------------------------------------------------
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down services cleanly...`);

  try {
    if (server?.close) {
      server.close(() => console.log("HTTP server terminated."));
    }

    if (notificationConsumerTimer) clearInterval(notificationConsumerTimer);
    stopCaseProcessingDispatcher();
    stopAiProcessingWatchdog();
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
