import { initTelegram } from './telegram.js';
import { renderHome } from './tabs/home.js';
import { openOpsForm } from './tabs/ops.js';
import { renderHistory } from './tabs/history.js';
import { renderAnalytics, cleanupAnalytics } from './tabs/analytics.js';
import { renderProfile } from './tabs/profile.js';
import { renderCatalog } from './tabs/catalog.js';

const TAB_TITLES = {
  home: 'Главная',
  catalog: 'Ассортимент',
  history: 'История',
  analytics: 'Отчёты',
  profile: 'Профиль',
};

const content = document.getElementById('tab-content');
const pageTitle = document.getElementById('page-title');
const tabButtons = document.querySelectorAll('.tab-btn');

let currentTab = 'home';

const ctx = {
  setTab,
  openOpsForm: (type) => openOpsForm(type, ctx),
};

function setTab(name) {
  currentTab = name;
  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  pageTitle.textContent = TAB_TITLES[name] || '';
  if (name !== 'analytics') cleanupAnalytics();
  renderCurrent();
}

async function renderCurrent() {
  if (currentTab === 'home') return renderHome(content, ctx);
  if (currentTab === 'catalog') return renderCatalog(content, ctx);
  if (currentTab === 'history') return renderHistory(content, ctx);
  if (currentTab === 'analytics') return renderAnalytics(content, ctx);
  if (currentTab === 'profile') return renderProfile(content, ctx);
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

initTelegram();
setTab('home');
