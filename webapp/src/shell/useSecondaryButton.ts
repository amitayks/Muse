import { useEffect } from 'react';
import { useChrome } from './chromeContext';
import type { SecondaryButtonConfig } from './chromeContext';

/**
 * Bind the system SecondaryButton (renders alongside the MainButton — e.g. a "+ Add tweet"
 * to the left of "Save"). Registers on mount / whenever the config changes and clears on
 * unmount. Pass `null` to hide it. No-ops gracefully on clients without SecondaryButton support.
 */
export function useSecondaryButton(config: SecondaryButtonConfig | null): void {
  const { setSecondaryButton } = useChrome();

  const text = config?.text;
  const position = config?.position;
  const enabled = config?.enabled;
  const onClick = config?.onClick;

  useEffect(() => {
    if (!config || !onClick || !text) {
      setSecondaryButton(null);
      return () => setSecondaryButton(null);
    }
    setSecondaryButton({ text, onClick, position, enabled });
    return () => setSecondaryButton(null);
  }, [setSecondaryButton, text, position, enabled, onClick, config]);
}
