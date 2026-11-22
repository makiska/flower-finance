import { api } from '../api.js';
import { escapeHtml, formatMoney, showToast } from '../utils.js';

const charts = {};
let weekdayMode = 'money';
let subgroupGroup = '';

function destroyCharts() {
  Object.keys(charts).forEach((key) => {
    charts[key]?.destroy?.();
    delete charts[key];
  });
}

export async function renderAnalytics(root) {
  destroyCharts();
  let period = 'month';

  async function load() {
    root.innerHTML = `<div class="py-8 text-center text-soil-700/70">Загрузка отчётов…</div>`;
    try {
      const data = await api.getAnalytics(period);
      const s = data.summary;

      root.innerHTML = `
        <section class="tight">
          <div class="card-soft tight">
            <div class="chip-scroll">
              <button type="button" data-period="month" class="chip chip-compact ${period === 'month' ? 'active' : ''}">Текущий месяц</button>
              <button type="button" data-period="all" class="chip chip-compact ${period === 'all' ? 'active' : ''}">Всё время</button>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <div class="text-xs text-soil-700/60">Выручка</div>
                <div class="stat-value text-lg op-sale">${escapeHtml(formatMoney(s.revenue))}</div>
              </div>
              <div>
                <div class="text-xs text-soil-700/60">Затраты</div>
                <div class="stat-value text-lg op-expense">${escapeHtml(formatMoney(s.costs))}</div>
              </div>
              <div>
                <div class="text-xs text-soil-700/60">Прибыль</div>
                <div class="stat-value text-lg ${s.profit >= 0 ? 'op-profit' : 'op-expense'}">${escapeHtml(formatMoney(s.profit))}</div>
              </div>
              <div>
                <div class="text-xs text-soil-700/60">Средний чек</div>
                <div class="stat-value text-lg">${escapeHtml(formatMoney(s.average_check))}</div>
              </div>
            </div>
          </div>

          <div class="card-soft">
            <h3 class="mb-2 font-semibold">Динамика</h3>
            <div class="chart-legend">
              <span class="legend-item"><i class="legend-swatch legend-revenue"></i>Выручка</span>
              <span class="legend-item"><i class="legend-swatch legend-costs"></i>Затраты</span>
              ${period === 'all' ? '<span class="legend-item"><i class="legend-swatch legend-profit"></i>Прибыль</span>' : ''}
            </div>
            <div class="chart-box chart-box-dynamics"><canvas id="chart-dynamics"></canvas></div>
          </div>

          <div class="card-soft">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h3 class="font-semibold">По дням недели (продажи)</h3>
              <div class="flex gap-2">
                <button type="button" data-weekday="money" class="chip ${weekdayMode === 'money' ? 'active' : ''}">₽</button>
                <button type="button" data-weekday="qty" class="chip ${weekdayMode === 'qty' ? 'active' : ''}">шт</button>
              </div>
            </div>
            <div class="chart-box"><canvas id="chart-weekday"></canvas></div>
          </div>

          <div class="card-soft">
            <h3 class="mb-2 font-semibold">По месяцам</h3>
            <div class="chart-box"><canvas id="chart-months"></canvas></div>
          </div>

          <div class="card-soft">
            <h3 class="mb-2 font-semibold">По товарным группам</h3>
            <div class="chart-box"><canvas id="chart-categories"></canvas></div>
          </div>

          <div class="card-soft">
            <h3 class="mb-2 font-semibold">По подгруппам</h3>
            <div class="chip-scroll" id="subgroup-groups">
              ${(data.by_subgroup || []).reduce((names, row) => {
                if (!names.includes(row.category_name)) names.push(row.category_name);
                return names;
              }, []).map((name) => `
                <button type="button" data-subgroup-group="${escapeHtml(name)}" class="chip chip-compact ${subgroupGroup === name ? 'active' : ''}">${escapeHtml(name)}</button>
              `).join('')}
            </div>
            <div id="subgroup-list" class="mt-2">${renderSubgroupList(data.by_subgroup, subgroupGroup)}</div>
          </div>

          <div class="card-soft">
            <h3 class="mb-3 font-semibold">Топ позиций</h3>
            ${renderTopProducts(data.top_products)}
          </div>

          <div class="card-soft">
            <h3 class="mb-3 font-semibold">Топ групп</h3>
            ${renderTopGroups(data.top_groups)}
          </div>

          <div class="card-soft">
            <h3 class="mb-3 font-semibold">Мёртвый груз</h3>
            <p class="mb-3 text-sm text-soil-700/60">Закупались, продавались меньше всего</p>
            ${renderDeadStock(data.dead_stock)}
          </div>
          <div class="scroll-safe"></div>
        </section>
      `;

      root.querySelectorAll('[data-period]').forEach((btn) => {
        btn.addEventListener('click', () => {
          period = btn.dataset.period;
          load();
        });
      });

      root.querySelectorAll('[data-subgroup-group]').forEach((btn) => {
        btn.addEventListener('click', () => {
          subgroupGroup = btn.dataset.subgroupGroup === subgroupGroup ? '' : btn.dataset.subgroupGroup;
          root.querySelectorAll('[data-subgroup-group]').forEach((chip) => {
            chip.classList.toggle('active', chip.dataset.subgroupGroup === subgroupGroup);
          });
          const list = root.querySelector('#subgroup-list');
          if (list) list.innerHTML = renderSubgroupList(data.by_subgroup, subgroupGroup);
        });
      });

      root.querySelectorAll('[data-weekday]').forEach((btn) => {
        btn.addEventListener('click', () => {
          weekdayMode = btn.dataset.weekday === 'qty' ? 'qty' : 'money';
          root.querySelectorAll('[data-weekday]').forEach((chip) => {
            chip.classList.toggle('active', chip.dataset.weekday === weekdayMode);
          });
          paintWeekday(data, weekdayMode);
        });
      });

      paintCharts(data, period);
    } catch (err) {
      showToast(err.message);
      root.innerHTML = `<div class="card-soft text-petal-600">${escapeHtml(err.message)}</div>`;
    }
  }

  await load();
}

function renderSubgroupList(rows, group) {
  if (!group) return '<p class="text-sm text-soil-700/60">Выберите группу, чтобы увидеть подгруппы</p>';
  const matched = (rows || []).filter((row) => row.category_name === group);
  if (!matched.length) return '<p class="text-sm text-soil-700/60">В этой группе нет продаж с подгруппой</p>';
  return matched
    .map(
      (row) => `
      <div class="list-item">
        <div class="min-w-0">
          <div class="font-medium truncate">${escapeHtml(row.subgroup)}</div>
          <div class="text-xs text-soil-700/60">${row.quantity} шт</div>
        </div>
        <div class="font-semibold op-sale whitespace-nowrap">${escapeHtml(formatMoney(row.revenue))}</div>
      </div>`
    )
    .join('');
}

function renderTopProducts(rows) {
  if (!rows?.length) return '<p class="text-sm text-soil-700/60">Нет продаж</p>';
  return rows
    .map(
      (r, i) => `
      <div class="list-item">
        <div class="min-w-0">
          <div class="font-medium truncate">${i + 1}. ${escapeHtml(r.product_name)}</div>
          <div class="text-xs text-soil-700/60">${escapeHtml(r.category_name)} · ${r.quantity} шт</div>
        </div>
        <div class="font-semibold op-sale whitespace-nowrap">${escapeHtml(formatMoney(r.revenue))}</div>
      </div>`
    )
    .join('');
}

function renderTopGroups(rows) {
  if (!rows?.length) return '<p class="text-sm text-soil-700/60">Нет данных</p>';
  return rows
    .map(
      (r) => `
      <div class="list-item">
        <div class="min-w-0">
          <div class="font-medium truncate">${escapeHtml(r.category_name)}</div>
          <div class="text-xs text-soil-700/60">${r.quantity} шт · доля ${r.share}%</div>
        </div>
        <div class="font-semibold op-sale whitespace-nowrap">${escapeHtml(formatMoney(r.revenue))}</div>
      </div>`
    )
    .join('');
}

function renderDeadStock(rows) {
  if (!rows?.length) return '<p class="text-sm text-soil-700/60">Пока нет закупок</p>';
  return rows
    .map(
      (r) => `
      <div class="list-item">
        <div class="min-w-0">
          <div class="font-medium truncate">${escapeHtml(r.product_name)}</div>
          <div class="text-xs text-soil-700/60">${escapeHtml(r.category_name)}</div>
        </div>
        <div class="text-right text-sm">
          <div>купл. ${r.purchased_qty}</div>
          <div class="text-soil-700/60">прод. ${r.sold_qty}</div>
        </div>
      </div>`
    )
    .join('');
}

const palette = {
  revenue: '#2f7d4a',
  costs: '#c45c6a',
  profit: '#3b6ea5',
  qty: '#8a5a12',
};

function paintCharts(data, period) {
  destroyCharts();
  if (!window.Chart) return;

  const dynamics = [
    { label: 'Выручка', data: data.dynamics.map((d) => d.revenue), borderColor: palette.revenue, tension: 0.25 },
    { label: 'Затраты', data: data.dynamics.map((d) => d.costs), borderColor: palette.costs, tension: 0.25 },
  ];
  if (period === 'all') {
    dynamics.push({
      label: 'Прибыль',
      data: data.dynamics.map((d) => d.profit),
      borderColor: palette.profit,
      backgroundColor: 'transparent',
      tension: 0.25,
    });
  }

  charts.dynamics = new Chart(document.getElementById('chart-dynamics'), {
    type: 'line',
    data: {
      labels: data.dynamics.map((d) => d.label),
      datasets: dynamics,
    },
    options: {
      ...chartOptions(),
      plugins: { legend: { display: false } },
      layout: { padding: { bottom: 22, right: 8, left: 4, top: 8 } },
    },
  });

  paintWeekday(data, weekdayMode);

  charts.months = new Chart(document.getElementById('chart-months'), {
    type: 'bar',
    data: {
      labels: data.by_month.map((d) => d.month),
      datasets: [
        { label: 'Выручка', data: data.by_month.map((d) => d.revenue), backgroundColor: palette.revenue },
        { label: 'Шт', data: data.by_month.map((d) => d.quantity), backgroundColor: palette.qty },
      ],
    },
    options: chartOptions(),
  });

  charts.categories = new Chart(document.getElementById('chart-categories'), {
    type: 'doughnut',
    data: {
      labels: data.by_category.map((d) => d.category_name),
      datasets: [
        {
          data: data.by_category.map((d) => d.revenue),
          backgroundColor: ['#2f7d4a', '#3b6ea5', '#c45c6a', '#8a5a12', '#5a7d2f', '#6b5b95', '#a67c52'],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
    },
  });
}

function paintWeekday(data, mode) {
  charts.weekday?.destroy?.();
  delete charts.weekday;
  const canvas = document.getElementById('chart-weekday');
  if (!canvas || !window.Chart) return;
  const money = mode !== 'qty';
  charts.weekday = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.by_weekday.map((d) => d.label),
      datasets: [
        money
          ? {
              label: '₽',
              data: data.by_weekday.map((d) => d.revenue),
              backgroundColor: palette.revenue,
            }
          : {
              label: 'шт',
              data: data.by_weekday.map((d) => d.quantity),
              backgroundColor: palette.qty,
            },
      ],
    },
    options: chartOptions(),
  });
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
    scales: { y: { beginAtZero: true } },
  };
}

export function cleanupAnalytics() {
  destroyCharts();
}
