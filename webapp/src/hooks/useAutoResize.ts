import { useEffect, useRef, useCallback } from 'react';

/** Returns a ref to attach to a textarea — it auto-resizes to fit content */
export function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  // Also resize on mount
  useEffect(() => {
    // Small delay for initial render
    const t = setTimeout(resize, 0);
    return () => clearTimeout(t);
  }, [resize]);

  return ref;
}
