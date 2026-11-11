import { api } from '../api.js';
import {
  escapeHtml,
  openModal,
  closeModal,
  showToast,
  typeLabel,
} from '../utils.js';
import { haptic } from '../telegram.js';

const FIXED_GROUPS = [
  'Ароидные',
  'Хойи',
  'Бегонии',
  'Папоротники',
  'Другие растения',
  'Расходники',
];

export async function renderOps(root, ctx) {
  root.innerHTML = `
    <section class="space-y-4">
      <div class="card-soft">
        <h2 class="mb-2 text-lg font-semibold">Новая операция</h2>
        <div class="grid grid-cols-1 gap-3">
          <button type="button" data-type="sale" class="btn-primary w-full text-base">+ Продажа</button>
          <button type="button" data-type="purchase" class="btn-secondary w-full text-base">+ Закупка</button>
          <button type="button" data-type="expense" class="btn-secondary w-full text-base">+ Расходник</button>
        </div>
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
  if (type === 'expense') openExpenseForm(ctx);
  else openProductOpForm(type, ctx);
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
  let productsCache = [];
  let selectedGroupName = FIXED_GROUPS[0];

  const sheet = openModal(`
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold">${title}</h3>
      <button type="button" id="modal-close" class="btn-secondary !min-h-[44px] !px-3">Закрыть</button>
    </div>
    <form id="op-form" class="nom-form">
      <input
        class="field"
        id="product-search"
        type="search"
        autocomplete="off"
        placeholder="Название растения…"
      />

      <div id="product-results" class="nom-results" role="listbox"></div>

      <button type="button" id="open-create" class="btn-primary w-full !min-h-[52px] text-base hidden">
        + Создать новую позицию
      </button>

      <div id="create-panel" class="nom-create hidden">
        <div class="mb-2 text-base font-semibold">Новая позиция</div>
        <label class="block mb-3">
          <span class="mb-1 block text-sm font-medium">Название</span>
          <input class="field" id="new-product-name" type="text" maxlength="120" />
        </label>
        <div class="mb-3">
          <div class="mb-2 text-sm font-medium">Группа</div>
          <div id="group-chips" class="group-chips">
            ${FIXED_GROUPS.map(
              (name) =>
                `<button type="button" class="group-chip${
                  name === selectedGroupName ? ' group-chip-active' : ''
                }" data-group-name="${escapeHtml(name)}" aria-pressed="${
                  name === selectedGroupName ? 'true' : 'false'
                }">${escapeHtml(name)}</button>`
            ).join('')}
          </div>
        </div>
        <button type="button" id="create-product" class="btn-primary w-full !min-h-[52px]">
          Создать и выбрать
        </button>
      </div>

      <div id="selected-line" class="nom-selected hidden"></div>

      <div class="nom-amounts">
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
          <span class="mb-1 block text-sm font-medium">Или сумма, ₽</span>
          <input class="field" name="amount" type="number" inputmode="decimal" min="0" step="1" placeholder="необязательно" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Комментарий</span>
          <input class="field" name="comment" type="text" maxlength="200" placeholder="необязательно" />
        </label>
        <button type="submit" class="btn-primary w-full">Сохранить</button>
      </div>
    </form>
  `);

  sheet.querySelector('#modal-close').onclick = (e) => {
    e.preventDefault();
    closeModal();
  };

  const searchInput = sheet.querySelector('#product-search');
  const results = sheet.querySelector('#product-results');
  const openCreateBtn = sheet.querySelector('#open-create');
  const createPanel = sheet.querySelector('#create-panel');
  const selectedLine = sheet.querySelector('#selected-line');
  const form = sheet.querySelector('#op-form');
  const nameInput = sheet.querySelector('#new-product-name');

  function hideCreate() {
    createPanel.classList.add('hidden');
  }

  function showCreate() {
    nameInput.value = searchInput.value.trim();
    paintGroups();
    createPanel.classList.remove('hidden');
    openCreateBtn.classList.add('hidden');
    nameInput.focus();
  }

  function paintGroups() {
    createPanel.querySelectorAll('[data-group-name]').forEach((btn) => {
      const on = btn.dataset.groupName === selectedGroupName;
      btn.classList.toggle('group-chip-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setSelected(product) {
    selected = product;
    selectedLine.classList.remove('hidden');
    selectedLine.innerHTML = `
      <div class="text-xs uppercase tracking-wide opacity-70">Выбрано</div>
      <div class="text-base font-semibold">${escapeHtml(product.name)}</div>
      <div class="text-sm opacity-80">${escapeHtml(product.category_name || '')}</div>
    `;
    results.querySelectorAll('.search-hit').forEach((el) => {
      el.classList.toggle('selected', Number(el.dataset.id) === Number(product.id));
    });
    haptic('light');
  }

  results.addEventListener('click', (e) => {
    const btn = e.target.closest('.search-hit');
    if (!btn) return;
    e.preventDefault();
    const product = productsCache.find((p) => Number(p.id) === Number(btn.dataset.id));
    if (!product) return;
    setSelected(product);
    hideCreate();
    openCreateBtn.classList.add('hidden');
  });

  createPanel.querySelector('#group-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-group-name]');
    if (!btn) return;
    e.preventDefault();
    selectedGroupName = btn.dataset.groupName;
    paintGroups();
    haptic('light');
  });

  sheet.querySelector('#create-product').onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const name = String(nameInput.value || '').trim();
    if (!name) {
      showToast('Укажите название');
      nameInput.focus();
      return;
    }
    if (!selectedGroupName) {
      showToast('Выберите группу');
      return;
    }
    try {
      const product = await api.createProduct({
        name,
        category_name: selectedGroupName,
      });
      setSelected(product);
      hideCreate();
      openCreateBtn.classList.add('hidden');
      searchInput.value = product.name;
      await runSearch(product.name);
      showToast('Позиция выбрана');
    } catch (err) {
      showToast(err.message);
    }
  };

  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    sheet.querySelector('#create-product').click();
  });

  async function runSearch(q) {
    const needle = q.trim();
    try {
      const raw = needle ? await api.getProducts(needle) : [];
      productsCache = Array.isArray(raw) ? raw : [];

      if (!needle) {
        results.innerHTML = '';
        openCreateBtn.classList.add('hidden');
        hideCreate();
        return;
      }

      if (productsCache.length) {
        results.innerHTML = productsCache
          .map(
            (p) => `
            <button type="button" class="search-hit ${
              selected && Number(selected.id) === Number(p.id) ? 'selected' : ''
            }" data-id="${p.id}">
              <span class="min-w-0 pointer-events-none">
                <span class="block text-base font-semibold leading-tight">${escapeHtml(p.name)}</span>
                <span class="mt-0.5 block text-sm text-soil-700/70">${escapeHtml(
                  p.category_name || ''
                )}</span>
              </span>
              <span class="search-hit-check pointer-events-none" aria-hidden="true">✓</span>
            </button>`
          )
          .join('');
        openCreateBtn.classList.add('hidden');
        if (document.activeElement?.id !== 'new-product-name') hideCreate();
      } else {
        results.innerHTML = '';
        openCreateBtn.classList.remove('hidden');
      }
    } catch (err) {
      results.innerHTML = `<p class="py-3 text-sm text-petal-600">${escapeHtml(err.message)}</p>`;
      openCreateBtn.classList.remove('hidden');
    }
  }

  openCreateBtn.onclick = (e) => {
    e.preventDefault();
    haptic('light');
    showCreate();
  };

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(searchInput.value), 200);
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!selected) {
      showToast('Выберите растение из списка или создайте новое');
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
