const path = require('path');
const express = require('express');
const { openDatabase } = require('./db');
const { createCategoriesRouter } = require('./routes/categories');
const { createProductsRouter } = require('./routes/products');
const { createOperationsRouter } = require('./routes/operations');
const { createAnalyticsRouter } = require('./routes/analytics');

const PORT = Number(process.env.PORT) || 3000;
const db = openDatabase();
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/categories', createCategoriesRouter(db));
app.use('/api/products', createProductsRouter(db));
app.use('/api/operations', createOperationsRouter(db));
app.use('/api/analytics', createAnalyticsRouter(db));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Flower Finance Mini App: http://0.0.0.0:${PORT}`);
});
