const { initDb, sql, sqlOne } = require('../server/db');

const productsSeed = [
  { name: 'Монстера делициоза', category: 'Ароидные' },
  { name: 'Филодендрон Биркин', category: 'Ароидные' },
  { name: 'Хойя карноза', category: 'Хойи' },
  { name: 'Бегония Макулата', category: 'Бегонии' },
  { name: 'Нефролепис', category: 'Папоротники' },
  { name: 'Лимон Мейера', category: 'Другие растения' },
  { name: 'Грунт универсальный', category: 'Расходники' },
];

async function main() {
  await initDb();

  const categories = await sql('SELECT id, name FROM categories');
  const byName = Object.fromEntries(categories.map((c) => [c.name, c.id]));

  const productIds = {};
  for (const p of productsSeed) {
    const categoryId = byName[p.category];
    if (!categoryId) {
      throw new Error(`Категория не найдена: ${p.category}`);
    }
    const existing = await sqlOne(
      'SELECT id FROM products WHERE LOWER(name) = LOWER($1)',
      [p.name]
    );
    if (existing) {
      await sql('UPDATE products SET category_id = $1 WHERE id = $2', [
        categoryId,
        existing.id,
      ]);
      productIds[p.name] = existing.id;
      continue;
    }
    const inserted = await sqlOne(
      'INSERT INTO products (name, category_id) VALUES ($1, $2) RETURNING id',
      [p.name, categoryId]
    );
    productIds[p.name] = inserted.id;
  }

  const now = new Date();
  function daysAgo(n, hour = 12) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, hour)
    );
    return d.toISOString();
  }

  const opsCountRow = await sqlOne('SELECT COUNT(*)::int AS c FROM operations');
  if (opsCountRow.c > 0) {
    console.log(
      `Уже есть ${opsCountRow.c} операций — демо-операции пропущены. Категории/товары обновлены.`
    );
    return;
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

  for (const [type, productName, qty, amount, comment, date] of demoOps) {
    const productId = productName ? productIds[productName] : null;
    await sql(
      `INSERT INTO operations (type, product_id, quantity, amount, comment, date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, productId, qty, amount, comment, date]
    );
  }

  console.log(
    `Демо-данные: ${demoOps.length} операций, ${Object.keys(productIds).length} товаров.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
