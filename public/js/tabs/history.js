import { api } from '../api.js';
import {
  escapeHtml,
  formatMoney,
  formatDate,
  typeLabel,
  operationTitle,
  showToast,
} from '../utils.js';
import { openEditModal } from './ops.js';
import { haptic } from '../telegram.js';

export async function renderHistory(root) {
  const state = {
    period: 'month',
    type: '',
  };

  async function load() {
    root.innerHTML = `<div class="py-8 text-center text-soil-700/70">Загрузка…</div>`;
    try {
      const data = await api.getOperations({
        period: state.period === 'all' ? '' : 'month',
        type: state.type,
        limit: 200,
      });

      root.innerHTML = `
        <section class="space-y-3">
          <div class="card-soft space-y-3">
            <h2 class="text-lg font-semibold">История</h2>
            <div class="flex flex-wrap gap-2">
              <button type="button" data-period="month" class="chip ${state.period === 'month' ? 'active' : ''}">Месяц</button>
              <button type="button" data-period="all" class="chip ${state.period === 'all' ? 'active' : ''}">Всё</button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" data-type="" class="chip ${state.type === '' ? 'active' : ''}">Все типы</button>
              <button type="button" data-type="sale" class="chip ${state.type === 'sale' ? 'active' : ''}">Продажи</button>
              <button type="button" data-type="purchase" class="chip ${state.type === 'purchase' ? 'active' : ''}">Закупки</button>
              <button type="button" data-type="expense" class="chip ${state.type === 'expense' ? 'active' : ''}">Расходники</button>
            </div>
          </div>
          <div class="card-soft">
            <p class="mb-2 text-sm text-soil-700/60">Найдено: ${data.total}</p>
            <div id="history-list">
              ${
                data.items.length
                  ? data.items.map(renderRow).join('')
                  : '<p class="py-4 text-sm text-soil-700/60">Нет операций по фильтру</p>'
              }
            </div>
          </div>
        </section>
      `;

      root.querySelectorAll('[data-period]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.period = btn.dataset.period;
          load();
        });
      });

      root.querySelectorAll('[data-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.type = btn.dataset.type;
          load();
        });
      });

      root.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.dataset.edit);
          const op = data.items.find((x) => x.id === id);
          if (!op) return;
          await openEditModal(op, async () => {
            showToast('Сохранено');
            await load();
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
            await load();
          } catch (err) {
            showToast(err.message);
          }
        });
      });
    } catch (err) {
      root.innerHTML = `<div class="card-soft text-petal-600">${escapeHtml(err.message)}</div>`;
    }
  }

  await load();
}

function renderRow(op) {
  const sign = op.type === 'sale' ? '+' : '−';
  return `
    <div class="list-item">
      <div class="min-w-0 flex-1">
        <div class="font-medium truncate">${escapeHtml(operationTitle(op))}</div>
        <div class="text-xs text-soil-700/60">
          <span class="op-${op.type}">${typeLabel(op.type)}</span>
          ${op.category_name ? ` · ${escapeHtml(op.category_name)}` : ''}
          · ${escapeHtml(formatDate(op.date))}
          ${op.type !== 'expense' ? ` · ${op.quantity} шт` : ''}
        </div>
        ${op.comment && op.type !== 'expense' ? `<div class="text-xs text-soil-700/50 mt-0.5">${escapeHtml(op.comment)}</div>` : ''}
      </div>
      <div class="flex flex-col items-end gap-1">
        <div class="font-semibold whitespace-nowrap op-${op.type}">${sign}${escapeHtml(formatMoney(op.amount))}</div>
        <div class="flex gap-1">
          <button type="button" data-edit="${op.id}" class="btn-secondary !min-h-[40px] !px-3 !py-1 text-xs">Изм.</button>
          <button type="button" data-delete="${op.id}" class="btn-danger text-xs">×</button>
        </div>
      </div>
    </div>
  `;
}
