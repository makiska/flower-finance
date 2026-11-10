const express = require('express');
const { sql } = require('../db');
const { monthBounds } = require('./operations');

function createAnalyticsRouter() {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const period = String(req.query.period || 'month');
      const params = [];
      let dateFilter = '';

      if (period === 'month') {
        const { start, end } = monthBounds();
        params.push(start, end);
        dateFilter = 'AND o.date >= $1 AND o.date < $2';
      }

      const summaryRows = await sql(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN type IN ('purchase', 'expense') THEN amount ELSE 0 END), 0) AS costs,
           COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0) AS purchases,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END), 0) AS sold_qty,
           COALESCE(COUNT(CASE WHEN type = 'sale' THEN 1 END), 0) AS sale_count
         FROM operations o
         WHERE 1=1 ${dateFilter}`,
        params
      );
      const summary = summaryRows[0] || {};

      const revenue = Number(summary.revenue) || 0;
      const costs = Number(summary.costs) || 0;
      const profit = revenue - costs;
      const saleCount = Number(summary.sale_count) || 0;
      const averageCheck = saleCount > 0 ? revenue / saleCount : 0;

      let dynamics;
      if (period === 'month') {
        const rows = await sql(
          `SELECT
             (o.date AT TIME ZONE 'UTC')::date::text AS bucket,
             COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
             COALESCE(SUM(CASE WHEN type IN ('purchase', 'expense') THEN amount ELSE 0 END), 0) AS costs
           FROM operations o
           WHERE 1=1 ${dateFilter}
           GROUP BY (o.date AT TIME ZONE 'UTC')::date
           ORDER BY bucket`,
          params
        );
        dynamics = rows.map((row) => ({
          label: row.bucket,
          revenue: Number(row.revenue) || 0,
          costs: Number(row.costs) || 0,
          profit: (Number(row.revenue) || 0) - (Number(row.costs) || 0),
        }));
      } else {
        const rows = await sql(
          `SELECT
             to_char(o.date AT TIME ZONE 'UTC', 'YYYY-MM') AS bucket,
             COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
             COALESCE(SUM(CASE WHEN type IN ('purchase', 'expense') THEN amount ELSE 0 END), 0) AS costs
           FROM operations o
           GROUP BY to_char(o.date AT TIME ZONE 'UTC', 'YYYY-MM')
           ORDER BY bucket`
        );
        dynamics = rows.map((row) => ({
          label: row.bucket,
          revenue: Number(row.revenue) || 0,
          costs: Number(row.costs) || 0,
          profit: (Number(row.revenue) || 0) - (Number(row.costs) || 0),
        }));
      }

      // EXTRACT(DOW …) 0=Sunday — same as SQLite strftime('%w')
      const weekdayRaw = await sql(
        `SELECT
           EXTRACT(DOW FROM o.date AT TIME ZONE 'UTC')::int AS weekday,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END), 0) AS quantity
         FROM operations o
         WHERE o.type = 'sale' ${dateFilter}
         GROUP BY weekday
         ORDER BY weekday`,
        params
      );

      const weekdayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const byWeekday = weekdayNames.map((name, idx) => {
        const found = weekdayRaw.find((r) => Number(r.weekday) === idx);
        return {
          weekday: idx,
          label: name,
          revenue: found ? Number(found.revenue) || 0 : 0,
          quantity: found ? Number(found.quantity) || 0 : 0,
        };
      });

      const byMonth = (await sql(
        `SELECT
           to_char(o.date AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END), 0) AS quantity
         FROM operations o
         WHERE o.type = 'sale' ${dateFilter}
         GROUP BY month
         ORDER BY month`,
        params
      )).map((r) => ({
        month: r.month,
        revenue: Number(r.revenue) || 0,
        quantity: Number(r.quantity) || 0,
      }));

      const byCategory = (await sql(
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
         ORDER BY revenue DESC`,
        params
      )).map((r) => ({
        category_id: Number(r.category_id) || 0,
        category_name: r.category_name,
        revenue: Number(r.revenue) || 0,
        quantity: Number(r.quantity) || 0,
      }));

      const categoryTotal = byCategory.reduce((s, r) => s + r.revenue, 0) || 1;
      const topGroups = byCategory.map((r) => ({
        ...r,
        share: Math.round((r.revenue / categoryTotal) * 1000) / 10,
      }));

      const topProducts = (await sql(
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
         GROUP BY p.id, p.name, c.name
         ORDER BY revenue DESC
         LIMIT 10`,
        params
      )).map((r) => ({
        product_id: Number(r.product_id),
        product_name: r.product_name,
        category_name: r.category_name,
        quantity: Number(r.quantity) || 0,
        revenue: Number(r.revenue) || 0,
      }));

      const deadStock = (await sql(
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
         GROUP BY p.id, p.name, c.name
         HAVING COALESCE(SUM(CASE WHEN o.type = 'purchase' THEN o.quantity ELSE 0 END), 0) > 0
         ORDER BY sold_qty ASC, purchase_amount DESC
         LIMIT 10`
      )).map((r) => ({
        product_id: Number(r.product_id),
        product_name: r.product_name,
        category_name: r.category_name,
        purchased_qty: Number(r.purchased_qty) || 0,
        sold_qty: Number(r.sold_qty) || 0,
        purchase_amount: Number(r.purchase_amount) || 0,
      }));

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
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAnalyticsRouter };
