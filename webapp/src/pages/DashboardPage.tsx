import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { PageLoading, ErrorBanner, EmptyState, StatusBadge } from '../components/ui';
import { Sparkles, Pencil, Zap, RefreshCw } from 'lucide-react';

interface DashboardData {
  counts: { draft: number; approved: number; scheduled: number; published: number };
  nextScheduled: { id: string; title: string; firstTweet: string; scheduledAt: string; format: string } | null;
  isAdmin: boolean;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/v1/dashboard'),
    retry: false,
  });

  if (isLoading) return <PageLoading />;
  if (error) return <ErrorBanner message={error instanceof Error ? error.message : t('common.error')} onRetry={() => refetch()} />;
  if (!data) return null;

  const { counts, nextScheduled } = data;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={40} />}
        title={t('home.welcome')}
        description={t('home.welcomeDesc')}
        action={
          <button className="btn btn-primary" onClick={() => navigate('/compose')}>
            {t('home.handwrite')}
          </button>
        }
      />
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-lg)' }}>{t('home.title')}</h1>

      {/* Next scheduled preview */}
      {nextScheduled && (
        <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)', marginBottom: 'var(--sp-xs)' }}>{t('home.nextUp')}</div>
          <p style={{ marginBottom: 'var(--sp-sm)' }}>"{nextScheduled.firstTweet.length > 100 ? nextScheduled.firstTweet.substring(0, 97) + '...' : nextScheduled.firstTweet}"</p>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)', marginBottom: 'var(--sp-sm)' }}>
            {t('home.scheduledFor')} {new Date(nextScheduled.scheduledAt).toLocaleString()}
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
            <button className="btn btn-outline" onClick={() => navigate(`/draft/${nextScheduled.id}`)}>{t('home.view')}</button>
          </div>
        </div>
      )}

      {/* Status counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-xl)' }}>
        {(['draft', 'approved', 'scheduled', 'published'] as const).map(status => (
          <button
            key={status}
            className="card"
            style={{ textAlign: 'center', cursor: 'pointer', border: '1px solid var(--border)' }}
            onClick={() => navigate(`/drafts?tab=${status === 'draft' ? 'all' : status}`)}
          >
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>{counts[status] || 0}</div>
            <StatusBadge status={status} />
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate('/compose')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Pencil size={14} /> {t('home.handwrite')}</span>
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate('/generate')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Zap size={14} /> {t('home.generate')}</span>
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate('/repost')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><RefreshCw size={14} /> {t('home.repost')}</span>
        </button>
      </div>
    </div>
  );
}
