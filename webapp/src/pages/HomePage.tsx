import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarClock,
  GitCommitHorizontal,
  Repeat2,
  AtSign,
  Camera,
  MonitorPlay,
  Clapperboard,
  Briefcase,
  Sparkles,
  PenLine,
} from 'lucide-react';
import { Badge } from '@telegram-apps/telegram-ui';
import { api, ApiError } from '../api/client';
import { PageLoading, EmptyState, TimelineRow } from '../components/shared';
import { haptics } from '../shell';
import { useTimezone } from '../hooks/useTimezone';
import { dayDeltaInTz, formatTimeInTz, formatDateInTz, parseUTC } from '../lib/timezone';
import { useTranslation } from '../i18n';
import styles from './HomePage.module.css';

/* ------------------------------------------------------------------ *
 * GET /api/v1/home response shape (read-only aggregation)
 * ------------------------------------------------------------------ */

type ScheduledFormat = 'single' | `thread-${number}`;

interface ScheduledTargets {
  x: boolean;
  instagram_post: boolean;
  instagram_story: boolean;
  instagram_reel: boolean;
  linkedin: boolean;
}

interface ScheduledItem {
  id: string;
  title: string;
  firstTweet: string;
  scheduledAt: string | null;
  format: ScheduledFormat;
  targets: ScheduledTargets;
}

interface NotificationItem {
  kind: 'commit' | 'repost';
  id: string;
  title: string;
  preview: string;
  repo?: string;
  score?: number;
  /** Enriched by GET /api/v1/home: commit rows carry the resolved SHA. */
  sha?: string;
  /** Enriched by GET /api/v1/home: repost rows carry the source tweet URL. */
  url?: string;
}

/**
 * Seed handed to the Composer via router state (SEED CONTRACT).
 * - commit → pre-generate from a resolved SHA (POST /api/v1/generate)
 * - repost → pre-generate from a source URL (POST /api/v1/repost)
 */
type ComposeSeed =
  | { kind: 'commit'; sha: string; repo?: string; preview?: string }
  | { kind: 'repost'; url: string; preview?: string };

interface HomeResponse {
  scheduled: ScheduledItem[];
  notifications: NotificationItem[];
  counts: { draft: number; approved: number; scheduled: number; published: number };
  isAdmin: boolean;
}

type View = 'scheduled' | 'notifications';

/* ------------------------------------------------------------------ *
 * Date / time helpers — rendered in the user's CONFIGURED timezone offset
 * (users.timezone), not the device timezone, so the timeline agrees with the bot.
 * ------------------------------------------------------------------ */

/** Day-group label: Today / Tomorrow / localized date, in the user's offset. */
function dayLabel(iso: string, tz: string, t: (k: string, p?: Record<string, string>) => string): string {
  const delta = dayDeltaInTz(iso, tz);
  if (delta === 0) return t('time.today');
  if (delta === 1) return t('time.tomorrow');
  return formatDateInTz(iso, tz);
}

/** Time-of-day in the user's offset, e.g. "14:30" / "2:30 PM". */
function timeLabel(iso: string, tz: string): string {
  return formatTimeInTz(iso, tz);
}

/* ------------------------------------------------------------------ *
 * Platform icons (lucide brand icons were removed upstream — use neutral glyphs)
 * ------------------------------------------------------------------ */

const PLATFORM_ICON_SIZE = 16;

function PlatformIcons({ targets }: { targets: ScheduledTargets }) {
  const icons: ReactNode[] = [];
  if (targets.x) icons.push(<AtSign key="x" size={PLATFORM_ICON_SIZE} aria-label="X" />);
  if (targets.instagram_post) icons.push(<Camera key="ig" size={PLATFORM_ICON_SIZE} aria-label="Instagram" />);
  if (targets.instagram_story) icons.push(<MonitorPlay key="igs" size={PLATFORM_ICON_SIZE} aria-label="Instagram Story" />);
  if (targets.instagram_reel) icons.push(<Clapperboard key="igr" size={PLATFORM_ICON_SIZE} aria-label="Instagram Reel" />);
  if (targets.linkedin) icons.push(<Briefcase key="li" size={PLATFORM_ICON_SIZE} aria-label="LinkedIn" />);
  if (icons.length === 0) return null;
  return <span className={styles.platforms}>{icons}</span>;
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

const GLYPH_SIZE = 18;

/** Top-level tabbed Home screen: morphing scheduled ↔ notifications timelines. */
export function HomePage() {
  const { t } = useTranslation();
  const tz = useTimezone();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('scheduled');

  const { data, isLoading, isError, error, refetch } = useQuery<HomeResponse>({
    queryKey: ['home'],
    queryFn: () => api.get<HomeResponse>('/api/v1/home'),
    // Both timelines arrive together so the toggle morph is instant.
    refetchOnWindowFocus: true,
  });

  const notifications = data?.notifications ?? [];
  const hasNotifications = notifications.length > 0;

  // Group scheduled items by day (Today / Tomorrow / date) in ascending time order.
  const scheduledGroups = useMemo(() => {
    const scheduled = data?.scheduled ?? [];
    const dated = scheduled.filter((s): s is ScheduledItem & { scheduledAt: string } => !!s.scheduledAt);
    dated.sort((a, b) => parseUTC(a.scheduledAt).getTime() - parseUTC(b.scheduledAt).getTime());
    const groups: { label: string; items: (ScheduledItem & { scheduledAt: string })[] }[] = [];
    for (const item of dated) {
      const label = dayLabel(item.scheduledAt, tz, t);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [data?.scheduled, tz, t]);

  const toggleView = () => {
    haptics.selectionChanged();
    setView((v) => (v === 'scheduled' ? 'notifications' : 'scheduled'));
  };

  const openCompose = () => {
    haptics.impact('light');
    navigate('/compose');
  };

  const openScheduledDraft = (id: string) => {
    haptics.selectionChanged();
    navigate(`/draft/${id}`);
  };

  // Tapping a notification seeds the Composer from that source (no draft created yet).
  // SEED CONTRACT: pass a `seed` via router state, keyed by `kind`.
  const openNotification = (n: NotificationItem) => {
    haptics.selectionChanged();
    const seed: ComposeSeed | null =
      n.kind === 'commit' && n.sha
        ? { kind: 'commit', sha: n.sha, repo: n.repo, preview: n.preview }
        : n.kind === 'repost' && n.url
          ? { kind: 'repost', url: n.url, preview: n.preview }
          : null;
    if (!seed) return; // missing enrichment — nothing to seed, ignore the tap.
    navigate('/compose', { state: { seed } });
  };

  // --- Loading / error states ---
  if (isLoading) {
    return (
      <div className={styles.screen}>
        <PageLoading />
      </div>
    );
  }

  if (isError) {
    const message = error instanceof ApiError ? error.message : t('common.error');
    return (
      <div className={styles.screen}>
        <div className={styles.error}>
          <span>{message}</span>
          <button type="button" className={styles.retryBtn} onClick={() => void refetch()}>
            {t('common.retry')}
          </button>
        </div>
        <ComposeBar label={t('composer.tweetPlaceholder')} onClick={openCompose} />
      </div>
    );
  }

  const showingScheduled = view === 'scheduled';
  // The toggle shows the icon for the OTHER view (the destination of the tap).
  const ToggleIcon = showingScheduled ? Bell : CalendarClock;
  const toggleLabel = showingScheduled ? t('home.notifications') : t('home.scheduled');
  const title = showingScheduled ? t('home.scheduled') : t('home.notifications');
  const activeCount = showingScheduled ? scheduledGroups.reduce((n, g) => n + g.items.length, 0) : notifications.length;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{title}</h1>
          {activeCount > 0 && (
            <span className={styles.count}>
              <Badge type="number" mode="secondary">{activeCount}</Badge>
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.toggle}
          data-dot={showingScheduled && hasNotifications ? '' : undefined}
          onClick={toggleView}
          aria-label={toggleLabel}
          aria-pressed={!showingScheduled}
        >
          <ToggleIcon size={GLYPH_SIZE} />
        </button>
      </header>

      <div className={styles.body}>
        {showingScheduled ? (
          <ScheduledTimeline
            groups={scheduledGroups}
            tz={tz}
            onOpen={openScheduledDraft}
            emptyTitle={t('home.nothingScheduled')}
            emptyDesc={t('home.nothingScheduledDesc')}
          />
        ) : (
          <NotificationsTimeline
            items={notifications}
            onOpen={openNotification}
            repostLabel={t('home.repostCandidate')}
            commitLabel={t('home.newCommit')}
            emptyTitle={t('home.noNotifications')}
            emptyDesc={t('home.noNotificationsDesc')}
          />
        )}
      </div>

      <ComposeBar label={t('composer.tweetPlaceholder')} onClick={openCompose} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Scheduled timeline
 * ------------------------------------------------------------------ */

interface ScheduledTimelineProps {
  groups: { label: string; items: (ScheduledItem & { scheduledAt: string })[] }[];
  tz: string;
  onOpen: (id: string) => void;
  emptyTitle: string;
  emptyDesc: string;
}

function ScheduledTimeline({ groups, tz, onOpen, emptyTitle, emptyDesc }: ScheduledTimelineProps) {
  if (groups.length === 0) {
    return (
      <div className={styles.center}>
        <EmptyState icon={<CalendarClock size={40} />} title={emptyTitle} description={emptyDesc} />
      </div>
    );
  }
  return (
    <div className={styles.timeline}>
      {groups.map((group) => (
        <div key={group.label}>
          <div className={styles.dayHeader}>{group.label}</div>
          <div className={styles.group}>
            {group.items.map((item) => (
              <TimelineRow
                key={item.id}
                title={item.title || item.firstTweet}
                subtitle={item.title ? item.firstTweet : undefined}
                meta={
                  <>
                    <span className={styles.metaTime}>{timeLabel(item.scheduledAt, tz)}</span>
                    <PlatformIcons targets={item.targets} />
                  </>
                }
                onClick={() => onOpen(item.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Notifications timeline
 * ------------------------------------------------------------------ */

interface NotificationsTimelineProps {
  items: NotificationItem[];
  onOpen: (n: NotificationItem) => void;
  repostLabel: string;
  commitLabel: string;
  emptyTitle: string;
  emptyDesc: string;
}

function NotificationsTimeline({
  items,
  onOpen,
  repostLabel,
  commitLabel,
  emptyTitle,
  emptyDesc,
}: NotificationsTimelineProps) {
  if (items.length === 0) {
    return (
      <div className={styles.center}>
        <EmptyState icon={<Bell size={40} />} title={emptyTitle} description={emptyDesc} />
      </div>
    );
  }
  return (
    <div className={styles.timeline}>
      <div className={styles.group}>
        {items.map((n) => {
          const isRepost = n.kind === 'repost';
          const Glyph = isRepost ? Repeat2 : GitCommitHorizontal;
          const kindLabel = isRepost ? repostLabel : commitLabel;
          return (
            <TimelineRow
              key={`${n.kind}:${n.id}`}
              before={
                <span className={`${styles.glyph} ${isRepost ? styles.glyphRepost : ''}`}>
                  <Glyph size={GLYPH_SIZE} />
                </span>
              }
              title={n.title || kindLabel}
              subtitle={n.preview || undefined}
              meta={
                <>
                  {isRepost && typeof n.score === 'number' && (
                    <span className={styles.score}>
                      <Sparkles size={12} />
                      {n.score}/10
                    </span>
                  )}
                  {!isRepost && n.repo && <span className={styles.repoTag}>{n.repo}</span>}
                </>
              }
              onClick={() => onOpen(n)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Persistent compose placeholder
 * ------------------------------------------------------------------ */

function ComposeBar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.composeBar} onClick={onClick}>
      <span className={styles.composeIcon}>
        <PenLine size={18} />
      </span>
      <span className={styles.composeLabel}>{label}</span>
    </button>
  );
}
