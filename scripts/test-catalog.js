delete process.env.DATABASE_URL;
delete process.env.FLOWER_DATA_DIR;
process.env.LEGACY_OWNER_TELEGRAM_ID = '296676631';
process.env.ADMIN_TELEGRAM_ID = '296676631';

const assert = require('node:assert/strict');
const { sql, sqlOne, initDb } = require('../server/db');
const {
  detectSubgroup,
  createPersonalItem,
  listItems,
  listPendingCandidates,
  approveCandidate,
  isAdminUser,
} = require('../server/catalog');
const { loadAnalytics } = require('../server/routes/analytics');

function check(name, value, subgroup) {
  assert.equal(detectSubgroup(name, value), subgroup, `${name} -> ${subgroup}`);
}

async function main() {
  check('Монстера Альба', 'Ароидные', 'Монстеры');
  check('Филодендрон ред', 'Ароидные', 'Филодендроны');
  check('Бегония Макулата', 'Бегонии', 'Тростниковые (Кейн)');
  check('Бегония Рекс Эскарго', 'Бегонии', 'Декоративно-лиственные (Рекс)');
  check('Фикус Бенджамина Кинки', 'Фикусы', 'Фикусы Бенджамина');
  check('Фикус Эластика Робуста', 'Фикусы', 'Каучуконосные (Эластика)');
  check('Алоказия Зебрина', 'Ароидные', 'Алоказии');
  check('Традесканция Зебрина', 'Другие растения', 'Традесканции');
  check('Лейка', 'Расходники', null);
  check('Неизвестное растение', 'Другие растения', null);

  await sql('SELECT 1');
  const aroid = await sqlOne(`SELECT id FROM categories WHERE name = 'Ароидные'`);
  const supplies = await sqlOne(`SELECT id FROM categories WHERE name = 'Расходники'`);
  const legacy = await sqlOne(
    `INSERT INTO products (name, category_id) VALUES ('Монстера Альба Вариегата (Albo Variegata)', $1) RETURNING id`,
    [aroid.id]
  );
  const supply = await sqlOne(
    `INSERT INTO products (name, category_id) VALUES ('Лейка', $1) RETURNING id`,
    [supplies.id]
  );
  const sale = await sqlOne(
    `INSERT INTO operations (type, product_id, quantity, amount, comment)
     VALUES ('sale', $1, 2, 1500, 'витрина') RETURNING id`,
    [legacy.id]
  );
  await sql(
    `INSERT INTO operations (type, product_id, quantity, amount, comment)
     VALUES ('expense', NULL, 1, 80, 'доставка')`
  );

  const first = await initDb();
  assert.equal(first.operationsBefore, 2);
  assert.equal(first.operationsAfter, 2);
  assert.equal(first.orphans, 0);
  assert.equal(first.personalBefore, 2);
  assert.ok(first.presetAfter > 200);
  assert.equal(first.totalAfter, first.personalAfter + first.presetAfter);

  const kept = await sqlOne(
    `SELECT id, user_id, is_preset, shared, subgroup, preset_id FROM products WHERE id = $1`,
    [legacy.id]
  );
  assert.equal(Number(kept.id), Number(legacy.id));
  assert.equal(kept.user_id, '296676631');
  assert.equal(Boolean(kept.is_preset), false);
  assert.equal(Boolean(kept.shared), true);
  assert.equal(kept.subgroup, 'Монстеры');
  assert.ok(kept.preset_id);
  const preset = await sqlOne(`SELECT id, is_preset FROM products WHERE id = $1`, [kept.preset_id]);
  assert.equal(Boolean(preset.is_preset), true);
  assert.notEqual(Number(preset.id), Number(legacy.id));

  const supplyRow = await sqlOne(`SELECT subgroup, user_id, is_preset FROM products WHERE id = $1`, [supply.id]);
  assert.equal(supplyRow.subgroup, null);
  assert.equal(supplyRow.user_id, '296676631');
  assert.equal(Boolean(supplyRow.is_preset), false);

  const still = await sqlOne(`SELECT product_id, amount FROM operations WHERE id = $1`, [sale.id]);
  assert.equal(Number(still.product_id), Number(legacy.id));
  assert.equal(Number(still.amount), 1500);

  const second = await initDb();
  assert.equal(second.presetsInserted, 0);
  assert.equal(second.operationsAfter, 2);
  assert.equal(second.presetAfter, first.presetAfter);

  const created = await createPersonalItem({
    userId: '111',
    name: 'Редкая хойя',
    group: 'Хойи',
  });
  assert.equal(created.status, 201);
  assert.equal(created.item.subgroup, null);
  const again = await createPersonalItem({ userId: '111', name: 'Редкая хойя', group: 'Хойи' });
  assert.equal(again.status, 409);
  await createPersonalItem({ userId: '222', name: '  Редкая   хойя ', group: 'Хойи' });
  const pending = await listPendingCandidates();
  const candidate = pending.find((row) => row.normalized_name === 'редкая хойя');
  assert.ok(candidate);
  assert.equal(candidate.users_count, 2);

  const found = await listItems({ userId: '111', search: 'birkin' });
  assert.ok(found.some((item) => item.name.includes('Биркин') && item.is_preset));
  const legacyVisible = await listItems({ userId: '222', search: 'Albo Variegata' });
  assert.equal(legacyVisible.length, 1);
  assert.equal(legacyVisible[0].id, Number(legacy.id));
  assert.equal(legacyVisible[0].is_preset, false);

  const approved = await approveCandidate(candidate.id, {
    name: 'Редкая хойя (Rare)',
    group: 'Хойи',
    subgroup: 'Ампельные и мелколистные',
  });
  assert.equal(approved.ok, true);
  const presetRare = await sqlOne(
    `SELECT is_preset, subgroup FROM products WHERE name = 'Редкая хойя (Rare)'`
  );
  assert.equal(Boolean(presetRare.is_preset), true);
  assert.equal(presetRare.subgroup, 'Ампельные и мелколистные');
  assert.equal((await listPendingCandidates()).some((row) => row.id === candidate.id), false);

  const report = await loadAnalytics('month');
  assert.equal(report.summary.revenue, 1500);
  assert.ok(report.dynamics.length >= 1);
  assert.ok(report.by_subgroup.some((row) => row.subgroup === 'Монстеры' && row.quantity === 2));

  assert.equal(isAdminUser({ auth: { type: 'telegram', userId: '296676631' } }), true);
  assert.equal(isAdminUser({ auth: { type: 'telegram', userId: '111' } }), false);
  assert.equal(isAdminUser({ auth: { type: 'cursor', userId: '296676631' } }), false);

  const finalOps = await sqlOne('SELECT COUNT(*)::int AS c FROM operations');
  assert.equal(Number(finalOps.c), 2);
  console.log('catalog_ok', first.presetAfter, 'presets');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
