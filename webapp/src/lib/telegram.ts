/**
 * Telegram WebApp SDK integration
 *
 * Wraps window.Telegram.WebApp with typed access and safety checks.
 */

interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    auth_date?: number;
    hash?: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

/** Get the Telegram WebApp instance, or null if not in Telegram */
export function getTelegram(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/** Whether the app is running inside Telegram's WebApp container */
export function isInTelegram(): boolean {
  const tg = getTelegram();
  return !!tg && !!tg.initData;
}

/** Get initData string for API auth. Returns empty string outside Telegram. */
export function getInitData(): string {
  return getTelegram()?.initData ?? '';
}

/** Get the user's language from Telegram, defaulting to 'en' */
export function getTelegramLanguage(): 'en' | 'he' {
  const lang = getTelegram()?.initDataUnsafe?.user?.language_code;
  return lang === 'he' ? 'he' : 'en';
}

/** Initialize the Telegram WebApp — call once on app mount */
export function initTelegram(): void {
  const tg = getTelegram();
  if (!tg) return;
  tg.ready();
  tg.expand();
}
