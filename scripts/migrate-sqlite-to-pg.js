/**
 * One-shot SQLite (movies.db) -> PostgreSQL migration.
 * Expects DATABASE_URL and a reachable Postgres (e.g. docker compose up -d).
 * Drops existing PostgreSQL tables whose names match SQLite user tables, then recreates and loads.
 * Does not drop the `users` table (registration).
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { Pool } = require("pg");
require("dotenv").config();

const SQLITE_PATH = path.join(__dirname, "..", "movies.db");
const BATCH = 1500;

function qIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqliteAffinity(type) {
  const t = (type || "").toUpperCase();
  if (t.includes("INT")) return "integer";
  if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) return "text";
  if (t.includes("BLOB")) return "blob";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "real";
  return "numeric";
}

function pgTypeForColumn(col, singleIntPk) {
  const aff = sqliteAffinity(col.type);
  if (singleIntPk && col.pk === 1 && aff === "integer") {
    return "BIGINT";
  }
  if (aff === "integer") return "BIGINT";
  if (aff === "real") return "DOUBLE PRECISION";
  if (aff === "blob") return "BYTEA";
  return "TEXT";
}

function getSqliteTables(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    )
    .all()
    .map((r) => r.name);
}

function tableInfo(db, table) {
  return db.prepare(`PRAGMA table_info(${qIdent(table)})`).all();
}

function foreignKeys(db, table) {
  try {
    return db.prepare(`PRAGMA foreign_key_list(${qIdent(table)})`).all();
  } catch {
    return [];
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Set DATABASE_URL (see .env.example)");
    process.exit(1);
  }
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error("Missing SQLite file:", SQLITE_PATH);
    process.exit(1);
  }

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pool = new Pool({ connectionString: databaseUrl });

  const tables = getSqliteTables(sqlite);
  if (tables.length === 0) {
    console.error("No tables found in SQLite.");
    process.exit(1);
  }

  console.log("SQLite tables:", tables.join(", "));

  const fkDeferred = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const t of tables) {
      if (t === "users") {
        console.warn('Skipping SQLite table named "users" to avoid clashing with app users table.');
        continue;
      }
      await client.query(`DROP TABLE IF EXISTS ${qIdent(t)} CASCADE`);
    }

    for (const table of tables) {
      if (table === "users") continue;

      const cols = tableInfo(sqlite, table);
      if (cols.length === 0) continue;

      const pkCols = cols.filter((c) => c.pk === 1);
      const singleIntPk =
        pkCols.length === 1 && sqliteAffinity(pkCols[0].type) === "integer";

      const colDefs = cols.map((c) => {
        const typ = pgTypeForColumn(c, singleIntPk && pkCols[0].name === c.name);
        let line = `${qIdent(c.name)} ${typ}`;
        if (c.notnull === 1 && c.pk !== 1) line += " NOT NULL";
        return line;
      });

      if (pkCols.length > 0) {
        const pkList = pkCols.map((c) => qIdent(c.name)).join(", ");
        colDefs.push(`PRIMARY KEY (${pkList})`);
      }

      const createSql = `CREATE TABLE ${qIdent(table)} (\n  ${colDefs.join(",\n  ")}\n)`;
      await client.query(createSql);

      const fks = foreignKeys(sqlite, table);
      for (const fk of fks) {
        fkDeferred.push({
          table,
          from: fk.from,
          toTable: fk.table,
          toCol: fk.to,
        });
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
    sqlite.close();
    throw e;
  }
  client.release();

  for (const table of tables) {
    if (table === "users") continue;

    const cols = tableInfo(sqlite, table);
    if (cols.length === 0) continue;

    const colNames = cols.map((c) => c.name);
    const quotedCols = colNames.map(qIdent).join(", ");
    const placeholders = colNames.map((_, i) => `$${i + 1}`).join(", ");
    const insertSql = `INSERT INTO ${qIdent(table)} (${quotedCols}) VALUES (${placeholders})`;

    const selectStmt = sqlite.prepare(`SELECT ${colNames.map(qIdent).join(", ")} FROM ${qIdent(table)}`);
    selectStmt.raw(true);

    async function flushChunk(chunk) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        for (const row of chunk) {
          const values = row.map((v, idx) => {
            const col = cols[idx];
            if (v == null) return null;
            const aff = sqliteAffinity(col.type);
            if (aff === "blob" && Buffer.isBuffer(v)) return v;
            if (aff === "blob" && v instanceof Uint8Array) return Buffer.from(v);
            return v;
          });
          await c.query(insertSql, values);
        }
        await c.query("COMMIT");
      } catch (err) {
        await c.query("ROLLBACK");
        c.release();
        await pool.end();
        sqlite.close();
        throw err;
      }
      c.release();
    }

    let batch = [];
    let total = 0;
    let lastLog = 0;
    for (const row of selectStmt.iterate()) {
      batch.push(row);
      if (batch.length >= BATCH) {
        await flushChunk(batch);
        total += batch.length;
        batch = [];
        if (total - lastLog >= BATCH * 20) {
          console.log(`  ${table}: ${total} rows...`);
          lastLog = total;
        }
      }
    }
    if (batch.length) {
      await flushChunk(batch);
      total += batch.length;
    }
    console.log(`Loaded ${table}: ${total} rows`);
  }

  const c2 = await pool.connect();
  try {
    for (const fk of fkDeferred) {
      const constraintName = `${fk.table}_${fk.from}_fkey`.replace(/[^a-zA-Z0-9_]/g, "_");
      const sql = `
        ALTER TABLE ${qIdent(fk.table)}
        ADD CONSTRAINT ${qIdent(constraintName)}
        FOREIGN KEY (${qIdent(fk.from)})
        REFERENCES ${qIdent(fk.toTable)} (${qIdent(fk.toCol)})
      `;
      try {
        await c2.query(sql);
      } catch (e) {
        console.warn("Skipping FK (may be invalid or duplicate):", constraintName, e.message);
      }
    }
  } finally {
    c2.release();
  }

  sqlite.close();
  await pool.end();
  console.log("Migration finished.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
