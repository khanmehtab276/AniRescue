const { Pool } = require("pg");

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
// DATABASE CONNECTION INITIALIZATION (exponential backoff)
// --------------------------------------------------
const ensureDbConnection = async () => {
  let attempt = 0;
  const maxDelay = 60000;

  while (true) {
    try {
      attempt += 1;

      const client = await pool.connect();

      console.log(`✅ Connected to Neon PostgreSQL Database (attempt ${attempt})`);

      client.release();
      break;
    } catch (err) {
      const base = 1000;

      const delay = Math.min(maxDelay, base * Math.pow(2, Math.max(0, attempt - 1)));

      const jitter = Math.floor(Math.random() * 1000);

      console.error(`Database connection attempt ${attempt} failed:`, err?.message || err);

      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }
};

// --------------------------------------------------
// DATABASE KEEPALIVE
// --------------------------------------------------
const startKeepalive = () => {
  setInterval(() => {
    pool
      .query("SELECT 1")
      .catch((err) => console.warn("DB keepalive failed:", err?.message || err));
  }, 60 * 1000);
};

module.exports = { pool, ensureDbConnection, startKeepalive };
