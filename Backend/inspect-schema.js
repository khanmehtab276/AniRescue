require("dotenv").config();
const { Client } = require("pg");

async function inspectSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    console.log("✅ Connected to Neon PostgreSQL\n");

    // Tables
    const tables = await client.query(`
      SELECT
        table_schema,
        table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name;
    `);

    console.log("========== TABLES ==========\n");

    for (const row of tables.rows) {
      console.log(`${row.table_schema}.${row.table_name}`);
    }

    // Columns
    const columns = await client.query(`
      SELECT
        table_schema,
        table_name,
        ordinal_position,
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name, ordinal_position;
    `);

    console.log("\n========== COLUMNS ==========\n");

    let currentTable = "";

    for (const row of columns.rows) {
      const table = `${row.table_schema}.${row.table_name}`;

      if (table !== currentTable) {
        currentTable = table;
        console.log(`\n--- ${table} ---`);
      }

      console.log(
        `${row.ordinal_position}. ${row.column_name} | ` +
        `${row.data_type} | ` +
        `nullable=${row.is_nullable} | ` +
        `default=${row.column_default ?? "NULL"}`
      );
    }

    // Foreign keys
    const foreignKeys = await client.query(`
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY tc.table_schema, tc.table_name, tc.constraint_name;
    `);

    console.log("\n========== FOREIGN KEYS ==========\n");

    for (const row of foreignKeys.rows) {
      console.log(
        `${row.table_schema}.${row.table_name}.${row.column_name} ` +
        `→ ${row.foreign_table_schema}.${row.foreign_table_name}.${row.foreign_column_name} ` +
        `(${row.constraint_name})`
      );
    }

    // Primary keys
    const primaryKeys = await client.query(`
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position;
    `);

    console.log("\n========== PRIMARY KEYS ==========\n");

    for (const row of primaryKeys.rows) {
      console.log(
        `${row.table_schema}.${row.table_name}.${row.column_name} ` +
        `(${row.constraint_name})`
      );
    }

    // Indexes
    const indexes = await client.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename, indexname;
    `);

    console.log("\n========== INDEXES ==========\n");

    for (const row of indexes.rows) {
      console.log(`${row.schemaname}.${row.tablename}`);
      console.log(`  ${row.indexname}`);
      console.log(`  ${row.indexdef}\n`);
    }

    console.log("\n✅ Schema inspection complete.");
  } catch (err) {
    console.error("❌ Schema inspection failed:");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

inspectSchema();
