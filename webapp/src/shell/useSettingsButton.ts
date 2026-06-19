import { useEffect } from 'react';
import { useChrome } from './chromeContext';

/**
 * Show the system SettingsButton and run `onOpen` on tap; pass `null`/undefined to hide it.
 * Cleared on unmount.
 *
 * @example
 * useSettingsButton(() => navigate('/settings'));
 */
export function useSettingsButton(onOpen: (() => void) | null | undefined): void {
  const { setSettingsButton } = useChrome();

  useEffect(() => {
    setSettingsButton(onOpen ?? null);
    return () => setSettingsButton(null);
  }, [setSettingsButton, onOpen]);
}
