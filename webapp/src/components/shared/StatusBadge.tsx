import { useTranslation } from '../../i18n';
import type { DraftStatus } from '../../types/draft';
import styles from './StatusBadge.module.css';

interface Props {
  status: DraftStatus | string;
}

/**
 * Draft lifecycle status pill. Colors derive from theme tokens via the
 * `data-status` attribute (see StatusBadge.module.css), never a hardcoded palette.
 */
export function StatusBadge({ status }: Props) {
  const { t } = useTranslation();
  const label = t(`status.${status}`);
  return (
    <span className={styles.badge} data-status={status}>
      {label}
    </span>
  );
}
