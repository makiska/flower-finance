const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const pg = require('pg');

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const migrationsDir = path.join(__dirname, '..', 'migrations');

let pool;
let local;

/**
 * Run a parameterized SQL query.
 * Uses platform Postgres when DATABASE_URL is set, otherwise in-memory PGlite.
 * Never log DATABASE_URL.
 */
function asRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function sql(text, params = []) {
  if (databaseUrl !== '') {
    pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    return asRows(await pool.query(text, params));
  }
  local ??= startLocal().catch((error) => {
    local = undefined;
    throw error;
  });
  return asRows(await (await local).query(text, params));
}

async function sqlOne(text, params = []) {
  const rows = await sql(text, params);
  return rows[0] || null;
}

async function startLocal() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const files = (await readdir(migrationsDir).catch(() => []))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDir, file), 'utf8'));
  }
  return db;
}

/** Ensure local/PGlite schema is ready (no-op when DATABASE_URL is set — migrate.mjs handles that). */
async function initDb() {
  if (databaseUrl === '') {
    await sql('SELECT 1');
  }
}

module.exports = {
  sql,
  sqlOne,
  initDb,
  usingPostgres: databaseUrl !== '',
};
