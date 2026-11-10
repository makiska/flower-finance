const path = require('path');
const express = require('express');
const { initDb, usingPostgres } = require('./db');
const { createCategoriesRouter } = require('./routes/categories');
const { createProductsRouter } = require('./routes/products');
const { createOperationsRouter } = require('./routes/operations');
const { createAnalyticsRouter } = require('./routes/analytics');

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  await initDb();

  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, db: usingPostgres ? 'postgres' : 'pglite' });
  });

  app.use('/api/categories', createCategoriesRouter());
  app.use('/api/products', createProductsRouter());
  app.use('/api/operations', createOperationsRouter());
  app.use('/api/analytics', createAnalyticsRouter());

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Flower Finance Mini App: http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
