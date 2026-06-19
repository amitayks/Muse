import styles from './CharCounter.module.css';

interface Props {
  count: number;
  /** Soft limit (e.g. 280 for X). Over-limit turns the counter destructive. */
  limit: number;
}

/**
 * Character counter for tweet composition. Shows remaining chars and flags over-limit
 * via the `data-over` attribute (styled with theme tokens).
 */
export function CharCounter({ count, limit }: Props) {
  const remaining = limit - count;
  const over = remaining < 0;
  const near = !over && remaining <= 20;
  return (
    <span className={styles.counter} data-over={over || undefined} data-near={near || undefined}>
      {remaining}
    </span>
  );
}
