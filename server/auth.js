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
 * Express middleware: require Telegram WebApp initData and/or Cursor app identity.
 * Locally (no CURSOR_APP_ID), Cursor helper yields a simulated verified viewer.
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
          req.auth = { type: 'telegram', user: tg.user };
          return next();
        }
        // Fall through to Cursor identity if Telegram check failed
        // (e.g. Cursor preview with no initData) only when hash missing;
        // bad_hash / expired stay hard failures when token is configured
        // and initData was presented.
        if (initData && (tg.reason === 'bad_hash' || tg.reason === 'expired' || tg.reason === 'malformed_init_data')) {
          return res.status(401).json({ error: 'Требуется авторизация', reason: tg.reason });
        }
      }

      const identity = await loadCursorIdentity(req);
      if (identity.verified) {
        req.auth = { type: 'cursor', identity };
        return next();
      }

      // Production with bot token but no valid session
      if (botToken) {
        return res.status(401).json({
          error: 'Откройте приложение из Telegram или войдите в Cursor',
          reason: 'unauthorized',
        });
      }

      // No bot token and no Cursor identity (should be rare locally)
      return res.status(401).json({
        error: 'Требуется авторизация',
        reason: identity.reason || 'unauthorized',
      });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  requireAppAuth,
  validateTelegramInitData,
};
