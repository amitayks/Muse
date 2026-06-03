import { Bot } from 'lucide-react';
import { useTranslation } from '../i18n';

export function NotInTelegram() {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '24px', textAlign: 'center' }}>
      <Bot size={48} style={{ marginBottom: '16px', color: 'var(--hint)' }} />
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: '8px' }}>{t('auth.notInTelegram')}</h1>
      <p style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)' }}>{t('auth.notInTelegramDesc')}</p>
    </div>
  );
}
