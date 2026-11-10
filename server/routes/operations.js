const express = require('express');
const { sql, sqlOne } = require('../db');

const ALLOWED_TYPES = new Set(['sale', 'purchase', 'expense']);

function parseDate(value) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function validateOperationBody(body, { partial = false } = {}) {
  const errors = [];
  const result = {};

  if (!partial || body.type !== undefined) {
    const type = String(body.type || '').trim();
    if (!ALLOWED_TYPES.has(type)) {
      errors.push('type должен быть sale, purchase или expense');
    } else {
      result.type = type;
    }
  }

  if (!partial || body.quantity !== undefined) {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      errors.push('quantity должно быть целым числом > 0');
    } else {
      result.quantity = quantity;
    }
  }

  if (!partial || body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push('amount должно быть числом ≥ 0');
    } else {
      result.amount = amount;
    }
  }

  if (!partial || body.comment !== undefined) {
    const comment = body.comment == null ? null : String(body.comment).trim();
    result.comment = comment || null;
  }

  if (!partial || body.product_id !== undefined) {
    if (body.product_id === null || body.product_id === undefined || body.product_id === '') {
      result.product_id = null;
    } else {
      const productId = Number(body.product_id);
      if (!Number.isInteger(productId) || productId <= 0) {
        errors.push('product_id некорректен');
      } else {
        result.product_id = productId;
      }
    }
  }

  if (!partial || body.date !== undefined) {
    if (body.date === undefined) {
      result.date = new Date().toISOString();
    } else {
      const date = parseDate(body.date);
      if (!date) errors.push('date некорректна');
      else result.date = date;
    }
  }

  return { errors, result };
}

function createOperationsRouter() {
  const router = express.Router();

  const selectSql = `
    SELECT
      o.id, o.type, o.product_id, o.quantity, o.amount, o.comment, o.date,
      p.name AS product_name,
      c.name AS category_name,
      c.id AS category_id
    FROM operations o
    LEFT JOIN products p ON p.id = o.product_id
    LEFT JOIN categories c ON c.id = p.category_id
  `;

  router.get('/', async (req, res, next) => {
    try {
      const type = String(req.query.type || '').trim();
      const period = String(req.query.period || '').trim();
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const where = [];
      const params = [];

      if (ALLOWED_TYPES.has(type)) {
        params.push(type);
        where.push(`o.type = $${params.length}`);
      }

      if (period === 'month') {
        const { start, end } = monthBounds();
        params.push(start);
        const startIdx = params.length;
        params.push(end);
        const endIdx = params.length;
        where.push(`o.date >= $${startIdx} AND o.date < $${endIdx}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      params.push(limit);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;

      const rows = await sql(
        `${selectSql}
         ${whereSql}
         ORDER BY o.date DESC, o.id DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );

      const countParams = params.slice(0, params.length - 2);
      const totalRow = await sqlOne(
        `SELECT COUNT(*)::int AS c FROM operations o ${whereSql}`,
        countParams
      );

      res.json({ items: rows, total: totalRow?.c ?? 0, limit, offset });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { errors, result } = validateOperationBody(req.body || {});
      if (errors.length) {
        return res.status(400).json({ error: errors.join('; ') });
      }

      if (result.type === 'expense') {
        if (!result.comment) {
          return res.status(400).json({ error: 'Для расходника комментарий обязателен' });
        }
        result.product_id = null;
      } else if (!result.product_id) {
        return res.status(400).json({ error: 'Для продажи/закупки нужен product_id' });
      }

      if (result.product_id) {
        const product = await sqlOne('SELECT id FROM products WHERE id = $1', [result.product_id]);
        if (!product) {
          return res.status(400).json({ error: 'Товар не найден' });
        }
      }

      const inserted = await sqlOne(
        `INSERT INTO operations (type, product_id, quantity, amount, comment, date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          result.type,
          result.product_id,
          result.quantity,
          result.amount,
          result.comment,
          result.date,
        ]
      );

      const row = await sqlOne(`${selectSql} WHERE o.id = $1`, [inserted.id]);
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Некорректный id' });
      }

      const existing = await sqlOne('SELECT * FROM operations WHERE id = $1', [id]);
      if (!existing) {
        return res.status(404).json({ error: 'Операция не найдена' });
      }

      const { errors, result } = validateOperationBody(req.body || {}, { partial: true });
      if (errors.length) {
        return res.status(400).json({ error: errors.join('; ') });
      }

      const nextOp = {
        type: result.type ?? existing.type,
        product_id: result.product_id !== undefined ? result.product_id : existing.product_id,
        quantity: result.quantity ?? existing.quantity,
        amount: result.amount ?? existing.amount,
        comment: result.comment !== undefined ? result.comment : existing.comment,
        date: result.date ?? existing.date,
      };

      if (nextOp.type === 'expense') {
        if (!nextOp.comment) {
          return res.status(400).json({ error: 'Для расходника комментарий обязателен' });
        }
        nextOp.product_id = null;
      } else if (!nextOp.product_id) {
        return res.status(400).json({ error: 'Для продажи/закупки нужен product_id' });
      }

      if (nextOp.product_id) {
        const product = await sqlOne('SELECT id FROM products WHERE id = $1', [nextOp.product_id]);
        if (!product) {
          return res.status(400).json({ error: 'Товар не найден' });
        }
      }

      await sql(
        `UPDATE operations
         SET type = $1, product_id = $2, quantity = $3, amount = $4, comment = $5, date = $6
         WHERE id = $7`,
        [nextOp.type, nextOp.product_id, nextOp.quantity, nextOp.amount, nextOp.comment, nextOp.date, id]
      );

      const row = await sqlOne(`${selectSql} WHERE o.id = $1`, [id]);
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Некорректный id' });
      }

      const deleted = await sqlOne(
        'DELETE FROM operations WHERE id = $1 RETURNING id',
        [id]
      );
      if (!deleted) {
        return res.status(404).json({ error: 'Операция не найдена' });
      }
      res.json({ ok: true, id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createOperationsRouter, monthBounds };
