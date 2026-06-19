/**
 * Telegram Mini App facade.
 *
 * Thin wrapper over `@telegram-apps/sdk` (the core behind `@telegram-apps/sdk-react`)
 * so screens depend on OUR facade, not the SDK directly (swap-ability + test seams).
 *
 * Exposes: initData, reactive theme params + color scheme, viewport, and the system
 * MainButton / BackButton / SettingsButton / HapticFeedback / showConfirm / showPopup.
 *
 * Outside Telegram the facade degrades gracefully: `isInTelegram()` is false and every
 * imperative call is a no-op, so the app can render the NotInTelegram guard without crashing.
 */

import {
  init as sdkInit,
  isTMA,
  miniApp,
  themeParams,
  viewport,
  initData as sdkInitData,
  retrieveRawInitData,
  backButton,
  mainButton,
  secondaryButton,
  settingsButton,
  hapticFeedback,
  popup,
  type MainButtonState,
  type SecondaryButtonState,
} from '@telegram-apps/sdk-react';

/* ------------------------------------------------------------------ *
 * Environment + lifecycle
 * ------------------------------------------------------------------ */

let initialized = false;
let inTelegram = false;

/** Whether the app is running inside a real Telegram Mini App container. */
export function isInTelegram(): boolean {
  return inTelegram;
}

/**
 * Initialize the SDK once on app mount. Mounts the components we use and binds
 * Telegram's CSS variables (themeParams + safe-area insets) to the DOM.
 *
 * Safe to call outside Telegram — it detects the environment and becomes a no-op.
 */
export function initTelegram(): void {
  if (initialized) return;
  initialized = true;

  // `isTMA()` (no args) is the synchronous best-effort check; treat any throw as "not in TG".
  try {
    inTelegram = isTMA();
  } catch {
    inTelegram = false;
  }
  if (!inTelegram) return;

  try {
    sdkInit();

    if (miniApp.mountSync.isAvailable()) {
      miniApp.mountSync();
    }
    if (miniApp.ready.isAvailable()) {
      miniApp.ready();
    }

    if (themeParams.mountSync.isAvailable()) {
      themeParams.mountSync();
    }
    // Bind Telegram theme params to CSS custom properties (--tg-theme-*).
    if (themeParams.bindCssVars.isAvailable()) {
      themeParams.bindCssVars();
    }

    if (viewport.mount.isAvailable()) {
      void viewport.mount();
    }
    if (viewport.expand.isAvailable()) {
      viewport.expand();
    }
    // Bind viewport + safe-area insets to CSS custom properties (--tg-viewport-*).
    if (viewport.bindCssVars.isAvailable()) {
      viewport.bindCssVars();
    }

    // Bind the Mini App header + background to the Telegram theme background so the native chrome
    // matches the in-app surface. Passing the theme-param KEY (not a literal color) keeps this
    // reactive: when the user switches light/dark the bound color re-resolves automatically.
    bindMiniAppThemeColors();

    if (backButton.mount.isAvailable()) {
      backButton.mount();
    }
    if (mainButton.mount.isAvailable()) {
      mainButton.mount();
    }
    if (secondaryButton.mount.isAvailable()) {
      secondaryButton.mount();
    }
    if (settingsButton.mount.isAvailable()) {
      settingsButton.mount();
    }
  } catch {
    // SDK failed to initialize inside an unexpected container — fall back to non-TG mode.
    inTelegram = false;
  }
}

/**
 * Bind the Mini App header + background colors to the Telegram theme background.
 *
 * We pass the theme-param KEY (`'bg_color'`) rather than a literal hex, so Telegram keeps the
 * native chrome in sync with the active theme automatically — including when the user switches
 * light/dark while the app is open (satisfies the webapp-shell "theme matching" scenario).
 * Both setters are version-gated (Mini Apps v6.1+); `.isAvailable()` no-ops on older clients.
 */
function bindMiniAppThemeColors(): void {
  try {
    if (miniApp.setHeaderColor.isAvailable()) {
      miniApp.setHeaderColor('bg_color');
    }
    if (miniApp.setBackgroundColor.isAvailable()) {
      miniApp.setBackgroundColor('bg_color');
    }
  } catch {
    // Non-fatal: the in-app surface still uses our CSS tokens for its own background.
  }
}

/* ------------------------------------------------------------------ *
 * Mini App chrome (header / background color)
 * ------------------------------------------------------------------ */

export const MiniApp = {
  /**
   * (Re)bind the header + background to the Telegram theme background. Idempotent; safe to call
   * on theme change so the native chrome re-matches without a reload.
   */
  bindThemeColors(): void {
    if (!inTelegram) return;
    bindMiniAppThemeColors();
  },
} as const;

/* ------------------------------------------------------------------ *
 * Auth / init data
 * ------------------------------------------------------------------ */

/** Raw initData string for the `Authorization: tma <initData>` header. Empty outside TG. */
export function getInitData(): string {
  try {
    return retrieveRawInitData() ?? '';
  } catch {
    return '';
  }
}

/** The user's Telegram language, defaulting to 'en'. */
export function getTelegramLanguage(): 'en' | 'he' {
  try {
    const code = sdkInitData.user()?.language_code;
    return code === 'he' ? 'he' : 'en';
  } catch {
    return 'en';
  }
}

/* ------------------------------------------------------------------ *
 * Reactive signals (re-exported for `useSignal` consumers)
 * ------------------------------------------------------------------ */

export const signals = {
  themeState: themeParams.state,
  isDark: themeParams.isDark,
  colorScheme: miniApp.isDark,
  viewportHeight: viewport.height,
  viewportStableHeight: viewport.stableHeight,
  isExpanded: viewport.isExpanded,
} as const;

/* ------------------------------------------------------------------ *
 * MainButton
 * ------------------------------------------------------------------ */

export type { MainButtonState };

export const MainButton = {
  setParams(params: Partial<MainButtonState>): void {
    if (mainButton.setParams.isAvailable()) mainButton.setParams(params);
  },
  show(): void {
    if (mainButton.setParams.isAvailable()) mainButton.setParams({ isVisible: true });
  },
  hide(): void {
    if (mainButton.setParams.isAvailable()) mainButton.setParams({ isVisible: false });
  },
  /** Bind a click handler; returns an unsubscribe function. */
  onClick(cb: () => void): () => void {
    if (mainButton.onClick.isAvailable()) return mainButton.onClick(cb);
    return () => {};
  },
} as const;

/* ------------------------------------------------------------------ *
 * SecondaryButton (renders alongside the MainButton; position-aware)
 * ------------------------------------------------------------------ */

export type { SecondaryButtonState };

export const SecondaryButton = {
  /** Whether the client supports a SecondaryButton at all (Bot API 7.10+). */
  isSupported(): boolean {
    if (!inTelegram) return false;
    try {
      return secondaryButton.mount.isAvailable() || secondaryButton.setParams.isAvailable();
    } catch {
      return false;
    }
  },
  setParams(params: Partial<SecondaryButtonState>): void {
    if (secondaryButton.setParams.isAvailable()) secondaryButton.setParams(params);
  },
  show(): void {
    if (secondaryButton.setParams.isAvailable()) secondaryButton.setParams({ isVisible: true });
  },
  hide(): void {
    if (secondaryButton.setParams.isAvailable()) secondaryButton.setParams({ isVisible: false });
  },
  /** Bind a click handler; returns an unsubscribe function. */
  onClick(cb: () => void): () => void {
    if (secondaryButton.onClick.isAvailable()) return secondaryButton.onClick(cb);
    return () => {};
  },
} as const;

/* ------------------------------------------------------------------ *
 * BackButton
 * ------------------------------------------------------------------ */

export const BackButton = {
  show(): void {
    if (backButton.show.isAvailable()) backButton.show();
  },
  hide(): void {
    if (backButton.hide.isAvailable()) backButton.hide();
  },
  onClick(cb: () => void): () => void {
    if (backButton.onClick.isAvailable()) return backButton.onClick(cb);
    return () => {};
  },
} as const;

/* ------------------------------------------------------------------ *
 * SettingsButton
 * ------------------------------------------------------------------ */

export const SettingsButton = {
  show(): void {
    if (settingsButton.show.isAvailable()) settingsButton.show();
  },
  hide(): void {
    if (settingsButton.hide.isAvailable()) settingsButton.hide();
  },
  onClick(cb: () => void): () => void {
    if (settingsButton.onClick.isAvailable()) return settingsButton.onClick(cb);
    return () => {};
  },
} as const;

/* ------------------------------------------------------------------ *
 * HapticFeedback
 * ------------------------------------------------------------------ */

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

export const HapticFeedback = {
  impact(style: ImpactStyle = 'medium'): void {
    if (hapticFeedback.impactOccurred.isAvailable()) hapticFeedback.impactOccurred(style);
  },
  notification(type: NotificationType): void {
    if (hapticFeedback.notificationOccurred.isAvailable()) hapticFeedback.notificationOccurred(type);
  },
  selectionChanged(): void {
    if (hapticFeedback.selectionChanged.isAvailable()) hapticFeedback.selectionChanged();
  },
} as const;

/* ------------------------------------------------------------------ *
 * Native popups
 * ------------------------------------------------------------------ */

/**
 * Native yes/no confirmation. Resolves true when the user confirms.
 * Falls back to `window.confirm` outside Telegram so dev still works.
 */
export async function showConfirm(message: string): Promise<boolean> {
  if (!inTelegram || !popup.show.isAvailable()) {
    return Promise.resolve(window.confirm(message));
  }
  const pressedId = await popup.show({
    message,
    buttons: [
      { id: 'ok', type: 'default', text: 'OK' },
      { id: 'cancel', type: 'cancel' },
    ],
  });
  return pressedId === 'ok';
}

export interface PopupButton {
  id?: string;
  type?: 'default' | 'destructive' | 'ok' | 'close' | 'cancel';
  text?: string;
}

export interface PopupParams {
  title?: string;
  message: string;
  buttons?: PopupButton[];
}

/**
 * Native popup. Resolves with the pressed button id (or null if dismissed).
 * Falls back to `window.alert` outside Telegram.
 */
export async function showPopup(params: PopupParams): Promise<string | null> {
  if (!inTelegram || !popup.show.isAvailable()) {
    window.alert(params.message);
    return Promise.resolve(null);
  }
  // The SDK's button union is stricter than ours at the type level; the runtime accepts
  // the documented shape, so we pass through with a typed cast at the SDK boundary.
  return popup.show(params as Parameters<typeof popup.show>[0]);
}
