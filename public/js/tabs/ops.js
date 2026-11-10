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

let categoriesCache = null;

async function getCategories() {
  if (!categoriesCache) {
    const rows = await api.getCategories();
    categoriesCache = Array.isArray(rows) ? rows : [];
  }
  return categoriesCache;
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
        <p>Группу выбираете <strong>только при создании новинки</strong>. Если растение уже в списке — просто нажмите его (группа уже задана).</p>
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

  const sheet = openModal(`
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold">${title}</h3>
      <button type="button" id="modal-close" class="btn-secondary !min-h-[44px] !px-3">Закрыть</button>
    </div>
    <form id="op-form" class="space-y-3">
      <p class="rounded-xl bg-soil-50 px-3 py-2 text-sm text-soil-700/80">
        Группа нужна <strong>только для новинки</strong>. Существующую позицию выбираете из списка — её группа уже задана.
      </p>

      <label class="block">
        <span class="mb-1 block text-sm font-medium">1. Найдите растение</span>
        <input class="field" id="product-search" type="search" autocomplete="off" placeholder="Начните вводить название…" />
      </label>

      <div id="selected-product" class="selected-product-banner empty">
        <div class="min-w-0 flex-1">
          <div class="text-xs font-semibold uppercase tracking-wide opacity-70">Выбрано</div>
          <div id="selected-product-text" class="text-base font-semibold">Пока ничего — нажмите строку в списке ниже</div>
        </div>
      </div>

      <div id="create-new" class="hidden space-y-3 rounded-2xl border-2 border-leaf-500 bg-leaf-50 p-4 shadow-sm"></div>

      <div class="product-picker">
        <div class="product-picker-label">2. Нажмите нужную позицию в списке (группа уже у позиции)</div>
        <div id="product-results" class="product-results"></div>
      </div>

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
      <button type="submit" class="btn-primary w-full">Сохранить</button>
    </form>
  `);

  sheet.querySelector('#modal-close').onclick = () => closeModal();

  const searchInput = sheet.querySelector('#product-search');
  const results = sheet.querySelector('#product-results');
  const selectedBox = sheet.querySelector('#selected-product');
  const selectedText = sheet.querySelector('#selected-product-text');
  const createNew = sheet.querySelector('#create-new');
  const form = sheet.querySelector('#op-form');

  function setSelected(product) {
    selected = product;
    selectedBox.classList.remove('empty');
    const group = product.category_name
      ? `Группа: ${escapeHtml(product.category_name)}`
      : 'Группа уже задана у позиции';
    selectedText.innerHTML = `${escapeHtml(product.name)}<div class="mt-0.5 text-sm font-medium opacity-80">${group}</div>`;
    results.querySelectorAll('.search-hit').forEach((el) => {
      el.classList.toggle('selected', Number(el.dataset.id) === product.id);
    });
    haptic('light');
  }

  async function renderCreateNew(name) {
    const cats = await getCategories();
    if (!cats.length) {
      createNew.classList.remove('hidden');
      createNew.innerHTML = `<p class="text-sm text-petal-600">Нет групп для новой позиции — обновите страницу.</p>`;
      return;
    }
    createNew.classList.remove('hidden');
    createNew.innerHTML = `
      <p class="text-lg font-bold text-leaf-800">Создать новинку</p>
      <p class="text-sm text-soil-700">Точного совпадения нет. Здесь выбираете <strong>группу</strong> — только при создании новой позиции для этой ${type === 'sale' ? 'продажи' : 'закупки'}.</p>
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Группа для новинки</span>
        <select id="new-category" class="field" aria-label="Группа для новой позиции">
          ${cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </label>
      <button type="button" id="create-product" class="btn-primary w-full !min-h-[56px] text-base">
        + Создать новинку «${escapeHtml(name)}»
      </button>
    `;
    createNew.querySelector('#create-product').onclick = async () => {
      const category_id = Number(createNew.querySelector('#new-category').value);
      try {
        const product = await api.createProduct({ name, category_id });
        showToast('Новинка создана и выбрана');
        setSelected(product);
        createNew.classList.add('hidden');
        createNew.innerHTML = '';
        searchInput.value = product.name;
        await runSearch(product.name);
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  async function runSearch(q) {
    try {
      const raw = await api.getProducts(q);
      const products = Array.isArray(raw) ? raw : [];
      const needle = q.trim();
      const exact = products.some((p) => String(p.name || '').toLowerCase() === needle.toLowerCase());

      results.innerHTML = products.length
        ? products
            .map(
              (p) => `
            <button type="button" class="search-hit ${selected?.id === p.id ? 'selected' : ''}" data-id="${p.id}">
              <span class="min-w-0">
                <span class="block text-base font-semibold leading-tight">${escapeHtml(p.name)}</span>
                <span class="mt-0.5 block text-sm text-soil-700/70">${escapeHtml(p.category_name || '')}</span>
              </span>
              <span class="search-hit-check" aria-hidden="true">✓</span>
            </button>`
            )
            .join('')
        : needle
          ? '<p class="px-3 py-4 text-sm text-soil-700/70">В списке пусто — создайте новинку кнопкой выше.</p>'
          : '<p class="px-3 py-4 text-sm text-soil-700/70">Начните вводить название или создайте новинку после ввода.</p>';

      results.querySelectorAll('[data-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const product = products.find((p) => p.id === Number(btn.dataset.id));
          if (product) setSelected(product);
        });
      });

      // Always offer create when there is search text and no exact name match
      // (covers empty list and partial matches alike).
      if (needle && !exact) {
        await renderCreateNew(needle);
      } else {
        createNew.classList.add('hidden');
        createNew.innerHTML = '';
      }
    } catch (err) {
      createNew.classList.add('hidden');
      createNew.innerHTML = '';
      results.innerHTML = `<p class="px-3 py-4 text-sm text-petal-600">${escapeHtml(err.message)}</p>`;
    }
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(searchInput.value.trim()), 220);
  });

  runSearch('');

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!selected) {
      showToast('Выберите товар');
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
    <p class="mb-3 text-sm text-soil-700/70">${escapeHtml(typeLabel(op.type))} · ${escapeHtml(op.product_name || op.comment || '')}</p>
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
        <input class="field" name="comment" type="text" maxlength="200" value="${escapeHtml(op.comment || '')}" ${isExpense ? 'required' : ''} />
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
