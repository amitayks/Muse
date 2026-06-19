import { Spinner as KitSpinner } from '@telegram-apps/telegram-ui';
import { useTranslation } from '../../i18n';
import styles from './Spinner.module.css';

type SpinnerSize = 's' | 'm' | 'l';

/** Native loading spinner. */
export function Spinner({ size = 'm' }: { size?: SpinnerSize }) {
  return <KitSpinner size={size} />;
}

/** Full-page centered loading state with a label. */
export function PageLoading() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <KitSpinner size="l" />
      <span className={styles.label}>{t('common.loading')}</span>
    </div>
  );
}
