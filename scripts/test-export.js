delete process.env.DATABASE_URL;
delete process.env.FLOWER_DATA_DIR;

const assert = require('node:assert/strict');
const express = require('express');
const ExcelJS = require('exceljs');
const { sql, sqlOne, ensureFixedCategories } = require('../server/db');
const { requireAppAuth, assertAuthed } = require('../server/auth');
const { createOperationsRouter } = require('../server/routes/operations');
const { createExportToken, verifyExportToken } = require('../server/exportToken');
const { buildOperationsWorkbook } = require('../server/operationsWorkbook');

async function main() {
  const token = createExportToken();
  assert.equal(verifyExportToken(token), true);
  assert.equal(verifyExportToken('1.nope'), false);
  assert.equal(verifyExportToken(''), false);

  const buffer = await buildOperationsWorkbook([
    {
      date: '2026-11-22T19:02:00.000Z',
      type: 'sale',
      product_name: 'Замиокулькас Вариегатный',
      category_name: 'Ароидные',
      subgroup: 'Прочие ароидные',
      quantity: 1,
      amount: 550,
      comment: 'витрина',
      product_is_preset: true,
    },
    {
      date: '2026-11-22T16:00:00.000Z',
      type: 'expense',
      comment: 'доставка',
      quantity: 1,
      amount: 200,
    },
  ]);
  assert.equal(Buffer.from(buffer).subarray(0, 2).toString(), 'PK');

  await ensureFixedCategories();
  const group = await sqlOne(`SELECT id FROM categories WHERE name = 'Ароидные'`);
  const product = await sqlOne(
    `INSERT INTO products (name, category_id, subgroup, is_preset)
     VALUES ('Фикус Эластика Шривериана', $1, 'Каучуконосные (Эластика)', false)
     RETURNING id`,
    [group.id]
  );
  await sql(
    `INSERT INTO operations (type, product_id, quantity, amount, comment, date)
     VALUES ('sale', $1, 2, 950, 'заказ', '2026-11-22T16:33:00.000Z')`,
    [product.id]
  );
  await sql(
    `INSERT INTO operations (type, product_id, quantity, amount, comment, date)
     VALUES ('expense', NULL, 1, 80, 'упаковка', '2026-11-21T09:00:00.000Z')`
  );

  const app = express();
  app.use('/api', requireAppAuth());
  app.use('/api', (req, res, next) => {
    if (!assertAuthed(req, res)) return;
    next();
  });
  app.use('/api/operations', createOperationsRouter());
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const linkRes = await fetch(`${base}/api/operations/export-link`, {
    headers: { 'x-forwarded-proto': 'https', host: 'plantsminiapp.space' },
  });
  assert.equal(linkRes.status, 200);
  const link = await linkRes.json();
  assert.match(link.url, /^https:\/\/127\.0\.0\.1:\d+\/api\/operations\/export\?token=/);
  assert.match(link.file_name, /^операции-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const file = await fetch(`${base}/api/operations/export?token=${encodeURIComponent(token)}`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type'), /spreadsheetml/);
  const bytes = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet('Операции');
  assert.equal(sheet.getRow(1).getCell(3).value, 'Позиция');
  const names = sheet.getColumn(3).values.filter((value) => value && value !== 'Позиция');
  assert.deepEqual(names, ['упаковка', 'Фикус Эластика Шривериана']);
  assert.equal(sheet.getRow(2).getCell(2).value, 'Расходник');
  assert.equal(sheet.getRow(3).getCell(4).value, 'Ароидные');
  assert.equal(sheet.getRow(3).getCell(5).value, 'Каучуконосные (Эластика)');
  assert.equal(Number(sheet.getRow(3).getCell(6).value), 2);
  assert.equal(Number(sheet.getRow(3).getCell(7).value), 950);
  assert.equal(sheet.getRow(3).getCell(9).value, 'создана');

  server.close();
  console.log('export ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
