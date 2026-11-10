const TYPE_LABELS = {
  sale: 'Продажа',
  purchase: 'Закупка',
  expense: 'Расходник',
};

export function typeLabel(type) {
  return TYPE_LABELS[type] || type;
}

export function formatMoney(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function showToast(message, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add('hidden'), ms);
}

export function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-sheet">${html}</div>`;
  root.classList.remove('hidden');
  root.onclick = (e) => {
    if (e.target === root) closeModal();
  };
  return root.querySelector('.modal-sheet');
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  root.classList.add('hidden');
  root.innerHTML = '';
  root.onclick = null;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function operationTitle(op) {
  if (op.type === 'expense') return op.comment || 'Расходник';
  return op.product_name || 'Товар';
}
