import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

const GROUP_ORDER = [
  'Ароидные',
  'Хойи',
  'Бегонии',
  'Папоротники',
  'Другие растения',
  'Расходники',
];

export async function renderProfile(root) {
  root.innerHTML = `<div class="py-8 text-center text-soil-700/70">Загрузка…</div>`;

  let products = [];
  let loadError = '';
  try {
    products = await api.getProducts();
  } catch (err) {
    loadError = err.message;
  }

  root.innerHTML = `
    <section class="space-y-4">
      <div class="card-soft space-y-3">
        <h2 class="text-lg font-semibold">Подписка</h2>
        <p class="text-sm text-soil-700/80">Учёт сейчас открыт без оплаты. Статус подписки будет показан здесь.</p>
      </div>

      <div class="card-soft space-y-3">
        <h2 class="text-lg font-semibold">Обучение</h2>
        <ul class="space-y-3 text-sm text-soil-700/80">
          <li>На главной создаются продажа, закупка и расходник.</li>
          <li>В истории операции можно отфильтровать, изменить или удалить.</li>
          <li>В отчётах видны выручка и затраты. За всё время на графике есть и прибыль.</li>
          <li>Ниже весь список позиций, которые уже заведены.</li>
        </ul>
      </div>

      <div class="card-soft">
        <h2 class="mb-2 text-lg font-semibold">Номенклатура</h2>
        ${loadError ? `<p class="text-sm text-petal-600">${escapeHtml(loadError)}</p>` : renderCatalog(products)}
      </div>

      <div class="card-soft space-y-1">
        <h2 class="text-lg font-semibold">Аккаунт</h2>
        <p class="text-sm text-soil-700/80">Выйти из аккаунта</p>
        <p class="text-sm text-soil-700/60">Пока это только подпись: выход ещё не подключён.</p>
      </div>
    </section>
  `;
}

function renderCatalog(products) {
  if (!products.length) {
    return '<p class="text-sm text-soil-700/60">Пока нет позиций</p>';
  }

  const groups = new Map();
  for (const product of products) {
    const name = product.category_name || 'Без группы';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(product);
  }

  const names = [
    ...GROUP_ORDER.filter((name) => groups.has(name)),
    ...[...groups.keys()].filter((name) => !GROUP_ORDER.includes(name)),
  ];

  return names
    .map((name) => {
      const items = groups.get(name);
      return `
        <div class="mb-2">
          <h3 class="mb-2 text-sm font-semibold text-soil-700/70">${escapeHtml(name)}</h3>
          ${items
            .map(
              (product) => `
                <div class="list-item">
                  <div class="min-w-0 font-medium truncate">${escapeHtml(product.name)}</div>
                </div>`
            )
            .join('')}
        </div>`;
    })
    .join('');
}
