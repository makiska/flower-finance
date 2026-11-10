export function initTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return null;

  try {
    tg.ready();
    tg.expand();
    if (typeof tg.setHeaderColor === 'function') {
      tg.setHeaderColor('#faf7f2');
    }
    if (typeof tg.setBackgroundColor === 'function') {
      tg.setBackgroundColor('#faf7f2');
    }
  } catch (err) {
    console.warn('Telegram WebApp init warning', err);
  }

  return tg;
}

export function haptic(type = 'light') {
  const tg = window.Telegram?.WebApp;
  try {
    tg?.HapticFeedback?.impactOccurred?.(type);
  } catch {
    /* ignore */
  }
}
