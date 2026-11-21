import { initTelegram } from './telegram.js';
import { renderHome } from './tabs/home.js';
import { openOpsForm } from './tabs/ops.js';
import { renderHistory } from './tabs/history.js';
import { renderAnalytics, cleanupAnalytics } from './tabs/analytics.js';
import { renderProfile } from './tabs/profile.js';
import { renderCatalog } from './tabs/catalog.js';

const TAB_TITLES = {
  home: '',
  catalog: 'Ассортимент',
  history: 'История',
  analytics: 'Отчёты',
  profile: 'Профиль',
};

const content = document.getElementById('tab-content');
const subtitle = document.getElementById('header-subtitle');
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
  subtitle.textContent = TAB_TITLES[name] || '';
  subtitle.classList.toggle('hidden', !subtitle.textContent);
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
