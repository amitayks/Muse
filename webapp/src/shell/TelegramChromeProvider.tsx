/**
 * TelegramChromeProvider — single owner of the global system buttons.
 *
 * The MainButton / BackButton / SettingsButton are process-wide singletons. If multiple
 * screens drive them directly they race and leak. This provider keeps a tiny registry; the
 * `useMainButton` / `useBackButton` / `useSettingsButton` hooks register intent on mount and
 * clear it on unmount, so the active screen always wins and the next screen starts clean.
 *
 * The provider does NOT render any UI — it only mediates the native chrome.
 */

import { useCallback, useRef, type ReactNode } from 'react';
import {
  MainButton,
  SecondaryButton,
  BackButton,
  SettingsButton,
  type MainButtonState,
  type SecondaryButtonState,
} from '../lib/telegram';
import {
  ChromeContext,
  type ChromeContextValue,
  type MainButtonConfig,
  type SecondaryButtonConfig,
} from './chromeContext';

export function TelegramChromeProvider({ children }: { children: ReactNode }) {
  // Active click unsubscribers so we can detach before re-binding / clearing.
  const mainOff = useRef<(() => void) | null>(null);
  const secondaryOff = useRef<(() => void) | null>(null);
  const backOff = useRef<(() => void) | null>(null);
  const settingsOff = useRef<(() => void) | null>(null);

  const setMainButton = useCallback((config: MainButtonConfig | null) => {
    mainOff.current?.();
    mainOff.current = null;

    if (!config) {
      MainButton.hide();
      return;
    }

    const params: Partial<MainButtonState> = {
      text: config.text,
      isVisible: config.visible ?? true,
      isEnabled: config.enabled ?? true,
      isLoaderVisible: config.loading ?? false,
    };
    MainButton.setParams(params);
    mainOff.current = MainButton.onClick(config.onClick);
  }, []);

  const setSecondaryButton = useCallback((config: SecondaryButtonConfig | null) => {
    secondaryOff.current?.();
    secondaryOff.current = null;

    if (!config) {
      SecondaryButton.hide();
      return;
    }

    const params: Partial<SecondaryButtonState> = {
      text: config.text,
      isVisible: true,
      isEnabled: config.enabled ?? true,
      position: config.position ?? 'left',
    };
    SecondaryButton.setParams(params);
    secondaryOff.current = SecondaryButton.onClick(config.onClick);
  }, []);

  const setBackButton = useCallback((onBack: (() => void) | null) => {
    backOff.current?.();
    backOff.current = null;

    if (!onBack) {
      BackButton.hide();
      return;
    }
    backOff.current = BackButton.onClick(onBack);
    BackButton.show();
  }, []);

  const setSettingsButton = useCallback((onOpen: (() => void) | null) => {
    settingsOff.current?.();
    settingsOff.current = null;

    if (!onOpen) {
      SettingsButton.hide();
      return;
    }
    settingsOff.current = SettingsButton.onClick(onOpen);
    SettingsButton.show();
  }, []);

  const value: ChromeContextValue = { setMainButton, setSecondaryButton, setBackButton, setSettingsButton };

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}
