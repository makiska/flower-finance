const crypto = require('node:crypto');

const secret =
  process.env.EXPORT_TOKEN_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

const TTL_MS = 10 * 60 * 1000;

function signExportToken(expiresAt) {
  const payload = String(expiresAt);
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function createExportToken(now = Date.now()) {
  return signExportToken(now + TTL_MS);
}

function verifyExportToken(token, now = Date.now()) {
  const raw = String(token || '');
  const dot = raw.indexOf('.');
  if (dot <= 0) return false;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!/^\d+$/.test(payload) || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  if (!crypto.timingSafeEqual(left, right)) return false;
  return Number(payload) > now;
}

function exportFileName(now = new Date()) {
  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return `операции-${stamp}.xlsx`;
}

module.exports = {
  createExportToken,
  verifyExportToken,
  exportFileName,
  TTL_MS,
};
