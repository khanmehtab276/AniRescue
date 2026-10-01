const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const MIGRATION_LOCK_KEY = "anirescue:migrations";

function getMigrations() {
  const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .map((file) => {
      const match = file.match(/^(\d+)_/);
      return { version: Number(match[1]), name: file };
    })
    .sort((a, b) => a.version - b.version);

  for (let i = 0; i < migrations.length; i += 1) {
    const expectedVersion = i + 1;

    if (migrations[i].version !== expectedVersion) {
      throw new Error(
        `Migration numbering must be contiguous starting at 001. Expected ${String(
          expectedVersion
        ).padStart(3, "0")} but found ${String(migrations[i].version).padStart(
          3,
          "0"
        )} (${migrations[i].name}).`
      );
    }

    if (
      i > 0 &&
      migrations[i - 1].version === migrations[i].version
    ) {
      throw new Error(
        `Duplicate migration version ${migrations[i].version}: "${migrations[
          i - 1
        ].name}" and "${migrations[i].name}".`
      );
    }
  }

  return migrations;
}

function withoutTransactionWrappers(sql) {
  return sql
    .replace(/^\s*BEGIN\s*;?/i, "")
    .replace(/COMMIT\s*;?\s*$/i, "")
    .trim();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      MIGRATION_LOCK_KEY,
    ]);

    // Bootstrap the ledger so migration 001 can be recorded on an empty DB.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrations = getMigrations();

    for (const migration of migrations) {
      const result = await client.query(
        "SELECT name FROM schema_migrations WHERE version = $1",
        [migration.version]
      );

      if (result.rowCount > 0) {
        if (result.rows[0].name !== migration.name) {
          throw new Error(
            `Migration version ${migration.version} is recorded as "${result.rows[0].name}" but the repository contains "${migration.name}". Resolve this history mismatch before continuing.`
          );
        }

        console.log(`✓ ${migration.name} already applied`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, migration.name);
      const sql = withoutTransactionWrappers(
        fs.readFileSync(filePath, "utf8")
      );

      console.log(`→ Applying ${migration.name}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (version, name)
           VALUES ($1, $2)`,
          [migration.version, migration.name]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      console.log(`✓ Applied ${migration.name}`);
    }

    console.log("Database migrations are up to date.");
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        MIGRATION_LOCK_KEY,
      ]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
