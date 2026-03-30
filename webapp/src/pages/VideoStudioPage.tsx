import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { EmptyState } from '../components/ui';
import { Lock } from 'lucide-react';

export function VideoStudioPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <EmptyState
        icon={<Lock size={40} />}
        title="Access Denied"
        description="Video Studio is only available for admin users."
        action={<button className="btn btn-primary" onClick={() => navigate('/')}>Home</button>}
      />
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-lg)' }}>{t('video.title')}</h1>
      <p style={{ color: 'var(--hint)' }}>{t('video.noVideos')}</p>
      <p style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)', marginTop: 'var(--sp-md)' }}>
        Video Studio management coming soon. Use the Telegram bot for video operations.
      </p>
    </div>
  );
}
