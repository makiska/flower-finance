const express = require('express');
const { sql, sqlOne, ensureFixedCategories } = require('../db');

const PRODUCT_SELECT = `
  SELECT
    p.id,
    p.name,
    p.category_id,
    p.created_at,
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

async function findSameProduct(name, categoryId, exceptId = 0) {
  return sqlOne(
    `SELECT id FROM products
     WHERE LOWER(name) = LOWER($1) AND category_id = $2 AND id <> $3`,
    [name, categoryId, exceptId]
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

    const existing = await findSameProduct(name, resolved.categoryId);
    if (existing) {
      const product = await selectProduct(existing.id);
      if (req.body?.reject_duplicate) {
        return res.status(409).json({ error: 'Такая позиция уже есть в этой группе', product });
      }
      return res.status(200).json(product);
    }

    const inserted = await sqlOne(
      `INSERT INTO products (name, category_id)
       VALUES ($1, $2)
       RETURNING id`,
      [name, resolved.categoryId]
    );

    res.status(201).json(await selectProduct(inserted.id));
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

    const duplicate = await findSameProduct(name, resolved.categoryId, id);
    if (duplicate) {
      return res.status(409).json({ error: 'Такая позиция уже есть в этой группе' });
    }

    await sql(
      'UPDATE products SET name = $1, category_id = $2 WHERE id = $3',
      [name, resolved.categoryId, id]
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
      const where = [];
      const params = [];

      if (search) {
        params.push(`%${search}%`);
        where.push(`LOWER(p.name) LIKE LOWER($${params.length})`);
      }
      if (Number.isInteger(categoryId) && categoryId > 0) {
        params.push(categoryId);
        where.push(`p.category_id = $${params.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await sql(
        `${PRODUCT_SELECT}
         ${whereSql}
         ORDER BY c.name, p.name
         LIMIT 500`,
        params
      );

      res.status(200).type('json').send(JSON.stringify(Array.isArray(rows) ? rows : []));
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
