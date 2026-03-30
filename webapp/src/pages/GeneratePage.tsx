import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { PageLoading, EmptyState, Toggle, Spinner, useToast } from '../components/ui';
import { Package } from 'lucide-react';

interface RecentPR {
  number: number;
  title: string;
  head_sha: string;
  author: string;
  merged_at: string;
}

interface Repo {
  id: string;
  owner: string;
  repo: string;
  is_watching: number;
}

export function GeneratePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show: showToast, element: toastEl } = useToast();

  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [fastImage, setFastImage] = useState(false);
  const [fastAi, setFastAi] = useState(false);

  const { data: reposData, isLoading: reposLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get<{ repos: Repo[] }>('/api/v1/repos'),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; draftId: string }>('/api/v1/generate', {
        repoId: selectedRepoId || undefined,
        commitSha: commitSha.trim(),
        fastImage,
        fastAi,
      }),
    onSuccess: (data) => navigate(`/draft/${data.draftId}`),
    onError: (err) => showToast(err instanceof Error ? err.message : t('common.error'), 'error'),
  });

  const { data: prsData } = useQuery({
    queryKey: ['recent-prs', selectedRepoId],
    queryFn: () => api.get<{ prs: RecentPR[] }>(`/api/v1/repos/${selectedRepoId}/recent-prs`),
    enabled: !!selectedRepoId,
  });

  const repos = reposData?.repos ?? [];
  const recentPrs = prsData?.prs ?? [];
  const isValidSha = /^[0-9a-f]{7,40}$/i.test(commitSha.trim());

  if (reposLoading) return <PageLoading />;

  if (repos.length === 0) {
    return (
      <EmptyState
        icon={<Package size={40} />}
        title={t('generate.noRepos')}
        description={t('generate.noReposDesc')}
        action={<button className="btn btn-primary" onClick={() => navigate('/repos')}>{t('generate.addRepo')}</button>}
      />
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-lg)' }}>{t('generate.title')}</h1>

      {/* Repo selector */}
      <div style={{ marginBottom: 'var(--sp-lg)' }}>
        <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--sp-xs)' }}>
          {t('generate.selectRepo')}
        </label>
        <select
          value={selectedRepoId}
          onChange={e => setSelectedRepoId(e.target.value)}
          style={{
            width: '100%', padding: 'var(--sp-md)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg)', color: 'var(--text)',
            fontSize: 'var(--text-base)', fontFamily: 'var(--font)',
          }}
        >
          <option value="">{t('generate.selectRepo')}...</option>
          {repos.map(r => (
            <option key={r.id} value={r.id}>{r.owner}/{r.repo}</option>
          ))}
        </select>
      </div>

      {/* Commit SHA input */}
      <div style={{ marginBottom: 'var(--sp-lg)' }}>
        <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--sp-xs)' }}>
          {t('generate.commitSha')}
        </label>
        <input
          type="text"
          value={commitSha}
          onChange={e => setCommitSha(e.target.value)}
          placeholder={t('generate.commitShaPlaceholder')}
          style={{
            width: '100%', padding: 'var(--sp-md)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg)', color: 'var(--text)',
            fontSize: 'var(--text-base)', fontFamily: 'var(--font)',
            outline: 'none',
          }}
        />
        {commitSha.trim() && !isValidSha && (
          <span style={{ color: 'var(--destructive)', fontSize: 'var(--text-sm)' }}>{t('generate.invalidSha')}</span>
        )}
      </div>

      {/* Recent PRs */}
      {selectedRepoId && recentPrs.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-lg)' }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>{t('generate.recentPrs')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
            {recentPrs.map(pr => (
              <div key={pr.number} className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    #{pr.number} {pr.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--hint)' }}>
                    {pr.head_sha?.substring(0, 7)} · {pr.author}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '4px 10px', flexShrink: 0 }}
                  onClick={() => { setCommitSha(pr.head_sha); }}
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Options */}
      <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)' }}>{t('generate.fastImage')}</span>
            <Toggle checked={fastImage} onChange={setFastImage} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)' }}>{t('generate.fastAi')}</span>
            <Toggle checked={fastAi} onChange={setFastAi} />
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        className="btn btn-primary"
        style={{ width: '100%' }}
        onClick={() => generateMutation.mutate()}
        disabled={!isValidSha || generateMutation.isPending}
      >
        {generateMutation.isPending ? <><Spinner size={14} /> {t('generate.generating')}</> : t('generate.generate')}
      </button>

      {toastEl}
    </div>
  );
}
