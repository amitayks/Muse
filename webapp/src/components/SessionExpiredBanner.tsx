import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from '../i18n';
import { SessionExpiredError } from '../api/client';

export function SessionExpiredBanner() {
  const { t } = useTranslation();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof SessionExpiredError) {
        setExpired(true);
        e.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  if (!expired) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px', textAlign: 'center',
    }}>
      <Clock size={48} style={{ marginBottom: '16px', color: 'var(--hint)' }} />
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: '8px' }}>{t('auth.sessionExpired')}</h1>
      <p style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)' }}>{t('auth.sessionExpiredDesc')}</p>
    </div>
  );
}
