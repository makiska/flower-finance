import { api } from '../api.js';
import {
  escapeHtml,
  openModal,
  closeModal,
  showToast,
  formatMoney,
  typeLabel,
} from '../utils.js';
import { haptic } from '../telegram.js';

/** Fixed groups — always offered when creating a position. */
const FIXED_GROUPS = [
  'Ароидные',
  'Хойи',
  'Бегонии',
  'Папоротники',
  'Другие растения',
  'Расходники',
];

let categoriesCache = null;

async function getCategories() {
  if (!categoriesCache) {
    const rows = await api.getCategories();
    categoriesCache = Array.isArray(rows) ? rows : [];
  }
  return categoriesCache;
}

async function groupSelectOptions() {
  const cats = await getCategories();
  const byName = Object.fromEntries(cats.map((c) => [c.name, c]));
  let options = FIXED_GROUPS.map((name) => {
    const row = byName[name];
    return row ? { id: row.id, name: row.name } : null;
  }).filter(Boolean);

  if (!options.length) {
    categoriesCache = null;
    const retry = await getCategories();
    options = FIXED_GROUPS.map((name) => {
      const row = retry.find((c) => c.name === name);
      return row ? { id: row.id, name: row.name } : null;
    }).filter(Boolean);
  }
  if (!options.length && cats.length) {
    return cats.map((c) => ({ id: c.id, name: c.name }));
  }
  return options;
}

export async function renderOps(root, ctx) {
  root.innerHTML = `
    <section class="space-y-4">
      <div class="card-soft">
        <h2 class="mb-2 text-lg font-semibold">Новая операция</h2>
        <p class="mb-4 text-sm text-soil-700/70">Выберите тип — откроется форма с крупными полями.</p>
        <div class="grid grid-cols-1 gap-3">
          <button type="button" data-type="sale" class="btn-primary w-full text-base">+ Продажа</button>
          <button type="button" data-type="purchase" class="btn-secondary w-full text-base">+ Закупка</button>
          <button type="button" data-type="expense" class="btn-secondary w-full text-base">+ Расходник</button>
        </div>
      </div>
      <div class="card-soft text-sm text-soil-700/70">
        <p class="font-medium text-soil-900 mb-1">Подсказка</p>
        <p>В продаже и закупке выберите растение из списка или нажмите <strong>Создать новую позицию</strong> и укажите группу.</p>
      </div>
    </section>
  `;

  root.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      haptic('medium');
      openOpsForm(btn.dataset.type, ctx);
    });
  });
}

export function openOpsForm(type, ctx) {
  if (type === 'expense') {
    openExpenseForm(ctx);
  } else {
    openProductOpForm(type, ctx);
  }
}

function openExpenseForm(ctx) {
  const sheet = openModal(`
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold">Расходник</h3>
      <button type="button" id="modal-close" class="btn-secondary !min-h-[44px] !px-3">Закрыть</button>
    </div>
    <form id="expense-form" class="space-y-3">
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Сумма, ₽</span>
        <input class="field" name="amount" type="number" inputmode="decimal" min="0" step="1" required placeholder="0" />
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Комментарий *</span>
        <input class="field" name="comment" type="text" required maxlength="200" placeholder="Грунт, доставка…" />
      </label>
      <button type="submit" class="btn-primary w-full">Сохранить</button>
    </form>
  `);

  sheet.querySelector('#modal-close').onclick = () => closeModal();
  sheet.querySelector('#expense-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = Number(fd.get('amount'));
    const comment = String(fd.get('comment') || '').trim();
    if (!comment) {
      showToast('Комментарий обязателен');
      return;
    }
    try {
      await api.createOperation({
        type: 'expense',
        amount,
        quantity: 1,
        comment,
        product_id: null,
      });
      haptic('medium');
      showToast('Расходник сохранён');
      closeModal();
      ctx?.setTab?.('home');
    } catch (err) {
      showToast(err.message);
    }
  };
}

function openProductOpForm(type, ctx) {
  const title = type === 'sale' ? 'Продажа' : 'Закупка';
  let selected = null;
  let searchTimer = null;
  let createOpen = false;
  let selectedGroupId = null;
  let productsCache = [];

  const sheet = openModal(`
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold">${title}</h3>
      <button type="button" id="modal-close" class="btn-secondary !min-h-[44px] !px-3">Закрыть</button>
    </div>
    <form id="op-form" class="space-y-3">
      <label class="block">
        <span class="mb-1 block text-sm font-medium">1. Найдите растение</span>
        <input class="field" id="product-search" type="search" autocomplete="off" placeholder="Начните вводить название…" />
      </label>

      <div id="selected-product" class="selected-product-banner empty">
        <div class="min-w-0 flex-1">
          <div class="text-xs font-semibold uppercase tracking-wide opacity-70">Выбрано</div>
          <div id="selected-product-text" class="text-base font-semibold">Пока ничего — нажмите позицию в списке</div>
        </div>
      </div>

      <div class="product-picker">
        <div class="product-picker-label">2. Список — нажмите нужную строку</div>
        <div id="product-results" class="product-results" role="listbox"></div>
      </div>

      <button type="button" id="open-create" class="btn-secondary w-full !min-h-[52px] text-base">
        + Создать новую позицию
      </button>

      <div id="create-new" class="hidden space-y-3 rounded-2xl border-2 border-leaf-500 bg-leaf-50 p-4"></div>

      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Кол-во</span>
          <input class="field" name="quantity" type="number" inputmode="numeric" min="1" step="1" value="1" required />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Цена за ед., ₽</span>
          <input class="field" name="unit_price" type="number" inputmode="decimal" min="0" step="1" required placeholder="0" />
        </label>
      </div>
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Или общая сумма, ₽</span>
        <input class="field" name="amount" type="number" inputmode="decimal" min="0" step="1" placeholder="необязательно" />
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Комментарий</span>
        <input class="field" name="comment" type="text" maxlength="200" placeholder="необязательно" />
      </label>
      <button type="submit" class="btn-primary w-full">Сохранить операцию</button>
    </form>
  `);

  sheet.querySelector('#modal-close').onclick = (e) => {
    e.preventDefault();
    closeModal();
  };

  const searchInput = sheet.querySelector('#product-search');
  const results = sheet.querySelector('#product-results');
  const selectedBox = sheet.querySelector('#selected-product');
  const selectedText = sheet.querySelector('#selected-product-text');
  const createNew = sheet.querySelector('#create-new');
  const openCreateBtn = sheet.querySelector('#open-create');
  const form = sheet.querySelector('#op-form');

  function setSelected(product) {
    selected = product;
    selectedBox.classList.remove('empty');
    const group = product.category_name
      ? `Группа: ${escapeHtml(product.category_name)}`
      : '';
    selectedText.innerHTML = `${escapeHtml(product.name)}${
      group ? `<div class="mt-0.5 text-sm font-medium opacity-80">${group}</div>` : ''
    }`;
    results.querySelectorAll('.search-hit').forEach((el) => {
      const on = Number(el.dataset.id) === Number(product.id);
      el.classList.toggle('selected', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    haptic('light');
  }

  // Event delegation — survives list re-renders, works on mobile WebView.
  results.addEventListener('click', (e) => {
    const btn = e.target.closest('.search-hit');
    if (!btn || !results.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    const id = Number(btn.dataset.id);
    const product = productsCache.find((p) => Number(p.id) === id);
    if (product) setSelected(product);
  });

  function paintGroupChips() {
    createNew.querySelectorAll('[data-group-id]').forEach((btn) => {
      const on = Number(btn.dataset.groupId) === Number(selectedGroupId);
      btn.classList.toggle('group-chip-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  async function ensureCreatePanel(nameHint = '', { emphasize = false } = {}) {
    const options = await groupSelectOptions();
    const name = (nameHint || searchInput.value || '').trim();

    if (!createOpen) {
      createOpen = true;
      createNew.classList.remove('hidden');
      if (!selectedGroupId && options[0]) selectedGroupId = options[0].id;

      createNew.innerHTML = `
        <p class="text-lg font-bold text-leaf-800">Создать новую позицию</p>
        <p class="text-sm text-soil-700">Укажите название и нажмите группу (список фиксированный).</p>
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Название</span>
          <input class="field" id="new-product-name" type="text" maxlength="120" placeholder="Например: Хойя карноза" />
        </label>
        <div>
          <div class="mb-2 text-sm font-medium">Группа</div>
          <div id="group-chips" class="group-chips" role="group" aria-label="Группа"></div>
        </div>
        <button type="button" id="create-product" class="btn-primary w-full !min-h-[56px] text-base">
          + Создать и выбрать
        </button>
      `;

      const chips = createNew.querySelector('#group-chips');
      chips.innerHTML = options
        .map(
          (c) => `
          <button type="button" class="group-chip" data-group-id="${c.id}">
            ${escapeHtml(c.name)}
          </button>`
        )
        .join('');

      chips.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-group-id]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        selectedGroupId = Number(btn.dataset.groupId);
        paintGroupChips();
        haptic('light');
      });

      createNew.querySelector('#create-product').onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nameInput = createNew.querySelector('#new-product-name');
        const productName = String(nameInput?.value || '').trim();
        if (!productName) {
          showToast('Укажите название');
          nameInput?.focus();
          return;
        }
        if (!selectedGroupId) {
          showToast('Выберите группу');
          return;
        }
        try {
          const product = await api.createProduct({
            name: productName,
            category_id: selectedGroupId,
          });
          showToast('Позиция создана');
          setSelected(product);
          createOpen = false;
          createNew.classList.add('hidden');
          searchInput.value = product.name;
          await runSearch(product.name);
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    const nameInput = createNew.querySelector('#new-product-name');
    if (nameInput && name && document.activeElement !== nameInput) {
      nameInput.value = name;
    }
    paintGroupChips();
    createNew.classList.toggle('create-emphasize', emphasize);
  }

  async function runSearch(q) {
    try {
      const raw = await api.getProducts(q);
      productsCache = Array.isArray(raw) ? raw : [];
      const needle = q.trim();
      const exact = productsCache.some(
        (p) => String(p.name || '').toLowerCase() === needle.toLowerCase()
      );
      const emptyCatalog = productsCache.length === 0;

      results.innerHTML = productsCache.length
        ? productsCache
            .map(
              (p) => `
            <button type="button" class="search-hit ${
              selected && Number(selected.id) === Number(p.id) ? 'selected' : ''
            }" data-id="${p.id}" role="option" aria-selected="${
                selected && Number(selected.id) === Number(p.id) ? 'true' : 'false'
              }">
              <span class="min-w-0 pointer-events-none">
                <span class="block text-base font-semibold leading-tight">${escapeHtml(p.name)}</span>
                <span class="mt-0.5 block text-sm text-soil-700/70">${escapeHtml(
                  p.category_name || ''
                )}</span>
              </span>
              <span class="search-hit-check pointer-events-none" aria-hidden="true">✓</span>
            </button>`
            )
            .join('')
        : `<p class="px-3 py-4 text-sm text-soil-700/70">${
            needle
              ? 'Ничего не найдено — создайте новую позицию ниже.'
              : 'Начните ввод или создайте новую позицию.'
          }</p>`;

      // Open create when useful; do NOT rebuild the panel on every keystroke.
      if (createOpen || (needle && !exact) || (needle && emptyCatalog)) {
        await ensureCreatePanel(needle, { emphasize: emptyCatalog || (needle && !exact) });
      }
    } catch (err) {
      results.innerHTML = `<p class="px-3 py-4 text-sm text-petal-600">${escapeHtml(
        err.message
      )}</p>`;
      await ensureCreatePanel(searchInput.value.trim(), { emphasize: true });
    }
  }

  openCreateBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    haptic('light');
    await ensureCreatePanel(searchInput.value.trim(), { emphasize: true });
    createNew.querySelector('#new-product-name')?.focus();
  };

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(searchInput.value.trim()), 220);
  });

  runSearch('');

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!selected) {
      showToast('Выберите или создайте позицию');
      return;
    }
    const fd = new FormData(form);
    const quantity = Number(fd.get('quantity'));
    const unitPrice = Number(fd.get('unit_price'));
    const amountRaw = String(fd.get('amount') || '').trim();
    const amount = amountRaw !== '' ? Number(amountRaw) : unitPrice * quantity;
    const comment = String(fd.get('comment') || '').trim() || null;

    try {
      await api.createOperation({
        type,
        product_id: selected.id,
        quantity,
        amount,
        comment,
      });
      haptic('medium');
      showToast(`${title} сохранена`);
      closeModal();
      ctx?.setTab?.('home');
    } catch (err) {
      showToast(err.message);
    }
  };
}

export async function openEditModal(op, onSaved) {
  const isExpense = op.type === 'expense';
  const sheet = openModal(`
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold">Редактирование</h3>
      <button type="button" id="modal-close" class="btn-secondary !min-h-[44px] !px-3">Закрыть</button>
    </div>
    <p class="mb-3 text-sm text-soil-700/70">${escapeHtml(typeLabel(op.type))} · ${escapeHtml(
      op.product_name || op.comment || ''
    )}</p>
    <form id="edit-form" class="space-y-3">
      ${
        isExpense
          ? ''
          : `<label class="block">
              <span class="mb-1 block text-sm font-medium">Количество</span>
              <input class="field" name="quantity" type="number" min="1" step="1" value="${op.quantity}" required />
            </label>`
      }
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Сумма, ₽</span>
        <input class="field" name="amount" type="number" min="0" step="1" value="${op.amount}" required />
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Комментарий ${isExpense ? '*' : ''}</span>
        <input class="field" name="comment" type="text" maxlength="200" value="${escapeHtml(
          op.comment || ''
        )}" ${isExpense ? 'required' : ''} />
      </label>
      <button type="submit" class="btn-primary w-full">Сохранить</button>
    </form>
  `);

  sheet.querySelector('#modal-close').onclick = () => closeModal();
  sheet.querySelector('#edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      amount: Number(fd.get('amount')),
      comment: String(fd.get('comment') || '').trim() || null,
    };
    if (!isExpense) body.quantity = Number(fd.get('quantity'));
    try {
      await api.updateOperation(op.id, body);
      closeModal();
      await onSaved?.();
    } catch (err) {
      showToast(err.message);
    }
  };
}
