const express = require('express');
const { sql, sqlOne, ensureFixedCategories } = require('../db');
const { listItems, createPersonalItem, detectSubgroup } = require('../catalog');

const PRODUCT_SELECT = `
  SELECT
    p.id,
    p.name,
    p.category_id,
    p.created_at,
    p.subgroup,
    p.user_id,
    p.is_preset,
    p.preset_id,
    p.shared,
    c.name AS category_name,
    (SELECT COUNT(*)::int FROM operations o WHERE o.product_id = p.id) AS operation_count
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

async function selectProduct(id) {
  return sqlOne(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
}

async function resolveCategoryId({ category_id, category_name, fallbackId }) {
  const categoryId = Number(category_id);
  if (Number.isInteger(categoryId) && categoryId > 0) {
    const category = await sqlOne('SELECT id FROM categories WHERE id = $1', [categoryId]);
    if (!category) return { error: 'Группа не найдена' };
    return { categoryId };
  }

  const categoryName = String(category_name || '').trim();
  if (!categoryName) {
    if (Number.isInteger(fallbackId) && fallbackId > 0) return { categoryId: fallbackId };
    return { error: 'Укажите группу' };
  }

  await ensureFixedCategories();
  const byName = await sqlOne(
    'SELECT id FROM categories WHERE LOWER(name) = LOWER($1)',
    [categoryName]
  );
  if (!byName) return { error: 'Неизвестная группа' };
  return { categoryId: Number(byName.id) };
}

async function findSameProduct(name, categoryId, exceptId = 0, userId = '') {
  return sqlOne(
    `SELECT id FROM products
     WHERE LOWER(name) = LOWER($1) AND category_id = $2 AND id <> $3
       AND is_preset = false AND user_id = $4`,
    [name, categoryId, exceptId, String(userId)]
  );
}

async function createProductHandler(req, res, next) {
  try {
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
    if (!name) {
      return res.status(400).json({ error: 'Укажите название' });
    }
    if (name.length > 120) {
      return res.status(400).json({ error: 'Название длиннее 120 символов' });
    }

    const resolved = await resolveCategoryId(req.body || {});
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }

    const created = await createPersonalItem({
      userId: req.auth?.userId,
      name,
      categoryId: resolved.categoryId,
    });
    if (created.error) {
      if (created.status === 409 && created.item && !req.body?.reject_duplicate) {
        return res.status(200).json(created.item);
      }
      return res.status(created.status).json({ error: created.error, product: created.item || undefined });
    }
    const product = created.item;
    res.status(created.status).json(product);
  } catch (err) {
    next(err);
  }
}

async function updateProductHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный id' });
    }

    const current = await selectProduct(id);
    if (!current) {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }
    if (current.is_preset) {
      return res.status(403).json({ error: 'Общую позицию нельзя изменить' });
    }
    if (!current.shared && String(current.user_id || '') !== String(req.auth?.userId || '')) {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    const name = String(req.body?.name ?? current.name).trim().replace(/\s+/g, ' ');
    if (!name) {
      return res.status(400).json({ error: 'Укажите название' });
    }
    if (name.length > 120) {
      return res.status(400).json({ error: 'Название длиннее 120 символов' });
    }

    const resolved = await resolveCategoryId({
      category_id: req.body?.category_id,
      category_name: req.body?.category_name,
      fallbackId: Number(current.category_id),
    });
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }

    const duplicate = await findSameProduct(name, resolved.categoryId, id, current.user_id);
    if (duplicate) {
      return res.status(409).json({ error: 'Такая позиция уже есть в этой группе' });
    }

    const category = await sqlOne('SELECT name FROM categories WHERE id = $1', [resolved.categoryId]);
    const detected = detectSubgroup(name, category?.name);
    await sql(
      'UPDATE products SET name = $1, category_id = $2, subgroup = $3 WHERE id = $4',
      [name, resolved.categoryId, detected || current.subgroup || null, id]
    );

    res.json(await selectProduct(id));
  } catch (err) {
    next(err);
  }
}

function createProductsRouter() {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const search = String(req.query.search || '').trim();
      const categoryId = Number(req.query.category_id);
      let rows = await listItems({ userId: req.auth?.userId, search });
      if (Number.isInteger(categoryId) && categoryId > 0) {
        rows = rows.filter((row) => Number(row.category_id) === categoryId);
      }
      res.status(200).type('json').send(JSON.stringify(rows));
    } catch (err) {
      next(err);
    }
  });

  router.post('/', createProductHandler);
  router.put('/:id', updateProductHandler);

  return router;
}

module.exports = {
  createProductsRouter,
  createProductHandler,
  updateProductHandler,
};
