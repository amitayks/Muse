import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { PageLoading, ErrorBanner, EmptyState, useToast } from '../components/ui';
import { Package } from 'lucide-react';

interface Repo {
  id: string;
  owner: string;
  repo: string;
  is_watching: number;
  config: string;
}

export function ReposListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast, element: toastEl } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [newRepo, setNewRepo] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get<{ repos: Repo[] }>('/api/v1/repos'),
  });

  const addMutation = useMutation({
    mutationFn: () => {
      const [owner, repo] = newRepo.trim().split('/');
      return api.post<{ success: boolean; id: string }>('/api/v1/repos', { owner, repo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      setNewRepo('');
      setShowAdd(false);
      showToast('Repository added', 'success');
    },
    onError: (err) => showToast(err instanceof Error ? err.message : t('common.error'), 'error'),
  });

  const isValidFormat = /^[\w.-]+\/[\w.-]+$/.test(newRepo.trim());
  const repos = data?.repos ?? [];

  if (isLoading) return <PageLoading />;
  if (error) return <ErrorBanner message={error instanceof Error ? error.message : t('common.error')} onRetry={() => refetch()} />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-lg)' }}>
        <h1 style={{ fontSize: 'var(--text-xl)' }}>{t('repos.title')}</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>+ {t('repos.addRepo')}</button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
          <input
            type="text"
            value={newRepo}
            onChange={e => setNewRepo(e.target.value)}
            placeholder={t('repos.ownerRepoPlaceholder')}
            style={{
              width: '100%', padding: 'var(--sp-sm)', marginBottom: 'var(--sp-sm)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)', color: 'var(--text)', fontSize: 'var(--text-base)', fontFamily: 'var(--font)', outline: 'none',
            }}
          />
          {newRepo.trim() && !isValidFormat && (
            <div style={{ color: 'var(--destructive)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-sm)' }}>{t('repos.invalidFormat')}</div>
          )}
          <button className="btn btn-success" onClick={() => addMutation.mutate()} disabled={!isValidFormat || addMutation.isPending}>
            {t('repos.addRepo')}
          </button>
        </div>
      )}

      {/* Repos list */}
      {repos.length === 0 ? (
        <EmptyState icon={<Package size={40} />} title={t('repos.noRepos')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {repos.map(repo => (
            <div key={repo.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/repo/${repo.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Package size={14} /> {repo.owner}/{repo.repo}</span>
                <span className={`badge ${repo.is_watching ? 'badge-approved' : 'badge-draft'}`}>
                  {repo.is_watching ? t('repos.watching') : t('repos.paused')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {toastEl}
    </div>
  );
}
