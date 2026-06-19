import type { ReactNode } from 'react';
import styles from './TimelineRow.module.css';

interface Props {
  /** Leading icon/avatar (e.g. a commit/repost glyph or relative time marker). */
  before?: ReactNode;
  /** Primary line. */
  title: ReactNode;
  /** Secondary line (preview text / repo / account). */
  subtitle?: ReactNode;
  /** Trailing metadata (time, status badge). */
  meta?: ReactNode;
  onClick?: () => void;
}

/**
 * A timeline entry for the Home screen's notifications/scheduled lists.
 * Bespoke (not a kit Cell) because the timeline morph needs custom layout, but it consumes the
 * same theme tokens so it matches kit surfaces. Tap deep-links into the Composer.
 */
export function TimelineRow({ before, title, subtitle, meta, onClick }: Props) {
  const interactive = !!onClick;
  return (
    <div
      className={styles.row}
      data-interactive={interactive || undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
    >
      {before && <div className={styles.before}>{before}</div>}
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      {meta && <div className={styles.meta}>{meta}</div>}
    </div>
  );
}
