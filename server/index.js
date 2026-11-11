const path = require('path');
const express = require('express');
const { initDb, usingPostgres } = require('./db');
const { requireAppAuth, assertAuthed } = require('./auth');
const { createCategoriesRouter } = require('./routes/categories');
const { createProductsRouter } = require('./routes/products');
const { createOperationsRouter } = require('./routes/operations');
const { createAnalyticsRouter } = require('./routes/analytics');

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  await initDb();

  const app = express();
  const productsRouter = createProductsRouter();

  app.use(express.json({ limit: '64kb' }));

  // API before static — otherwise POST can get 405 from the static layer.
  app.use('/api', requireAppAuth());
  app.use('/api', (req, res, next) => {
    if (!assertAuthed(req, res)) return;
    next();
  });

  app.get('/api/health', (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      ok: true,
      db: usingPostgres ? 'postgres' : 'pglite',
      auth: req.auth?.type || null,
    });
  });

  app.use('/api/categories', createCategoriesRouter());

  // Explicit POST /api/products so create-nomenclature always has a POST handler.
  app.post('/api/products', (req, res, next) => {
    req.url = '/';
    productsRouter(req, res, next);
  });
  app.use('/api/products', productsRouter);

  app.use('/api/operations', createOperationsRouter());
  app.use('/api/analytics', createAnalyticsRouter());

  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      fallthrough: true,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );

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
