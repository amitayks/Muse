import type { ReactNode } from 'react';
import { haptics } from '../../shell/feedback';
import styles from './PlatformTogglePill.module.css';

/** Pre-upload ("warm") progress of THIS media to THIS platform — drives the ring around the icon. */
export type ProgressState = 'pending' | 'processing' | 'ready' | 'failed';

interface Props {
  /** Accessible name / tooltip (e.g. "X (Twitter)"). */
  label: string;
  /** The icon shown on the round toggle (icon-only). */
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  /**
   * Warm progress to surface as a ring around the button. When undefined no ring renders and the pill
   * looks exactly as before. 'pending' → faint track; 'processing' → indeterminate spinning arc;
   * 'ready' → full success ring; 'failed' → full danger ring.
   */
  progressState?: ProgressState;
}

// Ring geometry — a circle just outside the 40px round button so it wraps without resizing the tap area.
const RING_SIZE = 44;
const RING_RADIUS = 20;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
// Arc length of the indeterminate 'processing' snake (≈ 30% of the circumference).
const SPIN_ARC = RING_CIRC * 0.3;

/**
 * An icon-only round toggle for selecting a publish target (X / Instagram / LinkedIn …).
 * Active state fills with the accent token; emits a selection haptic on tap. The label is the
 * accessible name + tooltip. Render a row of these for the Composer/Draft-viewer "Platforms" row.
 *
 * When `progressState` is supplied an SVG ring overlays the button (a faint background track plus a
 * foreground arc). The ring is purely decorative — it sits behind/around the button via an absolute
 * overlay and never intercepts taps or changes the button's size or active fill.
 */
export function PlatformTogglePill({ label, icon, active, disabled, onToggle, progressState }: Props) {
  return (
    <span className={styles.wrap}>
      {progressState && (
        <svg
          className={styles.ring}
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          aria-hidden="true"
          focusable="false"
        >
          <circle
            className={styles.ringTrack}
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
          />
          {progressState === 'processing' ? (
            <circle
              className={styles.ringSpin}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              strokeDasharray={`${SPIN_ARC} ${RING_CIRC}`}
            />
          ) : (
            (progressState === 'ready' || progressState === 'failed') && (
              <circle
                className={progressState === 'ready' ? styles.ringReady : styles.ringFailed}
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
              />
            )
          )}
        </svg>
      )}
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
    </span>
  );
}
