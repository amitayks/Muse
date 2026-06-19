import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, CheckCircle2, Calendar, Send, Loader,
  GitCommitHorizontal, Repeat2, PenLine,
} from 'lucide-react';
import { api } from '../api/client';
import { PageLoading, EmptyState } from '../components/shared';
import { haptics } from '../shell';
import { useTranslation } from '../i18n';
import type { DraftStatus } from '../types/draft';
import styles from './DraftsHubPage.module.css';

/** Counts as returned by GET /api/v1/home — by status AND by source/type. */
interface HomeCounts {
  draft: number;
  approved: number;
  scheduled: number;
  published: number;
  publishing: number;
  commit: number;
  repost: number;
  handwrite: number;
}

interface HomeResponse {
  counts: HomeCounts;
}

type SourceType = 'commit' | 'repost' | 'handwrite';

interface StatusTileDef {
  status: DraftStatus;
  labelKey: string;
  labelFallback: string;
  icon: typeof FileText;
}

interface TypeTileDef {
  source: SourceType;
  labelKey: string;
  labelFallback: string;
  icon: typeof FileText;
}

/** Status tiles. "draft" is surfaced as "Needs Review"; "publishing" appears only when nonzero. */
const STATUS_TILES: StatusTileDef[] = [
  { status: 'draft', labelKey: 'drafts.needsReview', labelFallback: 'Needs Review', icon: FileText },
  { status: 'approved', labelKey: 'status.approved', labelFallback: 'Approved', icon: CheckCircle2 },
  { status: 'scheduled', labelKey: 'status.scheduled', labelFallback: 'Scheduled', icon: Calendar },
  { status: 'published', labelKey: 'status.published', labelFallback: 'Published', icon: Send },
];

/** Type/source tiles — every draft of that source, across all statuses. */
const TYPE_TILES: TypeTileDef[] = [
  { source: 'commit', labelKey: 'home.fromCommit', labelFallback: 'From Code', icon: GitCommitHorizontal },
  { source: 'repost', labelKey: 'drafts.repost', labelFallback: 'Reposts', icon: Repeat2 },
  { source: 'handwrite', labelKey: 'drafts.handwritten', labelFallback: 'Handwritten', icon: PenLine },
];

/** Translate, falling back to a literal when the key is absent (key returned unchanged). */
function label(t: (key: string) => string, key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

/**
 * Drafts hub (`/drafts`). One page with every category: a "Status" section (status tiles →
 * `/drafts/:status`) and a "Type" section (source tiles → `/drafts/source/:source`, all statuses).
 * Top-level tabbed screen — keeps the Tabbar, no BackButton/MainButton.
 */
export function DraftsHubPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeResponse>('/api/v1/home'),
  });

  if (homeQuery.isLoading) return <PageLoading />;

  if (homeQuery.isError) {
    return (
      <div className={styles.screen}>
        <EmptyState
          title={t('common.error')}
          description={homeQuery.error instanceof Error ? homeQuery.error.message : undefined}
        />
      </div>
    );
  }

  const counts: HomeCounts = {
    draft: 0, approved: 0, scheduled: 0, published: 0, publishing: 0,
    commit: 0, repost: 0, handwrite: 0,
    ...homeQuery.data?.counts,
  };

  const statusTiles: StatusTileDef[] = [...STATUS_TILES];
  if (counts.publishing > 0) {
    statusTiles.push({
      status: 'publishing',
      labelKey: 'status.publishing',
      labelFallback: 'Publishing',
      icon: Loader,
    });
  }

  function openStatus(status: DraftStatus) {
    haptics.selectionChanged();
    navigate(`/drafts/${status}`);
  }

  function openType(source: SourceType) {
    haptics.selectionChanged();
    navigate(`/drafts/source/${source}`);
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{t('drafts.title')}</h1>

      <div className={styles.sectionHeader}>{label(t, 'drafts.byStatus', 'Status')}</div>
      <div className={styles.grid}>
        {statusTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.status}
              type="button"
              className={styles.tile}
              data-status={tile.status}
              onClick={() => openStatus(tile.status)}
            >
              <span className={styles.tileIcon}>
                <Icon size={20} />
              </span>
              <span className={styles.count}>{counts[tile.status as keyof HomeCounts]}</span>
              <span className={styles.label}>{label(t, tile.labelKey, tile.labelFallback)}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.sectionHeader}>{label(t, 'drafts.byType', 'Type')}</div>
      <div className={styles.grid}>
        {TYPE_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.source}
              type="button"
              className={styles.tile}
              data-type={tile.source}
              onClick={() => openType(tile.source)}
            >
              <span className={styles.tileIcon}>
                <Icon size={20} />
              </span>
              <span className={styles.count}>{counts[tile.source]}</span>
              <span className={styles.label}>{label(t, tile.labelKey, tile.labelFallback)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
