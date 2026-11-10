const express = require('express');

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

function createOperationsRouter(db) {
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

  router.get('/', (req, res) => {
    const type = String(req.query.type || '').trim();
    const period = String(req.query.period || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where = [];
    const params = [];

    if (ALLOWED_TYPES.has(type)) {
      where.push('o.type = ?');
      params.push(type);
    }

    if (period === 'month') {
      const { start, end } = monthBounds();
      where.push('o.date >= ? AND o.date < ?');
      params.push(start, end);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `${selectSql}
         ${whereSql}
         ORDER BY o.date DESC, o.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM operations o ${whereSql}`)
      .get(...params).c;

    res.json({ items: rows, total, limit, offset });
  });

  router.post('/', (req, res) => {
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
      const product = db.prepare('SELECT id FROM products WHERE id = ?').get(result.product_id);
      if (!product) {
        return res.status(400).json({ error: 'Товар не найден' });
      }
    }

    const info = db
      .prepare(
        `INSERT INTO operations (type, product_id, quantity, amount, comment, date)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        result.type,
        result.product_id,
        result.quantity,
        result.amount,
        result.comment,
        result.date
      );

    const row = db.prepare(`${selectSql} WHERE o.id = ?`).get(info.lastInsertRowid);
    res.status(201).json(row);
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный id' });
    }

    const existing = db.prepare('SELECT * FROM operations WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Операция не найдена' });
    }

    const { errors, result } = validateOperationBody(req.body || {}, { partial: true });
    if (errors.length) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    const next = {
      type: result.type ?? existing.type,
      product_id: result.product_id !== undefined ? result.product_id : existing.product_id,
      quantity: result.quantity ?? existing.quantity,
      amount: result.amount ?? existing.amount,
      comment: result.comment !== undefined ? result.comment : existing.comment,
      date: result.date ?? existing.date,
    };

    if (next.type === 'expense') {
      if (!next.comment) {
        return res.status(400).json({ error: 'Для расходника комментарий обязателен' });
      }
      next.product_id = null;
    } else if (!next.product_id) {
      return res.status(400).json({ error: 'Для продажи/закупки нужен product_id' });
    }

    if (next.product_id) {
      const product = db.prepare('SELECT id FROM products WHERE id = ?').get(next.product_id);
      if (!product) {
        return res.status(400).json({ error: 'Товар не найден' });
      }
    }

    db.prepare(
      `UPDATE operations
       SET type = ?, product_id = ?, quantity = ?, amount = ?, comment = ?, date = ?
       WHERE id = ?`
    ).run(next.type, next.product_id, next.quantity, next.amount, next.comment, next.date, id);

    const row = db.prepare(`${selectSql} WHERE o.id = ?`).get(id);
    res.json(row);
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный id' });
    }

    const info = db.prepare('DELETE FROM operations WHERE id = ?').run(id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Операция не найдена' });
    }
    res.json({ ok: true, id });
  });

  return router;
}

module.exports = { createOperationsRouter, monthBounds };
