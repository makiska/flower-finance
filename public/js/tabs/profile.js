import { api } from '../api.js';
import { escapeHtml, showToast } from '../utils.js';
import { FIXED_GROUPS } from '../groups.js';

export async function renderProfile(root) {
  let isAdmin = false;
  try {
    const me = await api.getMe();
    isAdmin = Boolean(me?.isAdmin);
  } catch {
    isAdmin = false;
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
          <li>В разделе «Ассортимент» весь список позиций и групп. Правка названия и группы сразу видна в операциях и отчётах.</li>
        </ul>
      </div>

      <div class="card-soft space-y-1">
        <h2 class="text-lg font-semibold">Аккаунт</h2>
        <p class="text-sm text-soil-700/80">Выйти из аккаунта</p>
        <p class="text-sm text-soil-700/60">Пока это только подпись: выход ещё не подключён.</p>
      </div>

      ${
        isAdmin
          ? `<div class="card-soft" id="candidates-card">
              <h2 class="mb-1 text-lg font-semibold">Позиции на рассмотрение в общий каталог</h2>
              <p class="catalog-note">Новые названия, которые создают в учёте. Можно поправить имя и сразу опубликовать: продажи перейдут на эту позицию. Если это уже есть в каталоге, выберите похожую и подмените.</p>
              <div id="candidates-list"><p class="text-sm text-soil-700/60">Загрузка…</p></div>
            </div>`
          : `<div class="card-soft">
              <h2 class="mb-2 text-lg font-semibold">Позиции на рассмотрение в общий каталог</h2>
              <p class="text-sm text-soil-700/80">Модерация общего каталога выключена: на сервере не задан ADMIN_TELEGRAM_ID или он не совпадает с вашим Telegram ID.</p>
            </div>`
      }
    </section>
  `;

  if (isAdmin) loadCandidates(root);
}

async function loadCandidates(root) {
  const list = root.querySelector('#candidates-list');
  if (!list) return;
  try {
    const rows = await api.getCandidates();
    if (!rows.length) {
      list.innerHTML = '<p class="text-sm text-soil-700/60">Нет позиций на рассмотрение</p>';
      return;
    }
    const groups = FIXED_GROUPS.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    list.innerHTML = rows
      .map((row) => {
        const similar = Array.isArray(row.similar) ? row.similar : [];
        const similarHtml = similar.length
          ? `<div class="review-similar">
              <div class="text-xs text-soil-700/60">Похожие в общем каталоге</div>
              ${similar
                .map(
                  (item) => `
                  <button type="button" class="btn-secondary btn-compact" data-use-preset="${item.id}"
                    data-name="${escapeHtml(item.name)}" data-group="${escapeHtml(item.group)}"
                    data-subgroup="${escapeHtml(item.subgroup || '')}">
                    ${escapeHtml(item.name)} · ${escapeHtml(item.group)} · ${Math.round(Number(item.score) * 100)}%
                  </button>`
                )
                .join('')}
            </div>`
          : '<p class="text-xs text-soil-700/60">Похожих позиций в общем каталоге нет</p>';
        return `
        <form class="candidate-form list-item" data-id="${row.id}">
          <div class="min-w-0 flex-1 tight">
            <div class="text-xs text-soil-700/60">${row.users_count} чел.</div>
            <input class="field field-compact" name="name" value="${escapeHtml(row.display_name)}" />
            <select class="field field-compact" name="group">${groups}</select>
            <input class="field field-compact" name="subgroup" placeholder="Подгруппа" value="${escapeHtml(row.subgroup || '')}" />
            ${similarHtml}
            <div class="flex gap-2">
              <button type="submit" class="btn-primary btn-compact">Опубликовать и подменить</button>
              <button type="button" data-reject class="btn-secondary btn-compact">Скрыть</button>
            </div>
          </div>
        </form>`;
      })
      .join('');
    list.querySelectorAll('select[name="group"]').forEach((select, index) => {
      const group = rows[index]?.group;
      if ([...select.options].some((option) => option.value === group)) select.value = group;
    });
    list.querySelectorAll('.candidate-form').forEach((form) => {
      const clearPreset = () => {
        delete form.dataset.presetId;
      };
      form.elements.name.addEventListener('input', clearPreset);
      form.elements.group.addEventListener('change', clearPreset);
      form.elements.subgroup.addEventListener('input', clearPreset);
      form.querySelectorAll('[data-use-preset]').forEach((button) => {
        button.addEventListener('click', () => {
          form.dataset.presetId = button.dataset.usePreset || button.dataset.presetId || '';
          form.elements.name.value = button.dataset.name || '';
          if ([...form.elements.group.options].some((option) => option.value === button.dataset.group)) {
            form.elements.group.value = button.dataset.group;
          }
          form.elements.subgroup.value = button.dataset.subgroup || '';
          form.querySelectorAll('[data-use-preset]').forEach((item) => item.classList.remove('active'));
          button.classList.add('active');
        });
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        try {
          const result = await api.approveCandidate(form.dataset.id, {
            name: String(data.get('name') || ''),
            group: String(data.get('group') || ''),
            subgroup: String(data.get('subgroup') || ''),
            preset_id: form.dataset.presetId ? Number(form.dataset.presetId) : null,
          });
          const moved = Number(result?.moved_operations) || 0;
          showToast(
            form.dataset.presetId
              ? `Подменено на позицию каталога, продаж: ${moved}`
              : `Опубликовано в общий каталог, продаж: ${moved}`
          );
          await loadCandidates(root);
        } catch (err) {
          showToast(err.message);
        }
      });
      form.querySelector('[data-reject]').addEventListener('click', async () => {
        try {
          await api.rejectCandidate(form.dataset.id);
          showToast('Позиция скрыта');
          await loadCandidates(root);
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  } catch (err) {
    list.innerHTML = `<p class="text-sm text-petal-600">${escapeHtml(err.message)}</p>`;
  }
}
