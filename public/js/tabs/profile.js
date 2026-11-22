import { api } from '../api.js';
import { escapeHtml, showToast } from '../utils.js';
import { PLANT_GROUPS } from '../groups.js';

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
              <h2 class="mb-2 text-lg font-semibold">Кандидаты</h2>
              <div id="candidates-list"><p class="text-sm text-soil-700/60">Загрузка…</p></div>
            </div>`
          : ''
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
      list.innerHTML = '<p class="text-sm text-soil-700/60">Нет новых кандидатов</p>';
      return;
    }
    const groups = PLANT_GROUPS.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    list.innerHTML = rows
      .map(
        (row) => `
        <form class="candidate-form list-item" data-id="${row.id}">
          <div class="min-w-0 flex-1 tight">
            <div class="text-xs text-soil-700/60">${row.users_count} чел.</div>
            <input class="field field-compact" name="name" value="${escapeHtml(row.display_name)}" />
            <select class="field field-compact" name="group">${groups}</select>
            <input class="field field-compact" name="subgroup" placeholder="Подгруппа" value="${escapeHtml(row.subgroup || '')}" />
            <div class="flex gap-2">
              <button type="submit" class="btn-primary btn-compact">В общий каталог</button>
              <button type="button" data-reject class="btn-secondary btn-compact">Скрыть</button>
            </div>
          </div>
        </form>`
      )
      .join('');
    list.querySelectorAll('select[name="group"]').forEach((select, index) => {
      const group = rows[index]?.group;
      if ([...select.options].some((option) => option.value === group)) select.value = group;
    });
    list.querySelectorAll('.candidate-form').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        try {
          await api.approveCandidate(form.dataset.id, {
            name: String(data.get('name') || ''),
            group: String(data.get('group') || ''),
            subgroup: String(data.get('subgroup') || ''),
          });
          showToast('Добавлено в общий каталог');
          await loadCandidates(root);
        } catch (err) {
          showToast(err.message);
        }
      });
      form.querySelector('[data-reject]').addEventListener('click', async () => {
        try {
          await api.rejectCandidate(form.dataset.id);
          showToast('Кандидат скрыт');
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
