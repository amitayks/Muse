import { useEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { getTextDirection } from '../lib/textDirection';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

/** Textarea that auto-stretches to fit content and auto-detects RTL/LTR */
export function AutoTextarea({ value, style, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);

  const dir = getTextDirection(value);

  return (
    <textarea
      ref={ref}
      value={value}
      dir={dir}
      rows={1}
      style={{
        overflow: 'hidden',
        resize: 'none',
        textAlign: dir === 'rtl' ? 'right' : 'left',
        ...style,
      }}
      {...props}
    />
  );
}
