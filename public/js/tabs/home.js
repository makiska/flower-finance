import { api } from '../api.js';
import { formatMoney, formatDate, typeLabel, escapeHtml, operationTitle, showToast, closeModal } from '../utils.js';
import { openEditModal } from './ops.js';
import { haptic } from '../telegram.js';

export async function renderHome(root, ctx) {
  root.innerHTML = `<div class="py-8 text-center text-soil-700/70">Загрузка…</div>`;

  try {
    const [analytics, ops] = await Promise.all([
      api.getAnalytics('month'),
      api.getOperations({ limit: 8 }),
    ]);

    const s = analytics.summary;
    root.innerHTML = `
      <section class="grid grid-cols-1 gap-3">
        <div class="card-soft">
          <p class="mb-3 text-sm font-medium text-soil-700/70">Свод за текущий месяц</p>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div>
              <div class="text-xs text-soil-700/60">Выручка</div>
              <div class="stat-value op-sale text-base sm:text-xl">${escapeHtml(formatMoney(s.revenue))}</div>
            </div>
            <div>
              <div class="text-xs text-soil-700/60">Затраты</div>
              <div class="stat-value op-expense text-base sm:text-xl">${escapeHtml(formatMoney(s.costs))}</div>
            </div>
            <div>
              <div class="text-xs text-soil-700/60">Прибыль</div>
              <div class="stat-value text-base sm:text-xl ${s.profit >= 0 ? 'op-sale' : 'op-expense'}">${escapeHtml(formatMoney(s.profit))}</div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-2">
          <button type="button" data-action="sale" class="btn-primary w-full">+ Продажа</button>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" data-action="purchase" class="btn-secondary w-full">+ Закупка</button>
            <button type="button" data-action="expense" class="btn-secondary w-full">+ Расходник</button>
          </div>
        </div>

        <div class="card-soft">
          <div class="mb-1 flex items-center justify-between">
            <h2 class="text-base font-semibold">Последние операции</h2>
            <button type="button" data-goto="history" class="min-h-touch px-2 text-sm font-medium text-leaf-600">Все</button>
          </div>
          <div id="home-ops">
            ${ops.items.length ? ops.items.map(renderOpRow).join('') : '<p class="py-4 text-sm text-soil-700/60">Пока нет операций</p>'}
          </div>
        </div>
      </section>
    `;

    root.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        haptic('medium');
        ctx.openOpsForm(btn.dataset.action);
      });
    });

    root.querySelector('[data-goto="history"]')?.addEventListener('click', () => {
      ctx.setTab('history');
    });

    root.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.edit);
        const op = ops.items.find((x) => x.id === id);
        if (!op) return;
        await openEditModal(op, async () => {
          showToast('Сохранено');
          await renderHome(root, ctx);
        });
      });
    });

    root.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.delete);
        if (!confirm('Удалить операцию?')) return;
        try {
          await api.deleteOperation(id);
          haptic('light');
          showToast('Удалено');
          await renderHome(root, ctx);
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="card-soft text-petal-600">${escapeHtml(err.message)}</div>`;
  }
}

function renderOpRow(op) {
  const sign = op.type === 'sale' ? '+' : '−';
  return `
    <div class="list-item">
      <div class="min-w-0 flex-1">
        <div class="font-medium truncate">${escapeHtml(operationTitle(op))}</div>
        <div class="text-xs text-soil-700/60">
          <span class="op-${op.type}">${typeLabel(op.type)}</span>
          · ${escapeHtml(formatDate(op.date))}
          ${op.quantity > 1 ? ` · ${op.quantity} шт` : ''}
        </div>
      </div>
      <div class="flex flex-col items-end gap-1">
        <div class="font-semibold op-${op.type}">${sign}${escapeHtml(formatMoney(op.amount))}</div>
        <div class="flex gap-1">
          <button type="button" data-edit="${op.id}" class="btn-secondary !min-h-[40px] !px-3 !py-1 text-xs">Изм.</button>
          <button type="button" data-delete="${op.id}" class="btn-danger text-xs">×</button>
        </div>
      </div>
    </div>
  `;
}

export { closeModal };
