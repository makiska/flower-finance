const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'database.sqlite');

const DEFAULT_CATEGORIES = [
  'Ароидные',
  'Хойи',
  'Бегонии',
  'Папоротники',
  'Другие растения',
  'Расходники',
];

/** Old seed names → new canonical category */
const CATEGORY_REMAP = {
  Суккуленты: 'Другие растения',
  Плодовые: 'Другие растения',
  Прочее: 'Другие растения',
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'expense')),
      product_id INTEGER,
      quantity INTEGER NOT NULL DEFAULT 1,
      amount REAL NOT NULL,
      comment TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
    CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(date);
  `);
}

function ensureCategories(db) {
  const insert = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  for (const name of DEFAULT_CATEGORIES) {
    insert.run(name);
  }

  const byName = Object.fromEntries(
    db.prepare('SELECT id, name FROM categories').all().map((c) => [c.name, c.id])
  );

  const updateProduct = db.prepare('UPDATE products SET category_id = ? WHERE category_id = ?');
  const deleteCategory = db.prepare('DELETE FROM categories WHERE id = ?');

  const tx = db.transaction(() => {
    for (const [oldName, newName] of Object.entries(CATEGORY_REMAP)) {
      const oldId = byName[oldName];
      const newId = byName[newName];
      if (!oldId || !newId || oldId === newId) continue;
      updateProduct.run(newId, oldId);
      deleteCategory.run(oldId);
    }

    // Drop any leftover categories not in the canonical list
    const allowed = new Set(DEFAULT_CATEGORIES);
    const leftovers = db.prepare('SELECT id, name FROM categories').all();
    for (const row of leftovers) {
      if (allowed.has(row.name)) continue;
      const fallbackId = byName['Другие растения'] || byName[DEFAULT_CATEGORIES[0]];
      if (fallbackId) updateProduct.run(fallbackId, row.id);
      deleteCategory.run(row.id);
    }
  });
  tx();
}

function openDatabase() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  createSchema(db);
  ensureCategories(db);
  return db;
}

module.exports = {
  openDatabase,
  DB_PATH,
  DEFAULT_CATEGORIES,
};
