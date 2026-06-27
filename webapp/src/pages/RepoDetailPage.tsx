import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Caption, Input } from '@telegram-apps/telegram-ui';
import { api, ApiError } from '../api/client';
import { useTranslation } from '../i18n';
import {
  ScreenScaffold,
  Section,
  Cell,
  Toggle,
  PageLoading,
  EmptyState,
  AutoTextarea,
} from '../components/shared';
import {
  useBackButton,
  useMainButton,
  confirm,
  confirmDestructive,
  notifyError,
  haptics,
} from '../shell';
import styles from './RepoDetailPage.module.css';

/** RepoConfig shape (parsed from the `config` JSON string on the repo row). */
interface RepoConfig {
  watchPRs: boolean;
  watchPushes: boolean;
  branches: string[];
  [key: string]: unknown;
}

/** The Project Overview attached to a repo. */
interface RepoOverview {
  summary: string | null;
  tech_stack: string | null;
  key_features: string[];
  target_audience: string | null;
  brand_voice: string | null;
  visual_theme: string | null;
}

/** Editable buffer for the overview — all fields as strings (key_features is newline-separated). */
interface OverviewDraft {
  summary: string;
  tech_stack: string;
  key_features: string;
  target_audience: string;
  brand_voice: string;
  visual_theme: string;
}

/** The overview fields, in the same order the bot's "Edit Overview" menu offers them. */
const OVERVIEW_FIELDS: { key: keyof OverviewDraft; labelKey: string; hintKey?: string }[] = [
  { key: 'summary', labelKey: 'repos.summary' },
  { key: 'tech_stack', labelKey: 'repos.techStack' },
  { key: 'key_features', labelKey: 'repos.keyFeatures', hintKey: 'repos.keyFeaturesHint' },
  { key: 'target_audience', labelKey: 'repos.targetAudience' },
  { key: 'brand_voice', labelKey: 'repos.brandVoice' },
  { key: 'visual_theme', labelKey: 'repos.visualTheme' },
];

/** GET /api/v1/repos/:id response — the repo row spread plus its overview. */
interface RepoDetail {
  id: string;
  owner: string;
  repo: string;
  is_watching: number;
  config: string;
  overview: RepoOverview | null;
}

/** Parse the JSON `config` blob defensively into a typed RepoConfig. */
function parseConfig(raw: string): RepoConfig {
  try {
    const parsed = JSON.parse(raw) as Partial<RepoConfig>;
    return {
      watchPRs: !!parsed.watchPRs,
      watchPushes: !!parsed.watchPushes,
      branches: Array.isArray(parsed.branches) ? parsed.branches : [],
      ...parsed,
    };
  } catch {
    return { watchPRs: false, watchPushes: false, branches: [] };
  }
}

/**
 * Repo detail flow screen (`/repo/:id`).
 *
 * Mirrors the bot's repo detail exactly — no more, no less: owner/repo + watching status,
 * Watch-PRs / Watch-Pushes toggles, branches, the Project Overview (summary / feature count /
 * visual theme) with Edit + Bootstrap/Re-bootstrap, and Delete. The system MainButton drives the
 * watch on/off primary action; destructive/regenerative actions go through native confirm.
 */
export function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useBackButton();

  // Overview edit buffer; non-null = editing. Holds all six fields.
  const [overviewDraft, setOverviewDraft] = useState<OverviewDraft | null>(null);

  // Branch add UI: whether the inline input is shown, its value, and the last error.
  const [addingBranch, setAddingBranch] = useState(false);
  const [branchInput, setBranchInput] = useState('');
  const [branchError, setBranchError] = useState<string | null>(null);

  const repoQuery = useQuery({
    queryKey: ['repo', id],
    queryFn: () => api.get<RepoDetail>(`/api/v1/repos/${id}`),
    enabled: !!id,
  });

  const repo = repoQuery.data;
  const config = repo ? parseConfig(repo.config) : null;
  const overview = repo?.overview ?? null;

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      api.put(`/api/v1/repos/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo', id] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
    onError: async (err) => {
      await notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/repos/${id}`),
    onSuccess: async () => {
      haptics.notification('success');
      await queryClient.invalidateQueries({ queryKey: ['repos'] });
      navigate('/repos');
    },
    onError: async (err) => {
      await notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  // Bootstrap / re-bootstrap (re)generates the overview server-side.
  const bootstrapMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/repos/${id}/bootstrap-overview`),
    onSuccess: () => {
      haptics.notification('success');
      queryClient.invalidateQueries({ queryKey: ['repo', id] });
    },
    onError: async (err) => {
      await notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  // Persist the edited overview — all six fields (key_features split from newline text).
  const saveOverviewMutation = useMutation({
    mutationFn: (d: OverviewDraft) =>
      api.put(`/api/v1/repos/${id}/overview`, {
        summary: d.summary.trim(),
        tech_stack: d.tech_stack.trim(),
        key_features: d.key_features.split('\n').map((s) => s.trim()).filter(Boolean),
        target_audience: d.target_audience.trim(),
        brand_voice: d.brand_voice.trim(),
        visual_theme: d.visual_theme.trim(),
      }),
    onSuccess: () => {
      haptics.notification('success');
      setOverviewDraft(null);
      queryClient.invalidateQueries({ queryKey: ['repo', id] });
    },
    onError: async (err) => {
      await notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  // Branch add/remove are server-authoritative: each returns the full updated config, which
  // we write straight into the cache so the toggle PUT (which sends the whole config) never
  // races against a stale branch set.
  const addBranchMutation = useMutation({
    mutationFn: (branch: string) =>
      api.post<{ success: boolean; config: RepoConfig }>(`/api/v1/repos/${id}/branches`, { branch }),
    onSuccess: (data) => {
      haptics.notification('success');
      queryClient.setQueryData<RepoDetail>(['repo', id], (old) =>
        old ? { ...old, config: JSON.stringify(data.config) } : old,
      );
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      setAddingBranch(false);
      setBranchInput('');
      setBranchError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) {
        setBranchError(t('repos.branchNotFound'));
      } else {
        setBranchError(err instanceof ApiError ? err.message : t('common.error'));
      }
    },
  });

  const removeBranchMutation = useMutation({
    mutationFn: (branch: string) =>
      api.delete<{ success: boolean; config: RepoConfig }>(
        `/api/v1/repos/${id}/branches?branch=${encodeURIComponent(branch)}`,
      ),
    onSuccess: (data) => {
      haptics.notification('success');
      queryClient.setQueryData<RepoDetail>(['repo', id], (old) =>
        old ? { ...old, config: JSON.stringify(data.config) } : old,
      );
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
    onError: async (err) => {
      await notifyError(err instanceof ApiError ? err.message : t('common.error'));
    },
  });

  const watching = !!repo?.is_watching;

  // Primary action = the watch on/off toggle (matches the bot's start/stop-watching button).
  useMainButton(
    repo
      ? {
          text: watching ? t('repos.pauseWatching') : t('repos.resumeWatching'),
          onClick: () => updateMutation.mutate({ is_watching: watching ? 0 : 1 }),
          enabled: !updateMutation.isPending,
          loading: updateMutation.isPending,
        }
      : null,
  );

  if (repoQuery.isLoading) return <PageLoading />;
  if (repoQuery.isError || !repo || !config) {
    return (
      <ScreenScaffold title={t('repos.title')}>
        <EmptyState title={t('common.error')} />
      </ScreenScaffold>
    );
  }

  const featureCount = overview?.key_features?.length ?? 0;

  const handleToggleConfig = (key: 'watchPRs' | 'watchPushes', next: boolean) => {
    updateMutation.mutate({ config: { ...config, [key]: next } });
  };

  const handleAddBranch = () => {
    const branch = branchInput.trim();
    if (!branch) return;
    // Client-side dedupe so an obvious duplicate doesn't spend a GitHub verify call.
    if (config?.branches.includes(branch)) {
      setBranchError(t('repos.branchAlreadyFollowed'));
      return;
    }
    addBranchMutation.mutate(branch);
  };

  const handleBootstrap = async () => {
    if (overview) {
      const ok = await confirm(t('repos.confirmRebootstrap'));
      if (!ok) return;
    }
    bootstrapMutation.mutate();
  };

  const handleStartEdit = () => {
    setOverviewDraft({
      summary: overview?.summary ?? '',
      tech_stack: overview?.tech_stack ?? '',
      key_features: (overview?.key_features ?? []).join('\n'),
      target_audience: overview?.target_audience ?? '',
      brand_voice: overview?.brand_voice ?? '',
      visual_theme: overview?.visual_theme ?? '',
    });
  };

  const handleDelete = async () => {
    const ok = await confirmDestructive(t('repos.confirmDelete'), t('common.delete'));
    if (ok) deleteMutation.mutate();
  };

  return (
    <ScreenScaffold>
      <header className={styles.header}>
        <h1 className={styles.repoName}>
          {repo.owner}/{repo.repo}
        </h1>
        <span className={styles.watchPill} data-watching={watching}>
          {watching ? t('repos.watching') : t('repos.paused')}
        </span>
      </header>

      <Section header={t('repos.watchSettings')}>
        <Cell
          after={
            <Toggle
              checked={config.watchPRs}
              onChange={(v) => handleToggleConfig('watchPRs', v)}
              disabled={updateMutation.isPending}
            />
          }
        >
          {t('repos.watchPrs')}
        </Cell>
        <Cell
          after={
            <Toggle
              checked={config.watchPushes}
              onChange={(v) => handleToggleConfig('watchPushes', v)}
              disabled={updateMutation.isPending}
            />
          }
        >
          {t('repos.watchPushes')}
        </Cell>
      </Section>

      <Section header={t('repos.branches')}>
        <div className={styles.branchBlock}>
          <div className={styles.branchChips}>
            {config.branches.map((b) => (
              <span key={b} className={styles.chip}>
                <span className={styles.chipLabel}>{b}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`${t('common.delete')} ${b}`}
                  disabled={removeBranchMutation.isPending}
                  onClick={() => removeBranchMutation.mutate(b)}
                >
                  ×
                </button>
              </span>
            ))}
            {!addingBranch && (
              <button
                type="button"
                className={styles.chipAdd}
                aria-label={t('repos.addBranch')}
                onClick={() => {
                  setAddingBranch(true);
                  setBranchError(null);
                }}
              >
                +
              </button>
            )}
          </div>

          {addingBranch && (
            <div className={styles.branchAddRow}>
              <Input
                value={branchInput}
                placeholder={t('repos.addBranchPlaceholder')}
                onChange={(e) => {
                  setBranchInput(e.target.value);
                  setBranchError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddBranch();
                }}
                disabled={addBranchMutation.isPending}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <div className={styles.branchAddActions}>
                <Button
                  size="s"
                  loading={addBranchMutation.isPending}
                  disabled={addBranchMutation.isPending || !branchInput.trim()}
                  onClick={handleAddBranch}
                >
                  {t('repos.addBranch')}
                </Button>
                <Button
                  size="s"
                  mode="plain"
                  disabled={addBranchMutation.isPending}
                  onClick={() => {
                    setAddingBranch(false);
                    setBranchInput('');
                    setBranchError(null);
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}

          {addBranchMutation.isPending && (
            <Caption className={styles.branchHint}>{t('repos.verifyingBranch')}</Caption>
          )}
          {branchError && <Caption className={styles.branchError}>{branchError}</Caption>}
          {config.branches.length === 0 && !addingBranch && !addBranchMutation.isPending && (
            <Caption className={styles.branchHint}>{t('repos.noBranches')}</Caption>
          )}
        </div>
      </Section>

      <Section
        header={t('repos.projectOverview')}
        footer={
          overview?.visual_theme
            ? `${t('repos.visualTheme')}: ${overview.visual_theme}`
            : undefined
        }
      >
        {overviewDraft ? (
          <div className={styles.editWrap}>
            {OVERVIEW_FIELDS.map((f) => (
              <div key={f.key} className={styles.field}>
                <label className={styles.fieldLabel}>{t(f.labelKey)}</label>
                <AutoTextarea
                  value={overviewDraft[f.key]}
                  onChange={(e) =>
                    setOverviewDraft((d) => (d ? { ...d, [f.key]: e.target.value } : d))
                  }
                  className={styles.editArea}
                />
                {f.hintKey && <span className={styles.fieldHint}>{t(f.hintKey)}</span>}
              </div>
            ))}
            <div className={styles.editActions}>
              <Button
                size="m"
                stretched
                loading={saveOverviewMutation.isPending}
                disabled={saveOverviewMutation.isPending}
                onClick={() => overviewDraft && saveOverviewMutation.mutate(overviewDraft)}
              >
                {t('common.save')}
              </Button>
              <Button
                size="m"
                mode="plain"
                disabled={saveOverviewMutation.isPending}
                onClick={() => setOverviewDraft(null)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.overviewBlock}>
            <p className={styles.summary}>
              {overview?.summary ? overview.summary : t('repos.noOverview')}
            </p>
            {overview && (
              <Caption className={styles.featureCount}>
                {`${featureCount} ${featureCount === 1 ? t('repos.featureSingular') : t('repos.featurePlural')}`}
              </Caption>
            )}
            <div className={styles.overviewActions}>
              {overview && (
                <Button size="s" mode="bezeled" onClick={handleStartEdit}>
                  {t('repos.editOverview')}
                </Button>
              )}
              <Button
                size="s"
                mode="bezeled"
                loading={bootstrapMutation.isPending}
                disabled={bootstrapMutation.isPending}
                onClick={handleBootstrap}
              >
                {overview ? t('repos.rebootstrap') : t('repos.bootstrap')}
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section>
        <Cell interactive onClick={handleDelete}>
          <span className={styles.deleteLabel}>{t('common.delete')}</span>
        </Cell>
      </Section>
    </ScreenScaffold>
  );
}
