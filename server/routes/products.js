const express = require('express');
const { sql, sqlOne, ensureFixedCategories } = require('../db');
const { FIXED_CATEGORY_NAMES } = require('../fixedCategories');

function createProductsRouter() {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const search = String(req.query.search || '').trim();
      let rows;

      if (search) {
        rows = await sql(
          `SELECT p.id, p.name, p.category_id, p.created_at, c.name AS category_name
           FROM products p
           JOIN categories c ON c.id = p.category_id
           WHERE LOWER(p.name) LIKE LOWER($1)
           ORDER BY p.name
           LIMIT 50`,
          [`%${search}%`]
        );
      } else {
        rows = await sql(
          `SELECT p.id, p.name, p.category_id, p.created_at, c.name AS category_name
           FROM products p
           JOIN categories c ON c.id = p.category_id
           ORDER BY p.name
           LIMIT 100`
        );
      }

      // Always a bare JSON array — never a pg Result wrapper / object.
      res.status(200).type('json').send(JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const name = String(req.body?.name || '').trim();
      const categoryName = String(req.body?.category_name || '').trim();
      let categoryId = Number(req.body?.category_id);

      if (!name) {
        return res.status(400).json({ error: 'Укажите название товара' });
      }

      if ((!Number.isInteger(categoryId) || categoryId <= 0) && categoryName) {
        if (!FIXED_CATEGORY_NAMES.includes(categoryName)) {
          return res.status(400).json({ error: 'Неизвестная группа' });
        }
        await ensureFixedCategories();
        const byName = await sqlOne('SELECT id FROM categories WHERE name = $1', [categoryName]);
        categoryId = byName ? Number(byName.id) : NaN;
      }

      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({ error: 'Укажите категорию' });
      }

      const category = await sqlOne('SELECT id FROM categories WHERE id = $1', [categoryId]);
      if (!category) {
        return res.status(400).json({ error: 'Категория не найдена' });
      }

      const existing = await sqlOne(
        'SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND category_id = $2',
        [name, categoryId]
      );
      if (existing) {
        const product = await sqlOne(
          `SELECT p.id, p.name, p.category_id, p.created_at, c.name AS category_name
           FROM products p
           JOIN categories c ON c.id = p.category_id
           WHERE p.id = $1`,
          [existing.id]
        );
        return res.status(200).json(product);
      }

      const inserted = await sqlOne(
        `INSERT INTO products (name, category_id)
         VALUES ($1, $2)
         RETURNING id`,
        [name, categoryId]
      );

      const product = await sqlOne(
        `SELECT p.id, p.name, p.category_id, p.created_at, c.name AS category_name
         FROM products p
         JOIN categories c ON c.id = p.category_id
         WHERE p.id = $1`,
        [inserted.id]
      );

      res.status(201).json(product);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createProductsRouter };
