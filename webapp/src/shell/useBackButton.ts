import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChrome } from './chromeContext';

/**
 * Show the system BackButton on a flow/detail screen and run `onBack` on tap.
 *
 * When `onBack` is omitted it defaults to `navigate(-1)`. Clears the button on unmount so
 * top-level tabbed screens (which use the Tabbar instead) never inherit a stale BackButton.
 *
 * @example
 * useBackButton();                 // default: go back one history entry
 * useBackButton(() => confirmDiscard());
 */
export function useBackButton(onBack?: () => void): void {
  const { setBackButton } = useChrome();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = onBack ?? (() => navigate(-1));
    setBackButton(handler);
    return () => setBackButton(null);
  }, [setBackButton, onBack, navigate]);
}
