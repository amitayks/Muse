/**
 * Native feedback helpers — confirmation, popups, and haptics.
 *
 * Replaces the v1 custom ConfirmDialog/Toast modals with Telegram-native surfaces. Screens
 * import these directly; they are thin, side-effecting helpers (no React state) so they can be
 * called from event handlers and mutation callbacks alike.
 */

import {
  showConfirm as tgShowConfirm,
  showPopup as tgShowPopup,
  HapticFeedback,
  type PopupParams,
  type PopupButton,
} from '../lib/telegram';

export type { PopupParams, PopupButton };

/** Native yes/no confirm. Resolves true on confirm. Emits a warning haptic when raised. */
export async function confirm(message: string): Promise<boolean> {
  HapticFeedback.notification('warning');
  return tgShowConfirm(message);
}

/**
 * Confirm a destructive action with a dedicated destructive button.
 * Resolves true when the user taps the destructive option.
 */
export async function confirmDestructive(message: string, confirmText: string): Promise<boolean> {
  HapticFeedback.notification('warning');
  const pressed = await tgShowPopup({
    message,
    buttons: [
      { id: 'confirm', type: 'destructive', text: confirmText },
      { id: 'cancel', type: 'cancel' },
    ],
  });
  return pressed === 'confirm';
}

/** Native popup (info / multi-button). Resolves the pressed button id (or null). */
export async function popup(params: PopupParams): Promise<string | null> {
  return tgShowPopup(params);
}

/** Brief success acknowledgement — success haptic + native popup. */
export async function notifySuccess(message: string): Promise<void> {
  HapticFeedback.notification('success');
  await tgShowPopup({ message, buttons: [{ type: 'ok' }] });
}

/** Brief error acknowledgement — error haptic + native popup. */
export async function notifyError(message: string): Promise<void> {
  HapticFeedback.notification('error');
  await tgShowPopup({ message, buttons: [{ type: 'ok' }] });
}

/** Haptics passthrough so screens can `import { haptics }` for toggle/commit feedback. */
export const haptics = HapticFeedback;
