import { createContext, useContext } from 'react';

export interface MainButtonConfig {
  text: string;
  onClick: () => void;
  /** Visual/interaction state. Defaults to visible + enabled. */
  visible?: boolean;
  enabled?: boolean;
  loading?: boolean;
}

export interface SecondaryButtonConfig {
  text: string;
  onClick: () => void;
  /** Where the button sits relative to the MainButton. Defaults to 'left'. */
  position?: 'left' | 'right' | 'top' | 'bottom';
  enabled?: boolean;
}

export interface ChromeContextValue {
  setMainButton: (config: MainButtonConfig | null) => void;
  setSecondaryButton: (config: SecondaryButtonConfig | null) => void;
  setBackButton: (onBack: (() => void) | null) => void;
  setSettingsButton: (onOpen: (() => void) | null) => void;
}

export const ChromeContext = createContext<ChromeContextValue | null>(null);

export function useChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) {
    throw new Error('useChrome must be used within <TelegramChromeProvider>');
  }
  return ctx;
}
