const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");

const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");
const LOCK_KEY = 918273645;

function filesafeMigrationName(version) {
  const names = {
    1: "001_initial_schema.sql",
    2: "002_phase2_rbac_and_evidence.sql",
    3: "003_role_profiles_and_ngo_coverage.sql",
    4: "004_ngo_volunteers.sql",
    5: "005_notifications.sql",
  };
  return names[version] || `migration-${version}`;
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);

    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );

    const appliedRows = await client.query(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    const applied = new Set(appliedRows.rows.map((row) => Number(row.version)));

    const baseline = Number.parseInt(
      process.env.MIGRATIONS_BASELINE_VERSION || "0",
      10,
    );

    if (!Number.isInteger(baseline) || baseline < 0 || baseline > 5) {
      throw new Error("MIGRATIONS_BASELINE_VERSION must be an integer from 0 to 5.");
    }

    if (applied.size === 0 && baseline > 0) {
      const requiredBaseTables = ["users", "rescue_cases"];

      const tableChecks = await Promise.all(
        requiredBaseTables.map((tableName) =>
          client.query(
            `SELECT to_regclass($1) IS NOT NULL AS exists`,
            [tableName],
          ),
        ),
      );

      const missingTables = requiredBaseTables.filter(
        (_, index) => !tableChecks[index].rows[0]?.exists,
      );

      if (missingTables.length > 0) {
        throw new Error(
          `Cannot baseline migrations 1-${baseline}: missing required existing schema tables: ${missingTables.join(", ")}. Provision the original AniRescue database schema first.`,
        );
      }

      for (let version = 1; version <= baseline; version += 1) {
        const name = filesafeMigrationName(version);
        await client.query(
          `INSERT INTO schema_migrations (version, name)
           VALUES ($1, $2)
           ON CONFLICT (version) DO NOTHING`,
          [version, name],
        );
        applied.add(version);
      }

      console.log(`Verified required base tables and recorded migration baseline through version ${baseline}.`);
    }

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort((a, b) => Number(a) - Number(b));

    for (const file of files) {
      const version = Number(file.match(/^\d+/)[0]);
      if (applied.has(version)) continue;

      if (version <= 5) {
        throw new Error(
          `Migration ${file} is pending. The repository does not contain the original base schema; verify the existing database before startup.`,
        );
      }

      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, file),
        "utf8",
      );

      console.log(`Applying migration ${file}...`);
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (version, name)
         VALUES ($1, $2)
         ON CONFLICT (version) DO NOTHING`,
        [version, file],
      );
      console.log(`Migration ${file} applied.`);
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    } catch {}
    client.release();
  }
}

module.exports = { runMigrations };
