const express = require('express');
const { monthBounds } = require('./operations');

function createAnalyticsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const period = String(req.query.period || 'month');
    const params = [];
    let dateFilter = '';

    if (period === 'month') {
      const { start, end } = monthBounds();
      dateFilter = 'AND o.date >= ? AND o.date < ?';
      params.push(start, end);
    }

    const summary = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN type IN ('purchase', 'expense') THEN amount ELSE 0 END), 0) AS costs,
           COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0) AS purchases,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END), 0) AS sold_qty,
           COALESCE(COUNT(CASE WHEN type = 'sale' THEN 1 END), 0) AS sale_count
         FROM operations o
         WHERE 1=1 ${dateFilter}`
      )
      .get(...params);

    const revenue = Number(summary.revenue) || 0;
    const costs = Number(summary.costs) || 0;
    const profit = revenue - costs;
    const saleCount = Number(summary.sale_count) || 0;
    const averageCheck = saleCount > 0 ? revenue / saleCount : 0;

    // Dynamics: by day for month, by month for all
    let dynamics;
    if (period === 'month') {
      dynamics = db
        .prepare(
          `SELECT
             DATE(o.date) AS bucket,
             COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
             COALESCE(SUM(CASE WHEN type IN ('purchase', 'expense') THEN amount ELSE 0 END), 0) AS costs
           FROM operations o
           WHERE 1=1 ${dateFilter}
           GROUP BY DATE(o.date)
           ORDER BY bucket`
        )
        .all(...params)
        .map((row) => ({
          label: row.bucket,
          revenue: row.revenue,
          costs: row.costs,
          profit: row.revenue - row.costs,
        }));
    } else {
      dynamics = db
        .prepare(
          `SELECT
             strftime('%Y-%m', o.date) AS bucket,
             COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
             COALESCE(SUM(CASE WHEN type IN ('purchase', 'expense') THEN amount ELSE 0 END), 0) AS costs
           FROM operations o
           GROUP BY strftime('%Y-%m', o.date)
           ORDER BY bucket`
        )
        .all()
        .map((row) => ({
          label: row.bucket,
          revenue: row.revenue,
          costs: row.costs,
          profit: row.revenue - row.costs,
        }));
    }

    // Weekday: SQLite strftime('%w') 0=Sunday
    const weekdayRaw = db
      .prepare(
        `SELECT
           CAST(strftime('%w', o.date) AS INTEGER) AS weekday,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END), 0) AS quantity
         FROM operations o
         WHERE o.type = 'sale' ${dateFilter}
         GROUP BY weekday
         ORDER BY weekday`
      )
      .all(...params);

    const weekdayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const byWeekday = weekdayNames.map((name, idx) => {
      const found = weekdayRaw.find((r) => r.weekday === idx);
      return {
        weekday: idx,
        label: name,
        revenue: found ? found.revenue : 0,
        quantity: found ? found.quantity : 0,
      };
    });

    const byMonth = db
      .prepare(
        `SELECT
           strftime('%Y-%m', o.date) AS month,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END), 0) AS quantity
         FROM operations o
         WHERE o.type = 'sale' ${dateFilter}
         GROUP BY month
         ORDER BY month`
      )
      .all(...params);

    const byCategory = db
      .prepare(
        `SELECT
           COALESCE(c.id, 0) AS category_id,
           COALESCE(c.name, 'Без группы') AS category_name,
           COALESCE(SUM(o.amount), 0) AS revenue,
           COALESCE(SUM(o.quantity), 0) AS quantity
         FROM operations o
         LEFT JOIN products p ON p.id = o.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE o.type = 'sale' ${dateFilter}
         GROUP BY COALESCE(c.id, 0), COALESCE(c.name, 'Без группы')
         ORDER BY revenue DESC`
      )
      .all(...params);

    const categoryTotal = byCategory.reduce((s, r) => s + r.revenue, 0) || 1;
    const topGroups = byCategory.map((r) => ({
      ...r,
      share: Math.round((r.revenue / categoryTotal) * 1000) / 10,
    }));

    const topProducts = db
      .prepare(
        `SELECT
           p.id AS product_id,
           p.name AS product_name,
           c.name AS category_name,
           COALESCE(SUM(o.quantity), 0) AS quantity,
           COALESCE(SUM(o.amount), 0) AS revenue
         FROM operations o
         JOIN products p ON p.id = o.product_id
         JOIN categories c ON c.id = p.category_id
         WHERE o.type = 'sale' ${dateFilter}
         GROUP BY p.id
         ORDER BY revenue DESC
         LIMIT 10`
      )
      .all(...params);

    // Dead stock: purchased, sold least (including never sold)
    const deadStock = db
      .prepare(
        `SELECT
           p.id AS product_id,
           p.name AS product_name,
           c.name AS category_name,
           COALESCE(SUM(CASE WHEN o.type = 'purchase' THEN o.quantity ELSE 0 END), 0) AS purchased_qty,
           COALESCE(SUM(CASE WHEN o.type = 'sale' THEN o.quantity ELSE 0 END), 0) AS sold_qty,
           COALESCE(SUM(CASE WHEN o.type = 'purchase' THEN o.amount ELSE 0 END), 0) AS purchase_amount
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN operations o ON o.product_id = p.id
         GROUP BY p.id
         HAVING purchased_qty > 0
         ORDER BY sold_qty ASC, purchase_amount DESC
         LIMIT 10`
      )
      .all();

    res.json({
      period: period === 'all' ? 'all' : 'month',
      summary: {
        revenue,
        costs,
        purchases: Number(summary.purchases) || 0,
        expenses: Number(summary.expenses) || 0,
        profit,
        sold_qty: Number(summary.sold_qty) || 0,
        sale_count: saleCount,
        average_check: Math.round(averageCheck * 100) / 100,
      },
      dynamics,
      by_weekday: byWeekday,
      by_month: byMonth,
      by_category: byCategory,
      top_products: topProducts,
      top_groups: topGroups,
      dead_stock: deadStock,
    });
  });

  return router;
}

module.exports = { createAnalyticsRouter };
