import { useEffect } from 'react';
import { useChrome, type MainButtonConfig } from './chromeContext';

/**
 * Bind the system MainButton to the current screen's primary action.
 *
 * Registers on mount / whenever the config changes, and clears on unmount so the next screen
 * controls the button cleanly. Pass `null` to explicitly hide it (e.g. a published draft).
 *
 * @example
 * useMainButton({ text: t('editor.approve'), onClick: handleApprove, enabled: canApprove });
 */
export function useMainButton(config: MainButtonConfig | null): void {
  const { setMainButton } = useChrome();

  const text = config?.text;
  const visible = config?.visible;
  const enabled = config?.enabled;
  const loading = config?.loading;
  const onClick = config?.onClick;

  useEffect(() => {
    if (!config || !onClick || !text) {
      setMainButton(null);
      return () => setMainButton(null);
    }
    setMainButton({ text, onClick, visible, enabled, loading });
    return () => setMainButton(null);
    // The onClick handler is intentionally part of the dep set so a changed closure re-binds.
  }, [setMainButton, text, visible, enabled, loading, onClick, config]);
}
