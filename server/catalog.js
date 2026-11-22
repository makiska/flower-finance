const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { sql, sqlOne, ensureFixedCategories } = require('./db');

const PLANT_GROUPS = [
  'Ароидные',
  'Хойи',
  'Бегонии',
  'Папоротники',
  'Фикусы',
  'Марантовые',
  'Суккуленты и кактусы',
  'Цветущие',
  'Другие растения',
];

const SUBGROUP_RULES = [
  { subgroup: 'Декоративно-лиственные (Рекс)', keys: ['бегония рекс', 'мэсона', 'бауэра', 'клеопатра', 'ферокс'] },
  { subgroup: 'Тростниковые (Кейн)', keys: ['макулата', 'тамайя', 'кораллов', 'альбопикта', 'бенгоенсис', 'сноу кэппед'] },
  { subgroup: 'Природные и террариумные', keys: ['амфиоксус', 'бипиннатифида', 'дреге'] },
  { subgroup: 'Фикусы Бенджамина', keys: ['фикус бенджамина'] },
  { subgroup: 'Каучуконосные (Эластика)', keys: ['фикус эластика'] },
  { subgroup: 'Монстеры', keys: ['монстер'] },
  { subgroup: 'Филодендроны', keys: ['филодендрон'] },
  { subgroup: 'Алоказии', keys: ['алокази'] },
  { subgroup: 'Антуриумы', keys: ['антуриум'] },
  { subgroup: 'Сингониумы', keys: ['сингониум'] },
  { subgroup: 'Эпипремнумы и сциндапсусы', keys: ['эпипремнум', 'сциндапсус'] },
  { subgroup: 'Прочие ароидные', keys: ['замиокулькас', 'спатифиллум', 'аглаонема'] },
  { subgroup: 'Нефролеписы', keys: ['нефролепис'] },
  { subgroup: 'Адиантумы', keys: ['адиантум'] },
  { subgroup: 'Асплениумы', keys: ['асплениум'] },
  { subgroup: 'Калатеи', keys: ['калатея'] },
  { subgroup: 'Маранты', keys: ['маранта'] },
  { subgroup: 'Строманты и ктенанты', keys: ['строманта', 'ктенанте', 'ктенанта'] },
  { subgroup: 'Эхеверии', keys: ['эхевери'] },
  { subgroup: 'Хавортии', keys: ['хаворти'] },
  { subgroup: 'Крассулы', keys: ['крассул'] },
  { subgroup: 'Сансевиерии', keys: ['сансевиери'] },
  { subgroup: 'Орхидеи', keys: ['фаленопсис', 'дендробиум', 'орхиде'] },
  { subgroup: 'Фиалки (Сенполии)', keys: ['сенполи', 'фиалк'] },
  { subgroup: 'Пеларгонии', keys: ['пеларгони', 'герань'] },
  { subgroup: 'Пеперомии', keys: ['пепероми'] },
  { subgroup: 'Традесканции', keys: ['традесканци'] },
];

function legacyOwnerId() {
  return (
    process.env.LEGACY_OWNER_TELEGRAM_ID?.trim() ||
    process.env.ADMIN_TELEGRAM_ID?.trim() ||
    '296676631'
  );
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeName(value) {
  return cleanName(value).toLowerCase();
}

function nameKey(value) {
  return normalizeName(value)
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '');
}

function detectSubgroup(name, group) {
  if (String(group || '').trim() === 'Расходники') return null;
  const haystack = normalizeName(name);
  if (!haystack) return null;
  for (const rule of SUBGROUP_RULES) {
    if (rule.keys.some((key) => haystack.includes(key))) return rule.subgroup;
  }
  return null;
}

function parseUsers(value) {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function countOperations() {
  const row = await sqlOne('SELECT COUNT(*)::int AS c FROM operations');
  return Number(row?.c) || 0;
}

async function countProducts(whereSql = '', params = []) {
  const row = await sqlOne(`SELECT COUNT(*)::int AS c FROM products ${whereSql}`, params);
  return Number(row?.c) || 0;
}

async function fillSubgroups() {
  const rows = await sql(
    `SELECT p.id, p.name, c.name AS group_name
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.is_preset = false AND (p.subgroup IS NULL OR p.subgroup = '')`
  );
  let filled = 0;
  for (const row of rows) {
    const subgroup = detectSubgroup(row.name, row.group_name);
    if (!subgroup) continue;
    await sql('UPDATE products SET subgroup = $1 WHERE id = $2', [subgroup, row.id]);
    filled += 1;
  }
  return filled;
}

async function linkPresetIds() {
  const presets = await sql(
    `SELECT p.id, p.name
     FROM products p
     WHERE p.is_preset = true`
  );
  const byKey = new Map();
  for (const preset of presets) {
    const key = nameKey(preset.name);
    if (key && !byKey.has(key)) byKey.set(key, preset.id);
  }
  const personal = await sql(
    `SELECT id, name FROM products WHERE is_preset = false AND preset_id IS NULL`
  );
  let linked = 0;
  for (const row of personal) {
    const presetId = byKey.get(nameKey(row.name));
    if (!presetId || Number(presetId) === Number(row.id)) continue;
    await sql('UPDATE products SET preset_id = $1 WHERE id = $2 AND preset_id IS NULL', [
      presetId,
      row.id,
    ]);
    linked += 1;
  }
  return linked;
}

async function seedPresetPlants() {
  await ensureFixedCategories();
  const file = path.join(__dirname, 'data', 'preset-plants.json');
  const presets = JSON.parse(await readFile(file, 'utf8'));
  let inserted = 0;
  for (const plant of presets) {
    const name = cleanName(plant.name);
    const group = cleanName(plant.group);
    const subgroup = cleanName(plant.subgroup) || detectSubgroup(name, group);
    if (!name || !group) continue;
    const category = await sqlOne('SELECT id FROM categories WHERE LOWER(name) = LOWER($1)', [group]);
    if (!category) throw new Error(`В справочнике неизвестная группа: ${group}`);
    const existing = await sqlOne(
      `SELECT p.id
       FROM products p
       WHERE p.is_preset = true AND LOWER(p.name) = LOWER($1) AND p.category_id = $2`,
      [name, category.id]
    );
    if (existing) continue;
    await sql(
      `INSERT INTO products (name, category_id, subgroup, user_id, is_preset, shared)
       VALUES ($1, $2, $3, NULL, true, false)`,
      [name, category.id, subgroup || null]
    );
    inserted += 1;
  }
  return { total: presets.length, inserted };
}

async function ensureCatalogSchema() {
  await sql('ALTER TABLE products ADD COLUMN IF NOT EXISTS user_id TEXT');
  await sql('ALTER TABLE products ADD COLUMN IF NOT EXISTS subgroup TEXT');
  await sql('ALTER TABLE products ADD COLUMN IF NOT EXISTS is_preset BOOLEAN NOT NULL DEFAULT false');
  await sql('ALTER TABLE products ADD COLUMN IF NOT EXISTS preset_id INTEGER');
  await sql('ALTER TABLE products ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT false');
  await sql(`CREATE TABLE IF NOT EXISTS catalog_candidates (
    id SERIAL PRIMARY KEY,
    normalized_name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    group_name TEXT NOT NULL,
    detected_subgroup TEXT,
    users_count INTEGER NOT NULL DEFAULT 1,
    created_by_users TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function migrateExistingCatalog() {
  await ensureCatalogSchema();
  const operationsBefore = await countOperations();
  const personalBefore = await countProducts('WHERE is_preset = false');

  const ownerId = legacyOwnerId();
  await sql(
    `UPDATE products
     SET shared = true
     WHERE is_preset = false AND user_id IS NULL`
  );
  await sql(
    `UPDATE products
     SET user_id = $1
     WHERE is_preset = false AND user_id IS NULL`,
    [ownerId]
  );
  await fillSubgroups();
  const seed = await seedPresetPlants();
  await absorbPromotedCopies();
  await linkPresetIds();

  const operationsAfter = await countOperations();
  const personalAfter = await countProducts('WHERE is_preset = false');
  const presetAfter = await countProducts('WHERE is_preset = true');
  const totalAfter = await countProducts();
  const orphanRow = await sqlOne(
    `SELECT COUNT(*)::int AS c
     FROM operations o
     WHERE o.product_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = o.product_id)`
  );
  const orphans = Number(orphanRow?.c) || 0;

  const report = {
    operationsBefore,
    operationsAfter,
    personalBefore,
    personalAfter,
    presetAfter,
    totalAfter,
    presetsInFile: seed.total,
    presetsInserted: seed.inserted,
    orphans,
    legacyOwnerId: ownerId,
  };
  console.log('[catalog] operations before:', report.operationsBefore);
  console.log('[catalog] operations after:', report.operationsAfter);
  console.log('[catalog] personal positions before:', report.personalBefore);
  console.log('[catalog] personal positions after:', report.personalAfter);
  console.log('[catalog] preset positions:', report.presetAfter);
  console.log('[catalog] positions total:', report.totalAfter);
  console.log('[catalog] orphan operations:', report.orphans);
  if (report.operationsBefore !== report.operationsAfter) {
    console.error('[catalog] operation count changed during migration');
  }
  return report;
}

const PROMOTED_NAMES = [
  'Антуриум Балао (Balaoanum)',
  'Сингониум Эрроу (Arrow)',
  'Сциндапсус Пиктус Платинум (Platinum)',
  'Эпипремнум Ауреум Елисейские поля (Champs-Élysées)',
  'Бегония Гландулоза (Glandulosa)',
  'Бегония Лирик (Lyric)',
  'Бегония Лудикра (Ludicra)',
  'Бегония Макулата Аламео Оле',
  'Бегония Малайзия (Malaysia)',
  'Бегония Молдова (СВ)',
  'Бегония Пандора (Pandora)',
  'Бегония Снежный Шторм (Snow Storm)',
  'Бегония Трансильвания (СВ)',
  'Бегония Уайт Айс (White Ice)',
  'Бегония Футоэнсис (Futoensis)',
  'Эписция Пикассо (Picasso)',
  'Нефролепис Экзальтата Сахарная Вата (Cotton Candy)',
  'Распылитель',
  'Фикус Бенджамина Вианди Вариегатный (Wiandi Variegata)',
  'Фикус Треугольный Вариегатный (Triangularis Variegata)',
  'Фикус Эластика Еллоу Голд (Yellow Gold)',
  'Хойя Диверсифолия Махарани (Maharani)',
  'Хойя Лакуноза Сноу Леопард (Snow Leopard)',
];

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function wordsOf(value) {
  return normalizeName(value)
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .split(' ')
    .filter((word) => word.length >= 4);
}

function diceCoefficient(left, right) {
  const a = nameKey(left);
  const b = nameKey(right);
  if (a.length < 3 || b.length < 3) return 0;
  const grams = (text) => {
    const list = [];
    for (let i = 0; i < text.length - 2; i += 1) list.push(text.slice(i, i + 3));
    return list;
  };
  const aGrams = grams(a);
  const bGrams = grams(b);
  const counts = new Map();
  for (const gram of aGrams) counts.set(gram, (counts.get(gram) || 0) + 1);
  let shared = 0;
  for (const gram of bGrams) {
    const count = counts.get(gram) || 0;
    if (!count) continue;
    shared += 1;
    counts.set(gram, count - 1);
  }
  return (2 * shared) / (aGrams.length + bGrams.length);
}

function scoreNames(left, right) {
  const a = nameKey(left);
  const b = nameKey(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const inclusion = shorter.length >= 6 && longer.includes(shorter) ? 0.95 : 0;
  const queryWords = wordsOf(left);
  const catalogWords = new Set(wordsOf(right));
  const recall = queryWords.length
    ? queryWords.filter((word) => catalogWords.has(word)).length / queryWords.length
    : 0;
  return Math.max(inclusion, diceCoefficient(left, right), recall);
}

function rankSimilar(name, presets, limit = 3) {
  return presets
    .map((row) => ({
      id: Number(row.id),
      name: row.name,
      group: row.group_name,
      subgroup: row.subgroup || null,
      score: Number(scoreNames(name, row.name).toFixed(2)),
    }))
    .filter((row) => row.score >= 0.45)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit);
}

function rankItem(row, userId) {
  if (!row.is_preset && String(row.user_id || '') === String(userId || '')) return 3;
  if (row.shared && !row.is_preset) return 2;
  if (row.is_preset) return 1;
  return 0;
}

function preferItems(rows, userId) {
  const best = new Map();
  for (const row of rows) {
    const key = nameKey(row.name);
    const prev = best.get(key);
    if (!prev || rankItem(row, userId) > rankItem(prev, userId)) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => {
    const group = String(a.category_name || '').localeCompare(String(b.category_name || ''), 'ru');
    if (group) return group;
    return String(a.name).localeCompare(String(b.name), 'ru');
  });
}

const ITEM_SELECT = `
  SELECT
    p.id,
    p.name,
    p.category_id,
    p.created_at,
    p.subgroup,
    p.user_id,
    p.is_preset,
    p.preset_id,
    p.shared,
    c.name AS category_name,
    (SELECT COUNT(*)::int FROM operations o WHERE o.product_id = p.id) AS operation_count
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

function presentItem(row) {
  return {
    id: Number(row.id),
    name: row.name,
    group: row.category_name,
    category_id: Number(row.category_id),
    category_name: row.category_name,
    subgroup: row.subgroup || null,
    is_preset: Boolean(row.is_preset),
    preset_id: row.preset_id == null ? null : Number(row.preset_id),
    shared: Boolean(row.shared),
    operation_count: Number(row.operation_count) || 0,
    created_at: row.created_at,
  };
}

async function listItems({ userId, search = '' }) {
  const params = [String(userId || '')];
  const where = ['(p.is_preset = true OR p.user_id = $1 OR p.shared = true)'];
  const needle = cleanName(search);
  if (needle) {
    params.push(`%${escapeLike(needle)}%`);
    where.push(`LOWER(p.name) LIKE LOWER($${params.length}) ESCAPE '\\'`);
  }
  const rows = await sql(
    `${ITEM_SELECT}
     WHERE ${where.join(' AND ')}
     ORDER BY c.name, p.name
     LIMIT 1000`,
    params
  );
  return preferItems(rows, userId).map(presentItem);
}

async function selectItem(id) {
  const row = await sqlOne(`${ITEM_SELECT} WHERE p.id = $1`, [id]);
  return row ? presentItem(row) : null;
}

async function presetExists(normalized) {
  const rows = await sql('SELECT name FROM products WHERE is_preset = true');
  return rows.some((row) => normalizeName(row.name) === normalized);
}

async function registerCandidate(query, queryOne, { userId, name, group, subgroup }) {
  const normalized = normalizeName(name);
  if (!normalized || !userId) return;
  if (await presetExists(normalized)) return;
  const existing = await queryOne(
    'SELECT id, status, created_by_users, users_count FROM catalog_candidates WHERE normalized_name = $1',
    [normalized]
  );
  if (!existing) {
    await query(
      `INSERT INTO catalog_candidates
        (normalized_name, display_name, group_name, detected_subgroup, users_count, created_by_users, status)
       VALUES ($1, $2, $3, $4, 1, $5, 'pending')`,
      [normalized, name, group, subgroup, JSON.stringify([String(userId)])]
    );
    return;
  }
  if (existing.status !== 'pending') return;
  const users = parseUsers(existing.created_by_users);
  if (users.includes(String(userId))) return;
  users.push(String(userId));
  await query(
    `UPDATE catalog_candidates
     SET users_count = $1, created_by_users = $2
     WHERE id = $3`,
    [users.length, JSON.stringify(users), existing.id]
  );
}

async function createPersonalItem({ userId, name, group, categoryId }) {
  const clean = cleanName(name);
  if (!clean) return { error: 'Укажите название', status: 400 };
  if (clean.length > 120) return { error: 'Название длиннее 120 символов', status: 400 };
  if (!userId) return { error: 'Нет пользователя', status: 401 };

  await ensureFixedCategories();
  let resolvedGroup = cleanName(group);
  let category = null;
  if (categoryId) {
    category = await sqlOne('SELECT id, name FROM categories WHERE id = $1', [categoryId]);
    if (!category) return { error: 'Группа не найдена', status: 400 };
    resolvedGroup = category.name;
  } else {
    if (!resolvedGroup) return { error: 'Укажите группу', status: 400 };
    category = await sqlOne('SELECT id, name FROM categories WHERE LOWER(name) = LOWER($1)', [
      resolvedGroup,
    ]);
    if (!category) return { error: 'Неизвестная группа', status: 400 };
    resolvedGroup = category.name;
  }

  const duplicate = await sqlOne(
    `SELECT id FROM products
     WHERE LOWER(name) = LOWER($1) AND category_id = $2 AND is_preset = false AND user_id = $3`,
    [clean, category.id, String(userId)]
  );
  if (duplicate) {
    return { error: 'Такая позиция уже есть в этой группе', status: 409, item: await selectItem(duplicate.id) };
  }

  const subgroup = detectSubgroup(clean, resolvedGroup);
  const { withTransaction } = require('./db');
  const inserted = await withTransaction(async (query, queryOne) => {
    const row = await queryOne(
      `INSERT INTO products (name, category_id, subgroup, user_id, is_preset, shared)
       VALUES ($1, $2, $3, $4, false, false)
       RETURNING id`,
      [clean, category.id, subgroup, String(userId)]
    );
    await registerCandidate(query, queryOne, {
      userId,
      name: clean,
      group: resolvedGroup,
      subgroup,
    });
    return row;
  });
  return { item: await selectItem(inserted.id), status: 201 };
}

function isAdminUser(req) {
  const adminId = process.env.ADMIN_TELEGRAM_ID?.trim();
  if (!adminId) return false;
  return req.auth?.type === 'telegram' && String(req.auth.userId) === adminId;
}

async function absorbNamesIntoPreset(presetId, names, query = sql, queryOne = sqlOne) {
  const keys = new Set(names.map((name) => normalizeName(name)).filter(Boolean));
  if (!keys.size) return { moved: 0, removed: 0 };
  const personal = await query('SELECT id, name FROM products WHERE is_preset = false');
  let moved = 0;
  let removed = 0;
  for (const row of personal) {
    if (!keys.has(normalizeName(row.name))) continue;
    const ops = await queryOne('SELECT COUNT(*)::int AS c FROM operations WHERE product_id = $1', [row.id]);
    await query('UPDATE operations SET product_id = $1 WHERE product_id = $2', [presetId, row.id]);
    await query('DELETE FROM products WHERE id = $1', [row.id]);
    moved += Number(ops?.c) || 0;
    removed += 1;
  }
  return { moved, removed };
}

async function absorbPromotedCopies() {
  const presets = await sql(
    `SELECT id, name FROM products WHERE is_preset = true`
  );
  const byName = new Map(presets.map((row) => [normalizeName(row.name), Number(row.id)]));
  let moved = 0;
  let removed = 0;
  for (const name of PROMOTED_NAMES) {
    const presetId = byName.get(normalizeName(name));
    if (!presetId) continue;
    const result = await absorbNamesIntoPreset(presetId, [name]);
    moved += result.moved;
    removed += result.removed;
  }
  return { moved, removed };
}

async function loadPresetRows() {
  return sql(
    `SELECT p.id, p.name, p.subgroup, c.name AS group_name
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.is_preset = true`
  );
}

async function listPendingCandidates() {
  const rows = await sql(
    `SELECT id, normalized_name, display_name, group_name, detected_subgroup, users_count, status, created_at
     FROM catalog_candidates
     WHERE status = 'pending'
     ORDER BY users_count DESC, id ASC`
  );
  const presets = await loadPresetRows();
  return rows.map((row) => ({
    id: Number(row.id),
    normalized_name: row.normalized_name,
    display_name: row.display_name,
    group: row.group_name,
    subgroup: row.detected_subgroup || null,
    users_count: Number(row.users_count) || 0,
    status: row.status,
    created_at: row.created_at,
    similar: rankSimilar(row.display_name, presets),
  }));
}

async function queueCatalogCandidate({ userId, name, group, subgroup }) {
  await registerCandidate(sql, sqlOne, { userId, name, group, subgroup });
}

async function approveCandidate(id, { name, group, subgroup, presetId }) {
  const candidate = await sqlOne('SELECT * FROM catalog_candidates WHERE id = $1', [id]);
  if (!candidate) return { error: 'Кандидат не найден', status: 404 };
  if (candidate.status === 'approved') return { error: 'Позиция уже опубликована', status: 409 };

  const requestedPresetId = Number(presetId);
  const useExisting = Number.isInteger(requestedPresetId) && requestedPresetId > 0;
  let clean = cleanName(name || candidate.display_name);
  let resolvedGroup = cleanName(group || candidate.group_name);
  let resolvedSubgroup =
    cleanName(subgroup || candidate.detected_subgroup || '') || detectSubgroup(clean, resolvedGroup);
  if (!clean) return { error: 'Укажите название', status: 400 };
  if (!resolvedGroup) return { error: 'Укажите группу', status: 400 };
  await ensureFixedCategories();

  const { withTransaction } = require('./db');
  try {
    return await withTransaction(async (query, queryOne) => {
      let preset = null;
      if (useExisting) {
        preset = await queryOne(
          `SELECT p.id, p.name, c.name AS group_name, p.subgroup
           FROM products p
           JOIN categories c ON c.id = p.category_id
           WHERE p.id = $1 AND p.is_preset = true`,
          [requestedPresetId]
        );
        if (!preset) return { error: 'Позиция общего каталога не найдена', status: 404 };
        clean = preset.name;
        resolvedGroup = preset.group_name;
        resolvedSubgroup = preset.subgroup || null;
      } else {
        const category = await queryOne('SELECT id, name FROM categories WHERE LOWER(name) = LOWER($1)', [
          resolvedGroup,
        ]);
        if (!category) return { error: 'Неизвестная группа', status: 400 };
        resolvedGroup = category.name;
        preset = await queryOne(
          `SELECT id, name FROM products
           WHERE is_preset = true AND LOWER(name) = LOWER($1) AND category_id = $2`,
          [clean, category.id]
        );
        if (!preset) {
          preset = await queryOne(
            `INSERT INTO products (name, category_id, subgroup, user_id, is_preset, shared)
             VALUES ($1, $2, $3, NULL, true, false)
             RETURNING id, name`,
            [clean, category.id, resolvedSubgroup || null]
          );
        }
      }
      const absorbed = await absorbNamesIntoPreset(
        preset.id,
        [candidate.display_name, candidate.normalized_name, clean],
        query,
        queryOne
      );
      await query(`UPDATE catalog_candidates SET status = 'approved', display_name = $2 WHERE id = $1`, [
        id,
        clean,
      ]);
      return {
        ok: true,
        preset_id: Number(preset.id),
        name: clean,
        moved_operations: absorbed.moved,
        removed_personal: absorbed.removed,
      };
    });
  } catch (error) {
    if (error?.status) return { error: error.message, status: error.status };
    throw error;
  }
}

async function rejectCandidate(id) {
  const candidate = await sqlOne('SELECT id FROM catalog_candidates WHERE id = $1', [id]);
  if (!candidate) return { error: 'Кандидат не найден', status: 404 };
  await sql(`UPDATE catalog_candidates SET status = 'rejected' WHERE id = $1`, [id]);
  return { ok: true };
}

module.exports = {
  PLANT_GROUPS,
  detectSubgroup,
  normalizeName,
  nameKey,
  legacyOwnerId,
  migrateExistingCatalog,
  seedPresetPlants,
  listItems,
  selectItem,
  createPersonalItem,
  queueCatalogCandidate,
  scoreNames,
  isAdminUser,
  listPendingCandidates,
  approveCandidate,
  rejectCandidate,
  ITEM_SELECT,
  presentItem,
};
