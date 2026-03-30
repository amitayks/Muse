import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { PageLoading, ErrorBanner, Toggle, ConfirmDialog, useToast } from '../components/ui';
import { Package } from 'lucide-react';

interface RepoDetail {
  id: string;
  owner: string;
  repo: string;
  is_watching: number;
  config: string;
  overview: { summary: string | null; tech_stack: string | null; key_features: string; target_audience: string | null } | null;
}

export function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast, element: toastEl } = useToast();

  const [editOverview, setEditOverview] = useState(false);
  const [overviewText, setOverviewText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: repo, isLoading, error, refetch } = useQuery({
    queryKey: ['repo', id],
    queryFn: () => api.get<RepoDetail>(`/api/v1/repos/${id}`),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => api.put(`/api/v1/repos/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo', id] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      showToast(t('common.saved'), 'success');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/repos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      navigate('/repos');
    },
  });

  if (isLoading) return <PageLoading />;
  if (error || !repo) return <ErrorBanner message={t('common.error')} onRetry={() => refetch()} />;

  const config = typeof repo.config === 'string' ? JSON.parse(repo.config) : repo.config;

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate('/repos')} style={{ marginBottom: 'var(--sp-md)' }}>
        {t('common.back')}
      </button>

      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-md)', display: 'flex', alignItems: 'center', gap: '6px' }}><Package size={16} /> {repo.owner}/{repo.repo}</h1>

      <span className={`badge ${repo.is_watching ? 'badge-approved' : 'badge-draft'}`} style={{ marginBottom: 'var(--sp-lg)', display: 'inline-block' }}>
        {repo.is_watching ? t('repos.watching') : t('repos.paused')}
      </span>

      {/* Config toggles */}
      <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)' }}>{t('repos.watchPrs')}</span>
            <Toggle checked={config.watchPRs} onChange={v => updateMutation.mutate({ config: { ...config, watchPRs: v } })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)' }}>{t('repos.watchPushes')}</span>
            <Toggle checked={config.watchPushes} onChange={v => updateMutation.mutate({ config: { ...config, watchPushes: v } })} />
          </div>
        </div>
      </div>

      {/* Overview */}
      <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-sm)' }}>{t('repos.overview')}</div>
        {repo.overview?.summary ? (
          editOverview ? (
            <>
              <textarea
                value={overviewText}
                onChange={e => setOverviewText(e.target.value)}
                rows={8}
                style={{
                  width: '100%', padding: 'var(--sp-sm)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg)', color: 'var(--text)',
                  fontSize: 'var(--text-sm)', fontFamily: 'var(--font)',
                  resize: 'vertical', outline: 'none', marginBottom: 'var(--sp-sm)',
                }}
              />
              <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                <button className="btn btn-success" onClick={() => { setEditOverview(false); showToast(t('common.saved'), 'success'); }}>
                  {t('common.save')}
                </button>
                <button className="btn btn-outline" onClick={() => setEditOverview(false)}>{t('common.cancel')}</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)', whiteSpace: 'pre-wrap' }}>{repo.overview.summary}</p>
              <button className="btn btn-ghost" style={{ marginTop: 'var(--sp-sm)' }} onClick={() => { setOverviewText(repo.overview?.summary || ''); setEditOverview(true); }}>
                {t('repos.editOverview')}
              </button>
            </>
          )
        ) : (
          <p style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)' }}>{t('repos.noOverview')}</p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        <button
          className={`btn ${repo.is_watching ? 'btn-outline' : 'btn-success'}`}
          onClick={() => updateMutation.mutate({ is_watching: repo.is_watching ? 0 : 1 })}
        >
          {repo.is_watching ? t('repos.pauseWatching') : t('repos.resumeWatching')}
        </button>
        <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
          {t('common.delete')}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        message={t('repos.confirmDelete')}
        confirmText={t('common.delete')}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
      {toastEl}
    </div>
  );
}
