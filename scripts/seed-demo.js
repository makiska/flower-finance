const { openDatabase } = require('../server/db');

const db = openDatabase();

const productsSeed = [
  { name: 'Монстера делициоза', category: 'Ароидные' },
  { name: 'Филодендрон Биркин', category: 'Ароидные' },
  { name: 'Хойя карноза', category: 'Хойи' },
  { name: 'Бегония Макулата', category: 'Бегонии' },
  { name: 'Нефролепис', category: 'Папоротники' },
  { name: 'Лимон Мейера', category: 'Другие растения' },
  { name: 'Грунт универсальный', category: 'Расходники' },
];

const categories = db.prepare('SELECT id, name FROM categories').all();
const byName = Object.fromEntries(categories.map((c) => [c.name, c.id]));

const insertProduct = db.prepare(
  'INSERT INTO products (name, category_id) VALUES (?, ?)'
);
const findProduct = db.prepare(
  'SELECT id FROM products WHERE LOWER(name) = LOWER(?)'
);
const updateProductCat = db.prepare(
  'UPDATE products SET category_id = ? WHERE id = ?'
);

const productIds = {};
for (const p of productsSeed) {
  const categoryId = byName[p.category];
  if (!categoryId) {
    throw new Error(`Категория не найдена: ${p.category}`);
  }
  const existing = findProduct.get(p.name);
  if (existing) {
    updateProductCat.run(categoryId, existing.id);
    productIds[p.name] = existing.id;
    continue;
  }
  const info = insertProduct.run(p.name, categoryId);
  productIds[p.name] = Number(info.lastInsertRowid);
}

const insertOp = db.prepare(
  `INSERT INTO operations (type, product_id, quantity, amount, comment, date)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const now = new Date();
function daysAgo(n, hour = 12) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, hour));
  return d.toISOString();
}

const opsCount = db.prepare('SELECT COUNT(*) AS c FROM operations').get().c;
if (opsCount > 0) {
  console.log(`Уже есть ${opsCount} операций — демо-операции пропущены. Категории/товары обновлены.`);
  process.exit(0);
}

const demoOps = [
  ['purchase', 'Монстера делициоза', 5, 7500, 'Партия с рынка', daysAgo(12)],
  ['purchase', 'Филодендрон Биркин', 3, 5400, null, daysAgo(11)],
  ['purchase', 'Хойя карноза', 6, 3600, null, daysAgo(10)],
  ['purchase', 'Бегония Макулата', 4, 2800, null, daysAgo(9)],
  ['purchase', 'Нефролепис', 4, 2400, null, daysAgo(8)],
  ['purchase', 'Лимон Мейера', 2, 3000, null, daysAgo(7)],
  ['purchase', 'Монстера делициоза', 2, 3000, 'Дозакупка', daysAgo(2)],
  ['expense', null, 1, 800, 'Доставка грунта', daysAgo(6)],
  ['expense', null, 1, 450, 'Упаковка', daysAgo(5)],
  ['sale', 'Монстера делициоза', 1, 2800, null, daysAgo(6, 11)],
  ['sale', 'Хойя карноза', 2, 1800, null, daysAgo(5, 15)],
  ['sale', 'Филодендрон Биркин', 1, 3200, null, daysAgo(4, 18)],
  ['sale', 'Бегония Макулата', 1, 1200, null, daysAgo(3, 14)],
  ['sale', 'Монстера делициоза', 1, 2700, null, daysAgo(2, 16)],
  ['sale', 'Нефролепис', 1, 1100, null, daysAgo(1, 12)],
  ['sale', 'Хойя карноза', 1, 900, null, daysAgo(0, 19)],
  ['sale', 'Бегония Макулата', 1, 1100, null, daysAgo(0, 10)],
];

const tx = db.transaction(() => {
  for (const [type, productName, qty, amount, comment, date] of demoOps) {
    const productId = productName ? productIds[productName] : null;
    insertOp.run(type, productId, qty, amount, comment, date);
  }
});
tx();

console.log(`Демо-данные: ${demoOps.length} операций, ${Object.keys(productIds).length} товаров.`);
