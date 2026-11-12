const path = require('path');
const express = require('express');
const { initDb, usingPostgres } = require('./db');
const { requireAppAuth, assertAuthed } = require('./auth');
const { createCategoriesRouter } = require('./routes/categories');
const { createProductsRouter, createProductHandler } = require('./routes/products');
const { createOperationsRouter } = require('./routes/operations');
const { createAnalyticsRouter } = require('./routes/analytics');

const PORT = Number(process.env.PORT) || 3000;

function createApp() {
  const app = express();

  app.use(express.json({ limit: '64kb' }));

  // Auth returns 401/403 only — never 405.
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

  // The host records only top-level app.post() routes. router.post('/') inside
  // app.use('/api/products') is invisible, so the edge serves that URL as a
  // static path and answers POST with 405 Allow: GET, HEAD. Register the
  // handler on the app itself, before any await, so the route exists as soon
  // as this module loads.
  app.post('/api/products', createProductHandler);
  app.post('/api/products/', createProductHandler);
  // Older cached clients still post here.
  app.post('/api/product-create', createProductHandler);

  const operationsRouter = createOperationsRouter();
  app.post('/api/operations', operationsRouter.createOperationHandler);
  app.post('/api/operations/', operationsRouter.createOperationHandler);

  app.use('/api/products', createProductsRouter());
  app.use('/api/operations', operationsRouter);
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

  return app;
}

// Synchronous: hosting inspects the Express app at process start, before
// initDb() resolves. Routes created after that await are missing from the
// edge table and POST falls through to static (405).
const app = createApp();

async function main() {
  await initDb();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Flower Finance Mini App: http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

module.exports = app;
// force rebuild
