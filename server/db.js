const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const pg = require('pg');
const { FIXED_CATEGORY_NAMES } = require('./fixedCategories');

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const migrationsDir = path.join(__dirname, '..', 'migrations');

let pool;
let local;

/**
 * Run a parameterized SQL query.
 * Uses platform Postgres when DATABASE_URL is set.
 * Otherwise PGlite: on disk when FLOWER_DATA_DIR is set, in memory when it is not.
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
  // FLOWER_DATA_DIR keeps the database outside the git checkout so deploys
  // do not wipe it. Unset locally, PGlite stays in memory.
  const dataDir = process.env.FLOWER_DATA_DIR?.trim() || '';
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  const files = (await readdir(migrationsDir).catch(() => []))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsDir, file), 'utf8'));
  }
  return db;
}

/** Idempotent seed of the six fixed groups (safe if migrate already inserted them). */
async function ensureFixedCategories() {
  for (const name of FIXED_CATEGORY_NAMES) {
    await sql(
      'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [name]
    );
  }
}

/**
 * Local: apply migrations via PGlite boot.
 * Postgres: schema comes from migrate.mjs on build; still re-seed fixed categories
 * so an empty live table cannot leave the create UI without groups.
 */
async function withTransaction(work) {
  if (databaseUrl !== '') {
    pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    const client = await pool.connect();
    const query = async (text, params = []) => asRows(await client.query(text, params));
    const queryOne = async (text, params = []) => (await query(text, params))[0] || null;
    try {
      await client.query('BEGIN');
      const result = await work(query, queryOne);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  await sql('BEGIN');
  try {
    const result = await work(sql, sqlOne);
    await sql('COMMIT');
    return result;
  } catch (error) {
    await sql('ROLLBACK');
    throw error;
  }
}

async function initDb() {
  if (databaseUrl === '') {
    await sql('SELECT 1');
  }
  await ensureFixedCategories();
  const { migrateExistingCatalog } = require('./catalog');
  return migrateExistingCatalog();
}

module.exports = {
  sql,
  sqlOne,
  withTransaction,
  initDb,
  ensureFixedCategories,
  usingPostgres: databaseUrl !== '',
};
