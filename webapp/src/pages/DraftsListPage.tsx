import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image, Film, Images, GitCommit, Repeat2, PenLine, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import {
  PageLoading,
  EmptyState,
  Spinner,
  StatusBadge,
} from '../components/shared';
import { confirmDestructive, notifyError, haptics } from '../shell';
import { useTranslation } from '../i18n';
import { getTextDirection } from '../lib/textDirection';
import type {
  Draft,
  DraftContent,
  DraftStatus,
  PublishTargets,
} from '../types/draft';
import styles from './DraftsListPage.module.css';

const PAGE_SIZE = 20;

const KNOWN_STATUSES: DraftStatus[] = [
  'draft',
  'approved',
  'scheduled',
  'published',
  'publishing',
];

type ListDraft = Draft & { content: DraftContent; publish_targets: PublishTargets };

interface DraftListResponse {
  drafts: ListDraft[];
  total: number;
  page: number;
}

/** Source filter values. Backend scopes source filtering to the `draft` status only. */
type SourceFilter = 'all' | 'commit' | 'repost' | 'handwrite';

const SOURCE_FILTERS: { value: SourceFilter; labelKey: string; fallback: string }[] = [
  { value: 'all', labelKey: 'drafts.all', fallback: 'All' },
  { value: 'commit', labelKey: 'home.fromCommit', fallback: 'Commit' },
  { value: 'repost', labelKey: 'drafts.repost', fallback: 'Repost' },
  { value: 'handwrite', labelKey: 'drafts.handwritten', fallback: 'Handwrite' },
];

/**
 * Status-scoped draft list (`/drafts/:status`). Scrollable, infinitely paginated draft cards.
 * For the Needs Review (`draft`) status an optional source filter (Commit · Repost · Handwrite)
 * is offered. Top-level tabbed screen — keeps the Tabbar, so NO BackButton/MainButton.
 */
export function DraftsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { status: rawStatus, source: rawSource } = useParams();

  // Two route shapes render this page:
  //   /drafts/:status         → one status, any source
  //   /drafts/source/:source  → one source/type across ALL statuses (Drafts-hub "Type" tile)
  const sourceMode = !!rawSource;
  const typeSource = rawSource as SourceFilter | undefined;

  const status = (KNOWN_STATUSES.includes(rawStatus as DraftStatus)
    ? rawStatus
    : 'draft') as DraftStatus;

  // The source-filter chips only make sense on the Needs Review (draft) status list — never in
  // source mode (already source-scoped across every status).
  const showSourceFilter = !sourceMode && status === 'draft';
  const [source, setSource] = useState<SourceFilter>('all');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ['drafts', sourceMode ? `source:${typeSource}` : status, showSourceFilter ? source : 'all'],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: String(PAGE_SIZE),
      });
      if (sourceMode) {
        // One source/type, across every status.
        params.set('source', typeSource!);
      } else {
        // One status; optionally narrowed to a source on the Needs Review list.
        params.set('status', status);
        if (showSourceFilter && source !== 'all') params.set('source', source);
      }
      return api.get<DraftListResponse>(`/api/v1/drafts?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => {
      const loaded = (lastPage.page + 1) * PAGE_SIZE;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/drafts/${id}`),
    onSuccess: () => {
      haptics.notification('success');
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
    },
    onError: (err) => {
      notifyError(err instanceof Error ? err.message : t('common.error'));
    },
  });

  // Infinite-scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const drafts = data?.pages.flatMap((p) => p.drafts) ?? [];

  // Title: a source/type label in source mode, otherwise the status label.
  const listTitle = sourceMode
    ? (() => {
        const f = SOURCE_FILTERS.find((x) => x.value === typeSource);
        return f ? translateWithFallback(t, f.labelKey, f.fallback) : t('drafts.title');
      })()
    : t(`status.${status}`);

  async function handleDelete(id: string) {
    const ok = await confirmDestructive(t('editor.confirmDelete'), t('common.delete'));
    if (ok) deleteMutation.mutate(id);
  }

  function selectSource(next: SourceFilter) {
    haptics.selectionChanged();
    setSource(next);
  }

  if (isLoading) return <PageLoading />;

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{listTitle}</h1>

      {showSourceFilter && (
        <div className={styles.filters} role="tablist">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              className={styles.filterChip}
              data-active={source === f.value}
              aria-selected={source === f.value}
              onClick={() => selectSource(f.value)}
            >
              {translateWithFallback(t, f.labelKey, f.fallback)}
            </button>
          ))}
        </div>
      )}

      {isError ? (
        <EmptyState
          title={t('common.error')}
          description={error instanceof Error ? error.message : undefined}
        />
      ) : drafts.length === 0 ? (
        <EmptyState title={t('drafts.noDraftsInCategory')} />
      ) : (
        <div className={styles.list}>
          {drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              t={t}
              onOpen={() => navigate(`/draft/${draft.id}`)}
              onDelete={() => handleDelete(draft.id)}
            />
          ))}
          <div ref={sentinelRef} className={styles.sentinel} />
          {isFetchingNextPage && (
            <div className={styles.loadMore}>
              <Spinner size="s" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== DraftCard ====================

type Translate = (key: string, params?: Record<string, string>) => string;

interface DraftCardProps {
  draft: ListDraft;
  t: Translate;
  onOpen: () => void;
  onDelete: () => void;
}

function DraftCard({ draft, t, onOpen, onDelete }: DraftCardProps) {
  const content = draft.content;
  const tweets = content?.tweets ?? [];
  const firstTweet = tweets[0]?.text || draft.pr_title || '';
  const preview = firstTweet.length > 160 ? `${firstTweet.slice(0, 157)}…` : firstTweet;
  const dir = getTextDirection(preview);

  const hasMedia = tweets.some((tw) => tw.media && tw.media.length > 0);
  const isThread = content?.format === 'thread' && tweets.length > 1;
  const format = isThread
    ? `${t('drafts.thread')} · ${tweets.length} ${t('drafts.tweets')}`
    : t('drafts.singleTweet');

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <div className={styles.cardHeader}>
        <StatusBadge status={draft.status} />
        <span className={styles.format}>{format}</span>
        {hasMedia && (
          <span className={styles.mediaIndicator} aria-label={t('editor.addMedia')}>
            <Image size={14} />
          </span>
        )}
        <PlatformBadges targets={draft.publish_targets} />
      </div>

      {preview && (
        <p className={styles.preview} dir={dir}>
          {preview}
        </p>
      )}

      <div className={styles.cardFooter}>
        <SourceTag source={draft.source} t={t} />
        <span className={styles.timestamp}>{relativeTime(draft.created_at, t)}</span>
        <span
          className={styles.deleteBtn}
          role="button"
          tabIndex={0}
          aria-label={t('common.delete')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={16} />
        </span>
      </div>
    </button>
  );
}

function PlatformBadges({ targets }: { targets: PublishTargets }) {
  if (!targets) return null;
  const glyphs: { key: string; node: React.ReactNode }[] = [];
  if (targets.x) glyphs.push({ key: 'x', node: <span>X</span> });
  if (targets.instagram_post) glyphs.push({ key: 'ig-post', node: <Image size={14} /> });
  if (targets.instagram_story) glyphs.push({ key: 'ig-story', node: <Images size={14} /> });
  if (targets.instagram_reel) glyphs.push({ key: 'ig-reel', node: <Film size={14} /> });
  if (glyphs.length === 0) return null;
  return (
    <span className={styles.platforms}>
      {glyphs.map((g) => (
        <span key={g.key} className={styles.platformGlyph}>
          {g.node}
        </span>
      ))}
    </span>
  );
}

function SourceTag({ source, t }: { source: Draft['source']; t: Translate }) {
  let icon: React.ReactNode = <PenLine size={13} />;
  let label = translateWithFallback(t, 'drafts.handwritten', 'Handwrite');
  if (source === 'repost') {
    icon = <Repeat2 size={13} />;
    label = t('drafts.repost');
  } else if (source === 'commit' || source === 'auto') {
    icon = <GitCommit size={13} />;
    label = translateWithFallback(t, 'home.fromCommit', 'Commit');
  }
  return (
    <span className={styles.source}>
      {icon} {label}
    </span>
  );
}

// ==================== Helpers ====================

/** Translate, but fall back to a provided literal when the key is absent (key === returned). */
function translateWithFallback(t: Translate, key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

/** Relative timestamp using the existing time.* i18n keys. */
function relativeTime(iso: string, t: Translate): string {
  const then = Date.parse(iso.includes('T') || iso.includes('Z') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t('common.justNow');
  if (minutes < 60) return t('time.minutesAgo', { n: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { n: String(hours) });
  const days = Math.floor(hours / 24);
  return t('time.daysAgo', { n: String(days) });
}
