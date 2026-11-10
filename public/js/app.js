import { initTelegram } from './telegram.js';
import { renderHome } from './tabs/home.js';
import { renderOps, openOpsForm } from './tabs/ops.js';
import { renderHistory } from './tabs/history.js';
import { renderAnalytics, cleanupAnalytics } from './tabs/analytics.js';

const TAB_TITLES = {
  home: 'Текущий месяц',
  ops: 'Новая операция',
  history: 'Реестр операций',
  analytics: 'Аналитика и отчёты',
};

const content = document.getElementById('tab-content');
const subtitle = document.getElementById('header-subtitle');
const tabButtons = document.querySelectorAll('.tab-btn');

let currentTab = 'home';

const ctx = {
  setTab,
  openOpsForm: (type) => {
    setTab('ops');
    openOpsForm(type, ctx);
  },
};

function setTab(name) {
  currentTab = name;
  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  subtitle.textContent = TAB_TITLES[name] || '';
  if (name !== 'analytics') cleanupAnalytics();
  renderCurrent();
}

async function renderCurrent() {
  if (currentTab === 'home') return renderHome(content, ctx);
  if (currentTab === 'ops') return renderOps(content, ctx);
  if (currentTab === 'history') return renderHistory(content, ctx);
  if (currentTab === 'analytics') return renderAnalytics(content, ctx);
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

initTelegram();
setTab('home');
