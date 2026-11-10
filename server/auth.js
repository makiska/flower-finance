const crypto = require('node:crypto');

const INIT_DATA_MAX_AGE_SEC = 86400; // 24h

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// Максим + мама (numeric Telegram user ids). Used when the secret is
// missing or not numeric (Cursor app UI often can't edit secret values).
const DEFAULT_TELEGRAM_ALLOWLIST = ['296676631', '566523551'];

/**
 * Comma/space-separated Telegram user IDs.
 * Prefers TELEGRAM_ALLOWED_USER_IDS, then TELEGRAM_ALLOWLIST, then defaults.
 */
function parseTelegramAllowlist() {
  const raw =
    process.env.TELEGRAM_ALLOWED_USER_IDS?.trim() ||
    process.env.TELEGRAM_ALLOWLIST?.trim() ||
    '';
  const ids = new Set();
  for (const part of raw.split(/[,\s]+/)) {
    const cleaned = part.trim();
    if (!cleaned) continue;
    if (!/^\d+$/.test(cleaned)) continue;
    ids.add(cleaned);
  }
  // Fall back to the family allowlist if secret empty / usernames / invalid.
  if (ids.size === 0) {
    for (const id of DEFAULT_TELEGRAM_ALLOWLIST) ids.add(id);
  }
  return ids;
}

function isTelegramUserAllowed(user) {
  const allowlist = parseTelegramAllowlist();
  if (allowlist.size === 0) {
    return { ok: false, reason: 'allowlist_empty' };
  }
  const id = user?.id != null ? String(user.id) : '';
  if (!id || !allowlist.has(id)) {
    return { ok: false, reason: 'not_allowlisted' };
  }
  return { ok: true, allowlistSize: allowlist.size };
}

/**
 * Validate Telegram Mini App initData (HMAC-SHA256) per Telegram docs.
 * Never log the bot token.
 */
function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return { ok: false, reason: 'missing_init_data' };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed_init_data' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'missing_hash' };

  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!timingSafeEqualHex(computed, hash)) {
    return { ok: false, reason: 'bad_hash' };
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) {
    return { ok: false, reason: 'bad_auth_date' };
  }
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > INIT_DATA_MAX_AGE_SEC || age < -60) {
    return { ok: false, reason: 'expired' };
  }

  let user = null;
  const userRaw = params.get('user');
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      user = null;
    }
  }

  return { ok: true, user, authDate };
}

async function loadCursorIdentity(req) {
  try {
    const { getIdentity } = await import('../cursor/identity.js');
    return await getIdentity(req);
  } catch {
    return { verified: false, reason: 'identity_unavailable' };
  }
}

/**
 * Express middleware: require Telegram WebApp initData (allowlisted user)
 * and/or Cursor app identity (private/team gate).
 */
function requireAppAuth() {
  return async function authMiddleware(req, res, next) {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
      const initData =
        req.get('x-telegram-init-data') ||
        req.get('X-Telegram-Init-Data') ||
        '';

      if (botToken && initData) {
        const tg = validateTelegramInitData(initData, botToken);
        if (tg.ok) {
          const allowed = isTelegramUserAllowed(tg.user);
          if (!allowed.ok) {
            // Authenticated Telegram user, but not on the allowlist (Максим / мама).
            return res.status(403).json({
              error: 'Нет доступа к учёту',
              reason: allowed.reason,
            });
          }
          req.auth = {
            type: 'telegram',
            userId: String(tg.user.id),
            user: tg.user,
          };
          return next();
        }
        if (
          initData &&
          (tg.reason === 'bad_hash' ||
            tg.reason === 'expired' ||
            tg.reason === 'malformed_init_data')
        ) {
          return res.status(401).json({ error: 'Требуется авторизация', reason: tg.reason });
        }
      }

      const identity = await loadCursorIdentity(req);
      if (identity.verified) {
        // Cursor private/team gate already limits who can open the app.
        req.auth = {
          type: 'cursor',
          userId: identity.sub,
          identity,
        };
        return next();
      }

      if (botToken) {
        return res.status(401).json({
          error: 'Откройте приложение из Telegram или войдите в Cursor',
          reason: 'unauthorized',
        });
      }

      return res.status(401).json({
        error: 'Требуется авторизация',
        reason: identity.reason || 'unauthorized',
      });
    } catch (err) {
      next(err);
    }
  };
}

/** Defense-in-depth: routes can assert middleware attached auth. */
function assertAuthed(req, res) {
  if (req.auth && (req.auth.type === 'telegram' || req.auth.type === 'cursor')) {
    return true;
  }
  res.status(401).json({ error: 'Требуется авторизация', reason: 'no_auth' });
  return false;
}

module.exports = {
  requireAppAuth,
  validateTelegramInitData,
  parseTelegramAllowlist,
  isTelegramUserAllowed,
  assertAuthed,
};
