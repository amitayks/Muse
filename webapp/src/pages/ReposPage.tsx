import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@telegram-apps/telegram-ui';
import { api, ApiError } from '../api/client';
import { useTranslation } from '../i18n';
import { TimelineRow, Spinner, EmptyState } from '../components/shared';
import { notifyError, haptics } from '../shell';
import styles from './ReposPage.module.css';

/** A repo already being watched (from GET /api/v1/repos). */
interface WatchedRepo {
  id: string;
  owner: string;
  repo: string;
  is_watching: number;
}

/** A GitHub search result (from GET /api/v1/repos/search). */
interface RepoSearchResult {
  full_name: string;
  description: string | null;
  private: boolean;
}

/** Split an `owner/repo` full name into its two parts. */
function splitFullName(fullName: string): { owner: string; repo: string } {
  const idx = fullName.indexOf('/');
  if (idx === -1) return { owner: fullName, repo: '' };
  return { owner: fullName.slice(0, idx), repo: fullName.slice(idx + 1) };
}

/**
 * Repos top-level tabbed screen (`/repos`). Mirrors the Home timeline: a pinned title, a
 * scrolling list of timeline-style cards (watched repos, or inline GitHub search results), and
 * the search field pinned at the bottom (where Home's compose bar sits). Typing surfaces
 * accessible repositories inline; tapping a result adds it via `POST /api/v1/repos` (validates +
 * sets up the webhook) and opens its detail page.
 */
export function ReposPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [addingFullName, setAddingFullName] = useState<string | null>(null);

  // Debounce the search input so we don't hammer the GitHub-backed endpoint on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(rawQuery.trim()), 350);
    return () => clearTimeout(handle);
  }, [rawQuery]);

  const reposQuery = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get<{ repos: WatchedRepo[] }>('/api/v1/repos'),
  });

  const searchQuery = useQuery({
    queryKey: ['repos', 'search', debouncedQuery],
    queryFn: () =>
      api.get<{ results: RepoSearchResult[] }>(
        `/api/v1/repos/search?q=${encodeURIComponent(debouncedQuery)}`,
      ),
    enabled: debouncedQuery.length > 0,
  });

  const watchedFullNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of reposQuery.data?.repos ?? []) {
      set.add(`${r.owner}/${r.repo}`.toLowerCase());
    }
    return set;
  }, [reposQuery.data]);

  const addMutation = useMutation({
    mutationFn: (fullName: string) => {
      const { owner, repo } = splitFullName(fullName);
      return api.post<{ success: boolean; id: string }>('/api/v1/repos', { owner, repo });
    },
    onMutate: (fullName) => setAddingFullName(fullName),
    onSuccess: async (res) => {
      haptics.notification('success');
      await queryClient.invalidateQueries({ queryKey: ['repos'] });
      navigate(`/repo/${res.id}`);
    },
    onError: async (err) => {
      const message = err instanceof ApiError ? err.message : t('common.error');
      await notifyError(message);
    },
    onSettled: () => setAddingFullName(null),
  });

  const isSearching = debouncedQuery.length > 0;
  const results = searchQuery.data?.results ?? [];
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('repos.title')}</h1>
      </header>

      <div className={styles.body}>
        {isSearching ? (
          <SearchResults
            loading={searchQuery.isLoading}
            isError={searchQuery.isError}
            results={results}
            watchedFullNames={watchedFullNames}
            addingFullName={addMutation.isPending ? addingFullName : null}
            onSelect={(fullName) => {
              if (addMutation.isPending) return;
              addMutation.mutate(fullName);
            }}
          />
        ) : (
          <WatchedList
            loading={reposQuery.isLoading}
            isError={reposQuery.isError}
            repos={reposQuery.data?.repos ?? []}
            onOpen={(id) => navigate(`/repo/${id}`)}
          />
        )}
      </div>

      <div className={styles.searchBar}>
        <Input
          ref={inputRef}
          value={rawQuery}
          placeholder={t('repos.searchPlaceholder')}
          onChange={(e) => setRawQuery(e.target.value)}
          type="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/** The list of repositories already being watched (shown when the search box is empty). */
function WatchedList({
  loading,
  isError,
  repos,
  onOpen,
}: {
  loading: boolean;
  isError: boolean;
  repos: WatchedRepo[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className={styles.center}>
        <Spinner size="m" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.center}>
        <EmptyState title={t('common.error')} />
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className={styles.center}>
        <EmptyState title={t('repos.noRepos')} description={t('repos.searchPlaceholder')} />
      </div>
    );
  }

  return (
    <>
      <div className={styles.sectionHeader}>{`${repos.length} ${t('common.total')}`}</div>
      <div className={styles.group}>
        {repos.map((r) => (
          <TimelineRow
            key={r.id}
            title={`${r.owner}/${r.repo}`}
            meta={
              <span className={styles.watchPill} data-watching={!!r.is_watching}>
                {r.is_watching ? t('repos.watching') : t('repos.paused')}
              </span>
            }
            onClick={() => onOpen(r.id)}
          />
        ))}
      </div>
    </>
  );
}

/** Inline GitHub search results (shown while the search box has a query). */
function SearchResults({
  loading,
  isError,
  results,
  watchedFullNames,
  addingFullName,
  onSelect,
}: {
  loading: boolean;
  isError: boolean;
  results: RepoSearchResult[];
  watchedFullNames: Set<string>;
  addingFullName: string | null;
  onSelect: (fullName: string) => void;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className={styles.center}>
        <Spinner size="m" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.center}>
        <EmptyState title={t('common.error')} />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className={styles.center}>
        <EmptyState title={t('common.noResults')} />
      </div>
    );
  }

  return (
    <>
      <div className={styles.sectionHeader}>{t('repos.addRepo')}</div>
      <div className={styles.group}>
        {results.map((r) => {
          const alreadyWatched = watchedFullNames.has(r.full_name.toLowerCase());
          const isAdding = addingFullName === r.full_name;
          return (
            <TimelineRow
              key={r.full_name}
              title={r.full_name}
              subtitle={r.description ?? undefined}
              meta={
                isAdding ? (
                  <Spinner size="s" />
                ) : alreadyWatched ? (
                  <span className={styles.addedTag}>{t('repos.watching')}</span>
                ) : r.private ? (
                  <span className={styles.privateTag}>{t('repos.private')}</span>
                ) : undefined
              }
              onClick={alreadyWatched ? undefined : () => onSelect(r.full_name)}
            />
          );
        })}
      </div>
    </>
  );
}
