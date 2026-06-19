import type { ReactNode } from 'react';
import { haptics } from '../../shell/feedback';
import styles from './PlatformTogglePill.module.css';

interface Props {
  /** Accessible name / tooltip (e.g. "X (Twitter)"). */
  label: string;
  /** The icon shown on the round toggle (icon-only). */
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}

/**
 * An icon-only round toggle for selecting a publish target (X / Instagram / LinkedIn …).
 * Active state fills with the accent token; emits a selection haptic on tap. The label is the
 * accessible name + tooltip. Render a row of these for the Composer/Draft-viewer "Platforms" row.
 */
export function PlatformTogglePill({ label, icon, active, disabled, onToggle }: Props) {
  return (
    <button
      type="button"
      className={styles.pill}
      data-active={active || undefined}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={() => {
        haptics.selectionChanged();
        onToggle(!active);
      }}
    >
      {icon}
    </button>
  );
}
