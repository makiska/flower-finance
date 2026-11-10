const express = require('express');

function createProductsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const search = String(req.query.search || '').trim();
    let rows;

    if (search) {
      rows = db
        .prepare(
          `SELECT p.id, p.name, p.category_id, p.created_at, c.name AS category_name
           FROM products p
           JOIN categories c ON c.id = p.category_id
           WHERE LOWER(p.name) LIKE LOWER(?)
           ORDER BY p.name
           LIMIT 50`
        )
        .all(`%${search}%`);
    } else {
      rows = db
        .prepare(
          `SELECT p.id, p.name, p.category_id, p.created_at, c.name AS category_name
           FROM products p
           JOIN categories c ON c.id = p.category_id
           ORDER BY p.name
           LIMIT 100`
        )
        .all();
    }

    res.json(rows);
  });

  router.post('/', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const categoryId = Number(req.body?.category_id);

    if (!name) {
      return res.status(400).json({ error: 'Укажите название товара' });
    }
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ error: 'Укажите категорию' });
    }

    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
    if (!category) {
      return res.status(400).json({ error: 'Категория не найдена' });
    }

    const existing = db
      .prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND category_id = ?')
      .get(name, categoryId);
    if (existing) {
      const product = db
        .prepare(
          `SELECT p.id, p.name, p.category_id, p.created_at, c.name AS category_name
           FROM products p
           JOIN categories c ON c.id = p.category_id
           WHERE p.id = ?`
        )
        .get(existing.id);
      return res.status(200).json(product);
    }

    const info = db
      .prepare('INSERT INTO products (name, category_id) VALUES (?, ?)')
      .run(name, categoryId);

    const product = db
      .prepare(
        `SELECT p.id, p.name, p.category_id, p.created_at, c.name AS category_name
         FROM products p
         JOIN categories c ON c.id = p.category_id
         WHERE p.id = ?`
      )
      .get(info.lastInsertRowid);

    res.status(201).json(product);
  });

  return router;
}

module.exports = { createProductsRouter };
