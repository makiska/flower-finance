import { api } from '../api.js';
import { escapeHtml, openModal, closeModal, showToast } from '../utils.js';
import { haptic } from '../telegram.js';
import { FIXED_GROUPS, itemBadge } from '../groups.js';

export async function renderCatalog(root) {
  const state = {
    search: '',
    categoryId: '',
    products: [],
    categories: [],
  };

  function orderedCategories() {
    const fixed = FIXED_GROUPS.map((name) => state.categories.find((c) => c.name === name)).filter(Boolean);
    const custom = state.categories
      .filter((c) => !FIXED_GROUPS.includes(c.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return [...fixed, ...custom];
  }

  function visibleProducts() {
    const needle = state.search.trim().toLowerCase();
    return state.products.filter((product) => {
      if (state.categoryId && String(product.category_id) !== String(state.categoryId)) return false;
      if (needle && !String(product.name || '').toLowerCase().includes(needle)) return false;
      return true;
    });
  }

  async function load() {
    root.innerHTML = `<div class="py-8 text-center text-soil-700/70">Загрузка…</div>`;
    try {
      const [products, categories] = await Promise.all([api.getItems(), api.getCategories()]);
      state.products = products;
      state.categories = categories;
      paint();
    } catch (err) {
      root.innerHTML = `<div class="card-soft text-petal-600">${escapeHtml(err.message)}</div>`;
    }
  }

  function paint() {
    const categories = orderedCategories();
    const products = visibleProducts();
    root.innerHTML = `
      <section class="tight">
        <div class="card-soft tight">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm text-soil-700/60">${products.length} из ${state.products.length}</span>
            <div class="flex gap-2">
              <button type="button" id="new-group" class="btn-secondary btn-compact">Новая группа</button>
              <button type="button" id="edit-groups" class="btn-secondary btn-compact">Группы</button>
            </div>
          </div>
          <input class="field field-compact" id="catalog-search" type="search" placeholder="Название…" value="${escapeHtml(state.search)}" />
          <div class="chip-scroll" id="catalog-filters">
            <button type="button" class="chip chip-compact ${state.categoryId === '' ? 'active' : ''}" data-category-id="">Все</button>
            ${categories
              .map(
                (category) => `
                <button type="button" class="chip chip-compact ${String(state.categoryId) === String(category.id) ? 'active' : ''}" data-category-id="${category.id}">
                  ${escapeHtml(category.name)}
                </button>`
              )
              .join('')}
          </div>
          <button type="button" id="new-product" class="btn-primary btn-compact w-full">Новая позиция</button>
        </div>
        <div class="card-soft">
          ${
            products.length
              ? products
                  .map(
                    (product) => `
                    <div class="list-item">
                      <div class="min-w-0 flex-1">
                        <div class="font-medium truncate">${escapeHtml(product.name)}</div>
                        <div class="text-xs text-soil-700/60">
                          ${escapeHtml(itemBadge(product))}
                          · ${Number(product.operation_count) || 0} опер.
                        </div>
                      </div>
                      ${
                        product.is_preset
                          ? '<span class="item-badge">каталог</span>'
                          : `<button type="button" class="btn-secondary !min-h-[40px] !px-3 !py-1 text-xs" data-edit="${product.id}">Изменить</button>`
                      }
                    </div>`
                  )
                  .join('')
              : '<p class="py-4 text-sm text-soil-700/60">Ничего не найдено</p>'
          }
        </div>
      </section>
    `;

    const search = root.querySelector('#catalog-search');
    search.addEventListener('input', () => {
      state.search = search.value;
      paint();
      const next = root.querySelector('#catalog-search');
      if (next) {
        next.focus();
        const end = next.value.length;
        next.setSelectionRange(end, end);
      }
    });

    root.querySelectorAll('[data-category-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.categoryId = btn.dataset.categoryId || '';
        haptic('light');
        paint();
      });
    });

    root.querySelector('#new-product').onclick = () => openProductForm(null);
    root.querySelector('#new-group').onclick = () => openGroupForm(null);
    root.querySelector('#edit-groups').onclick = () => openGroupsSheet();
    root.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const product = state.products.find((item) => String(item.id) === btn.dataset.edit);
        if (product) openProductForm(product);
      });
    });
  }

  function groupChips(selectedId) {
    return orderedCategories()
      .map((category) => {
        const on = String(selectedId) === String(category.id);
        return `<button type="button" class="group-chip${on ? ' group-chip-active' : ''}" data-group-id="${category.id}" aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(category.name)}</button>`;
      })
      .join('');
  }

  function openProductForm(product) {
    const categories = orderedCategories();
    let selectedId = product
      ? product.category_id
      : categories.find((c) => String(c.id) === String(state.categoryId))?.id || categories[0]?.id;
    const sheet = openModal(`
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold">${product ? 'Позиция' : 'Новая позиция'}</h3>
        <button type="button" id="modal-close" class="btn-secondary !min-h-[44px] !px-3">Закрыть</button>
      </div>
      <form id="product-form" class="space-y-3">
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Название</span>
          <input class="field" name="name" type="text" maxlength="120" required value="${escapeHtml(product?.name || '')}" />
        </label>
        <div>
          <div class="mb-2 text-sm font-medium">Группа</div>
          <div id="product-groups" class="group-chips">${groupChips(selectedId)}</div>
        </div>
        <p class="text-sm text-soil-700/70">${
          product
            ? 'Название и группа обновятся в уже созданных операциях и отчётах. Сами операции останутся на этой позиции.'
            : 'Позиция сразу появится в продаже, закупке, истории и отчётах.'
        }</p>
        <button type="submit" class="btn-primary w-full">${product ? 'Сохранить' : 'Создать'}</button>
      </form>
    `);

    sheet.querySelector('#modal-close').onclick = () => closeModal();
    sheet.querySelector('#product-groups').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-group-id]');
      if (!btn) return;
      e.preventDefault();
      selectedId = Number(btn.dataset.groupId);
      sheet.querySelectorAll('[data-group-id]').forEach((chip) => {
        const on = String(chip.dataset.groupId) === String(selectedId);
        chip.classList.toggle('group-chip-active', on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });

    sheet.querySelector('#product-form').onsubmit = async (e) => {
      e.preventDefault();
      const name = String(new FormData(e.target).get('name') || '').trim();
      if (!name) {
        showToast('Укажите название');
        return;
      }
      if (!selectedId) {
        showToast('Выберите группу');
        return;
      }
      try {
        if (product) {
          if (product.is_preset) {
            showToast('Общую позицию нельзя изменить');
            return;
          }
          await api.updateProduct(product.id, { name, category_id: selectedId });
          showToast('Позиция обновлена');
        } else {
          await api.createProduct({ name, category_id: selectedId, reject_duplicate: true });
          showToast('Позиция создана');
        }
        haptic('medium');
        closeModal();
        await load();
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  function openGroupForm(category) {
    const sheet = openModal(`
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold">${category ? 'Группа' : 'Новая группа'}</h3>
        <button type="button" id="modal-close" class="btn-secondary !min-h-[44px] !px-3">Закрыть</button>
      </div>
      <form id="group-form" class="space-y-3">
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Название</span>
          <input class="field" name="name" type="text" maxlength="40" required value="${escapeHtml(category?.name || '')}" />
        </label>
        <p class="text-sm text-soil-700/70">${
          category
            ? 'Новое название группы сразу появится у позиций, в операциях и в отчётах.'
            : 'Группу можно будет выбрать при создании позиции.'
        }</p>
        <button type="submit" class="btn-primary w-full">${category ? 'Сохранить' : 'Создать'}</button>
      </form>
    `);
    sheet.querySelector('#modal-close').onclick = () => closeModal();
    sheet.querySelector('#group-form').onsubmit = async (e) => {
      e.preventDefault();
      const name = String(new FormData(e.target).get('name') || '').trim();
      if (!name) {
        showToast('Укажите название группы');
        return;
      }
      try {
        if (category) {
          await api.updateCategory(category.id, { name });
          showToast('Группа обновлена');
        } else {
          await api.createCategory({ name });
          showToast('Группа создана');
        }
        haptic('medium');
        closeModal();
        await load();
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  function openGroupsSheet() {
    const categories = orderedCategories();
    const sheet = openModal(`
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold">Группы</h3>
        <button type="button" id="modal-close" class="btn-secondary !min-h-[44px] !px-3">Закрыть</button>
      </div>
      <div>
        ${categories
          .map((category) => {
            const fixed = FIXED_GROUPS.includes(category.name);
            const count = state.products.filter((product) => String(product.category_id) === String(category.id)).length;
            return `
              <div class="list-item">
                <div class="min-w-0 flex-1">
                  <div class="font-medium truncate">${escapeHtml(category.name)}</div>
                  <div class="text-xs text-soil-700/60">${count} поз.${fixed ? ' · основная' : ''}</div>
                </div>
                ${
                  fixed
                    ? ''
                    : `<button type="button" class="btn-secondary !min-h-[40px] !px-3 !py-1 text-xs" data-rename="${category.id}">Изменить</button>`
                }
              </div>`;
          })
          .join('')}
      </div>
    `);
    sheet.querySelector('#modal-close').onclick = () => closeModal();
    sheet.querySelectorAll('[data-rename]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const category = state.categories.find((item) => String(item.id) === btn.dataset.rename);
        if (category) openGroupForm(category);
      });
    });
  }

  await load();
}
