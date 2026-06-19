import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './Cell.module.css';

interface Props {
  /** Leading element (icon/avatar). */
  before?: ReactNode;
  /** Trailing element (switch, value, badge). */
  after?: ReactNode;
  /** Secondary text under the title. */
  subtitle?: ReactNode;
  /** Trailing description shown on the right (e.g. a current value). */
  description?: ReactNode;
  onClick?: () => void;
  /** Renders as an interactive row with a chevron affordance. */
  interactive?: boolean;
  children: ReactNode;
}

/**
 * A single list row — token-driven (matches the app's dark surfaces) rather than the kit Cell,
 * whose internal section background renders light on dark themes. Pair inside <Section>.
 * `interactive` + `onClick` make it a button with a chevron affordance.
 */
export function Cell({ before, after, subtitle, description, onClick, interactive, children }: Props) {
  const isButton = !!(interactive && onClick);
  const showChevron = isButton && !after;
  const trailing = description || after || showChevron;

  const content = (
    <>
      {before && <span className={styles.before}>{before}</span>}
      <span className={styles.body}>
        <span className={styles.title}>{children}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
      {trailing && (
        <span className={styles.after}>
          {description && <span className={styles.description}>{description}</span>}
          {after}
          {showChevron && <ChevronRight size={18} className={styles.chevron} />}
        </span>
      )}
    </>
  );

  if (isButton) {
    return (
      <button type="button" className={styles.cell} data-interactive onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <div className={styles.cell} onClick={onClick}>
      {content}
    </div>
  );
}
