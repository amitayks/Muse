import { useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { getInitData, isInTelegram } from '../lib/telegram';
import styles from './ErrorBoundaryPage.module.css';

export function ErrorBoundaryPage() {
  const error = useRouteError();
  const hasInitData = !!getInitData();
  const inTg = isInTelegram();

  let message = 'Unknown error';
  let stack = '';
  if (error instanceof Error) {
    message = error.message;
    stack = error.stack || '';
  } else if (typeof error === 'object' && error !== null) {
    message = JSON.stringify(error);
  } else {
    message = String(error);
  }

  return (
    <div className={styles.screen}>
      <AlertTriangle size={40} className={styles.icon} />
      <h1 className={styles.title}>Something went wrong</h1>
      <p className={styles.message}>{message}</p>
      <p className={styles.meta}>
        Telegram: {inTg ? 'yes' : 'no'} | initData: {hasInitData ? 'present' : 'missing'}
      </p>
      {stack && <pre className={styles.stack}>{stack}</pre>}
      <button className={styles.reload} onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
