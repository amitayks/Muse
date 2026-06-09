import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { PageLoading, ErrorBanner, EmptyState, StatusBadge, ConfirmDialog, useToast } from '../components/ui';
import { FileText, Camera, Image, Video, Check, Pencil, Trash2 } from 'lucide-react';
import { getTextDirection } from '../lib/textDirection';
import type { Draft, DraftContent, PublishTargets } from '../types/draft';

const TABS = ['all', 'auto', 'handwrite', 'repost', 'approved', 'scheduled', 'published'] as const;
type Tab = typeof TABS[number];

const PAGE_SIZE = 20;

interface DraftListResponse {
  drafts: (Draft & { content: DraftContent; publish_targets: PublishTargets })[];
  total: number;
  page: number;
}

export function DraftsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { show: showToast, element: toastEl } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const activeTab = (searchParams.get('tab') as Tab) || 'all';

  function setTab(tab: Tab) {
    setSearchParams({ tab });
  }

  // Build query params based on active tab
  function getQueryParams(page: number) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (activeTab === 'approved' || activeTab === 'scheduled' || activeTab === 'published') {
      params.set('status', activeTab);
    } else if (activeTab === 'auto' || activeTab === 'handwrite' || activeTab === 'repost') {
      params.set('source', activeTab);
    }
    return params.toString();
  }

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['drafts', activeTab],
    queryFn: async ({ pageParam = 0 }) => {
      return api.get<DraftListResponse>(`/api/v1/drafts?${getQueryParams(pageParam)}`);
    },
    getNextPageParam: (lastPage) => {
      const loaded = (lastPage.page + 1) * PAGE_SIZE;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 0,
  });

  // Infinite scroll trigger
  const observerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/drafts/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      showToast(t('status.approved'), 'success');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/drafts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      showToast(t('common.delete'), 'success');
      setDeleteTarget(null);
    },
  });

  const allDrafts = data?.pages.flatMap(p => p.drafts) ?? [];

  if (isLoading) return <PageLoading />;
  if (error) return <ErrorBanner message={error instanceof Error ? error.message : t('common.error')} onRetry={() => refetch()} />;

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-md)' }}>{t('drafts.title')}</h1>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 'var(--sp-xs)', overflowX: 'auto',
        marginBottom: 'var(--sp-lg)', paddingBottom: 'var(--sp-xs)',
      }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === tab ? 'var(--btn)' : 'var(--bg-secondary)',
              color: activeTab === tab ? 'var(--btn-text)' : 'var(--text)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font)',
            }}
          >
            {t(`drafts.${tab === 'all' ? 'all' : tab === 'auto' ? 'auto' : tab === 'handwrite' ? 'handwritten' : tab}`)}
          </button>
        ))}
      </div>

      {/* List */}
      {allDrafts.length === 0 ? (
        <EmptyState
          icon={<FileText size={40} />}
          title={t('drafts.noDraftsInCategory')}
          action={
            <button className="btn btn-primary" onClick={() => navigate('/compose')}>
              {t('home.handwrite')}
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {allDrafts.map(draft => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onTap={() => navigate(`/draft/${draft.id}`)}
              onApprove={() => approveMutation.mutate(draft.id)}
              onDelete={() => setDeleteTarget(draft.id)}
            />
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={observerRef} style={{ height: 1 }} />

          {isFetchingNextPage && (
            <div style={{ textAlign: 'center', padding: 'var(--sp-md)' }}>
              <span style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)' }}>{t('common.loading')}</span>
            </div>
          )}
        </div>
      )}

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        message={t('editor.confirmDelete')}
        confirmText={t('common.delete')}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {toastEl}
    </div>
  );
}

// ==================== DraftCard ====================

interface DraftCardProps {
  draft: Draft & { content: DraftContent; publish_targets: PublishTargets };
  onTap: () => void;
  onApprove: () => void;
  onDelete: () => void;
}

function DraftCard({ draft, onTap, onApprove, onDelete }: DraftCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const content = draft.content;
  const firstTweet = content.tweets?.[0]?.text || draft.pr_title;
  const preview = firstTweet.length > 120 ? firstTweet.substring(0, 117) + '...' : firstTweet;
  const hasMedia = content.tweets?.some(tw => tw.media?.length);
  const format = content.format === 'single'
    ? t('drafts.singleTweet')
    : `${t('drafts.thread')} (${content.tweets?.length || 0} ${t('drafts.tweets')})`;

  // Platform badges
  const targets = draft.publish_targets;
  const platformElements: React.ReactNode[] = [];
  if (targets.x) platformElements.push(<span key="x">X</span>);
  if (targets.instagram_post) platformElements.push(<Image key="ig-post" size={14} />);
  if (targets.instagram_story) platformElements.push(<FileText key="ig-story" size={14} />);
  if (targets.instagram_reel) platformElements.push(<Video key="ig-reel" size={14} />);

  return (
    <div
      className="card"
      onClick={onTap}
      style={{ cursor: 'pointer' }}
    >
      {/* Header: status + source + format */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-xs)' }}>
        <StatusBadge status={draft.status} />
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)' }}>{format}</span>
        {hasMedia && <Camera size={14} />}
        {platformElements.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', marginInlineStart: 'auto' }}>{platformElements}</span>
        )}
      </div>

      {/* Preview text */}
      <p dir={getTextDirection(preview)} style={{ fontSize: 'var(--text-base)', lineHeight: 1.4, marginBottom: 'var(--sp-sm)', textAlign: getTextDirection(preview) === 'rtl' ? 'right' : 'left' }}>{preview}</p>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 'var(--sp-xs)' }} onClick={e => e.stopPropagation()}>
        {draft.status === 'draft' && (
          <button className="btn btn-success" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={onApprove}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Check size={14} /> {t('editor.approve')}</span>
          </button>
        )}
        {(draft.status === 'draft' || draft.status === 'approved') && (
          <button
            className="btn btn-outline"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => navigate(`/draft/${draft.id}`)}
          >
            <Pencil size={14} />
          </button>
        )}
        {draft.status !== 'published' && (
          <button
            className="btn btn-danger"
            style={{ fontSize: '12px', padding: '4px 10px', marginInlineStart: 'auto' }}
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
