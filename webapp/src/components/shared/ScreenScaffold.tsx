import type { ReactNode } from 'react';
import styles from './ScreenScaffold.module.css';

interface Props {
  /** Optional large screen title rendered at the top of the scroll area. */
  title?: ReactNode;
  children: ReactNode;
}

/**
 * A minimal page container: full-width scrollable column on the secondary background.
 * Screens may use it or roll their own layout — it exists so stub pages and simple screens
 * share a consistent, token-driven frame.
 */
export function ScreenScaffold({ title, children }: Props) {
  return (
    <div className={styles.screen}>
      {title && <h1 className={styles.title}>{title}</h1>}
      {children}
    </div>
  );
}
