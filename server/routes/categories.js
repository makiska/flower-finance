const express = require('express');
const { sql, sqlOne, ensureFixedCategories } = require('../db');
const { FIXED_CATEGORY_NAMES } = require('../fixedCategories');

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

async function createCategoryHandler(req, res, next) {
  try {
    const name = cleanName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'Укажите название группы' });
    }
    if (name.length > 40) {
      return res.status(400).json({ error: 'Название группы длиннее 40 символов' });
    }

    await ensureFixedCategories();
    const existing = await sqlOne(
      'SELECT id, name FROM categories WHERE LOWER(name) = LOWER($1)',
      [name]
    );
    if (existing) {
      return res.status(409).json({ error: 'Такая группа уже есть', category: existing });
    }

    const inserted = await sqlOne(
      'INSERT INTO categories (name) VALUES ($1) RETURNING id, name',
      [name]
    );
    res.status(201).json(inserted);
  } catch (err) {
    next(err);
  }
}

async function updateCategoryHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный id' });
    }

    const current = await sqlOne('SELECT id, name FROM categories WHERE id = $1', [id]);
    if (!current) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }
    if (FIXED_CATEGORY_NAMES.includes(current.name)) {
      return res.status(400).json({ error: 'Основную группу нельзя переименовать' });
    }

    const name = cleanName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'Укажите название группы' });
    }
    if (name.length > 40) {
      return res.status(400).json({ error: 'Название группы длиннее 40 символов' });
    }

    const duplicate = await sqlOne(
      'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND id <> $2',
      [name, id]
    );
    if (duplicate) {
      return res.status(409).json({ error: 'Такая группа уже есть' });
    }

    const updated = await sqlOne(
      'UPDATE categories SET name = $1 WHERE id = $2 RETURNING id, name',
      [name, id]
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

function createCategoriesRouter() {
  const router = express.Router();

  router.get('/', async (_req, res, next) => {
    try {
      await ensureFixedCategories();
      const rows = await sql('SELECT id, name FROM categories ORDER BY name');
      res.status(200).type('json').send(JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch (err) {
      next(err);
    }
  });

  router.post('/', createCategoryHandler);
  router.put('/:id', updateCategoryHandler);

  return router;
}

module.exports = {
  createCategoriesRouter,
  createCategoryHandler,
  updateCategoryHandler,
};
