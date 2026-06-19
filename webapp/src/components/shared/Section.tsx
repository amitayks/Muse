import type { ReactNode } from 'react';
import styles from './Section.module.css';

interface Props {
  /** Optional section header text. */
  header?: ReactNode;
  /** Optional footer/help text below the section. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Grouped section — token-driven (a rounded `--section-bg` card with hairline-separated rows),
 * matching the app's dark surfaces rather than the kit Section (which renders light on dark
 * themes). Use for Settings and any cell-grouped surface.
 */
export function Section({ header, footer, children }: Props) {
  return (
    <div className={styles.section}>
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.inner}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
