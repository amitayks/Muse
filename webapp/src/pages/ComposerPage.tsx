import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Trash2, CalendarClock, Sparkles, GitCommitHorizontal, Repeat2, Plus, X as XIcon,
  ChevronUp, ChevronDown, ExternalLink, AlertTriangle, Clock, CheckCircle2,
  Languages,
  MonitorPlay, Clapperboard,
} from 'lucide-react';

import { api, ApiError } from '../api/client';
import type { Draft, DraftContent, Tweet } from '../types/draft';
import type { UploadedMedia } from '../hooks/useMediaUpload';
import { useGenerateImage } from '../hooks/useGenerateImage';
import { getTextDirection } from '../lib/textDirection';
import { withTarget, isMediaTargeted, type MediaPlatform } from '../lib/mediaTargets';
import { MediaTargetRow } from '../components/MediaTargetRow';
import { createDeferredSave, type DeferredSave } from '../lib/deferredSave';
import { dayDeltaInTz, formatTimeInTz, formatDateInTz, parseUTC } from '../lib/timezone';
import { SecondaryButton } from '../lib/telegram';
import { useTimezone } from '../hooks/useTimezone';
import { useTranslation } from '../i18n';
import { useBackButton, useMainButton, useSecondaryButton } from '../shell';
import {
  confirmDestructive, confirm, popup, notifyError, haptics,
} from '../shell';
import { PageLoading, CharCounter, PlatformTogglePill, XLogo, InstagramLogo, LinkedInLogo, MediaGrid, ImageDropZone, Spinner, Toggle, type ProgressState } from '../components/shared';
import { ScheduleCalendar } from '../components/ScheduleCalendar';
import { resolveLifecycle } from './composerLifecycle';
import styles from './ComposerPage.module.css';

const X_LIMIT = 280;
const MAX_IMAGES = 4;
const MEDIA_BASE = import.meta.env.VITE_API_URL || '';

/** Local targets shape — the wire/backend carries `linkedin`, the webapp type does not yet. */
interface Targets {
  x: boolean;
  instagram_post: boolean;
  instagram_story: boolean;
  instagram_reel: boolean;
  linkedin: boolean;
}

const DEFAULT_TARGETS: Targets = {
  x: true,
  instagram_post: false,
  instagram_story: false,
  instagram_reel: false,
  linkedin: false,
};

interface DraftDetail extends Draft {
  user_profile?: {
    display_name?: string;
    username?: string;
    profile_image_url?: string | null;
    has_instagram?: boolean;
  } | null;
}

interface SettingsCaps {
  has_instagram: boolean;
  has_linkedin: boolean;
}

/**
 * GET /api/v1/drafts/:id/media-progress — per-media pre-upload ("warm") progress.
 * `media` is keyed media_key → platform → { status }; only platforms with a warm row appear.
 */
interface MediaProgressResponse {
  media: Record<string, Partial<Record<MediaPlatform, { status: ProgressState }>>>;
}

interface CommitSource {
  /** Partial or full SHA the user pasted / was seeded with. */
  sha: string;
  /** owner/repo, once resolved (or carried by the seed). */
  repo?: string;
  /** Resolved commit title, once resolved. */
  title?: string;
  /** Resolved commit summary, once resolved. */
  summary?: string;
  /** True once GET /api/v1/commits/resolve has confirmed the commit. */
  resolved: boolean;
}

/** Repost generation source attached pre-generate. */
interface RepostSource {
  /** Source tweet URL the generation will quote/repost. */
  url: string;
  /** Optional preview text carried from the Home notification. */
  preview?: string;
}

/** GET /api/v1/commits/resolve response. */
interface ResolvedCommit {
  repo: string;
  sha: string;
  title: string;
  summary: string;
}

/**
 * Seed passed from Home → Composer (SEED CONTRACT). The Composer reads `location.state.seed`.
 * - commit → pre-generate from a SHA, MainButton "Generate" → POST /api/v1/generate
 * - repost → pre-generate from a URL, MainButton "Generate" → POST /api/v1/repost
 */
type ComposeSeed =
  | { kind: 'commit'; sha: string; repo?: string; preview?: string }
  | { kind: 'repost'; url: string; preview?: string };

/**
 * Unified Composer / Draft-viewer.
 *
 * One component, one lifecycle state machine. Serves `/compose` (new handwrite or commit-seeded)
 * and `/draft/:id` (existing). The system MainButton morphs Save → Generate → Approve → Publish;
 * published drafts are read-only with results/links. All persistence goes through the existing
 * draft endpoints so the bot-message live-sync stays intact.
 */
export function ComposerPage() {
  const { t } = useTranslation();
  const tz = useTimezone();
  const { id: routeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useBackButton();

  // The draft id can be supplied by the route (/draft/:id) or created in-place by Save/Generate.
  const [draftId, setDraftId] = useState<string | null>(routeId ?? null);

  // ---- Pre-draft (compose) seed: handwrite text, optional generation source, toggles, instruction.
  const seed = (location.state as { seed?: ComposeSeed } | null)?.seed;
  const [tweets, setTweets] = useState<Tweet[]>([{ text: '', index: 0 }]);
  const [instruction, setInstruction] = useState('');
  const [commitSource, setCommitSource] = useState<CommitSource | null>(
    seed?.kind === 'commit'
      ? { sha: seed.sha, repo: seed.repo, summary: seed.preview, resolved: false }
      : null,
  );
  const [repostSource, setRepostSource] = useState<RepostSource | null>(
    seed?.kind === 'repost' ? { url: seed.url, preview: seed.preview } : null,
  );
  const [aiOn, setAiOn] = useState(false);
  const { lang } = useTranslation();
  const [langOverride, setLangOverride] = useState<'en' | 'he' | null>(null);

  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ---- Existing-draft query ----
  const draftQuery = useQuery({
    queryKey: ['draft', draftId],
    queryFn: () => api.get<DraftDetail>(`/api/v1/drafts/${draftId}`),
    enabled: !!draftId,
    refetchInterval: (q) =>
      // Poll while a publish pipeline is running so results/links land without a manual refresh.
      q.state.data?.status === 'publishing' ? 2500 : false,
  });
  const draft = draftQuery.data ?? null;

  // LinkedIn capability isn't in the draft detail payload — read it from settings.
  const capsQuery = useQuery({
    queryKey: ['settings-caps'],
    queryFn: () => api.get<SettingsCaps>('/api/v1/settings'),
    enabled: !!draftId,
    staleTime: 60_000,
  });

  // Per-media pre-upload ("warm") progress for the ring around each platform icon. The query has NO
  // refetchInterval — polling is driven manually by the shouldPollWarm effect below (after targets +
  // eligibility are known), which is robust against react-query's interval-restart quirks and bridges
  // the async server-side warm-row creation. An unsaved draft (no id) or error simply yields no rings.
  const mediaProgressQuery = useQuery({
    queryKey: ['media-progress', draftId],
    queryFn: () => api.get<MediaProgressResponse>(`/api/v1/drafts/${draftId}/media-progress`),
    enabled: !!draftId,
  });
  const progressByMediaKey = mediaProgressQuery.data?.media;

  // Hydrate the editable tweet buffer ONCE per draft id. Background refetches (after a debounced
  // content save, a status/targets change, or a window-focus revalidation) must NOT re-seed —
  // doing so would clobber the user's in-progress edit and snap the caret to the end. Operations
  // that intentionally replace content server-side (refine) clear `hydratedFor` to force a re-seed.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!draft) return;
    if (hydratedFor.current === draft.id) return;
    const content = draft.content as DraftContent | undefined;
    const next = content?.tweets?.length ? content.tweets : [{ text: '', index: 0 }];
    // Seed the editable buffer from the GET response, carrying each tweet's stable `id` (`...tw`).
    // The server backfills ids on read-for-edit, so the editor always has ids to address the
    // dedicated media endpoints (attach/remove/retarget/image) by tweet identity.
    setTweets(next.map((tw, i) => ({ ...tw, index: i })));
    hydratedFor.current = draft.id;
  }, [draft]);

  const lifecycle = useMemo(
    () => resolveLifecycle(draft, !!commitSource || !!repostSource),
    [draft, commitSource, repostSource],
  );

  const targets: Targets = useMemo(() => {
    if (!draft) return DEFAULT_TARGETS;
    return { ...DEFAULT_TARGETS, ...(draft.publish_targets as Partial<Targets>) };
  }, [draft]);

  const hasInstagram = draft?.user_profile?.has_instagram ?? capsQuery.data?.has_instagram ?? false;
  const hasLinkedIn = capsQuery.data?.has_linkedin ?? false;

  // ALL connected platforms — each renders a pill on every media item (highlighted = a destination
  // this media is targeted to). X is always available; IG/LinkedIn require a connection.
  const connectedMediaPlatforms = useMemo<MediaPlatform[]>(() => {
    const ps: MediaPlatform[] = ['x'];
    if (hasInstagram) ps.push('instagram_post', 'instagram_story', 'instagram_reel');
    if (hasLinkedIn) ps.push('linkedin');
    return ps;
  }, [hasInstagram, hasLinkedIn]);

  // Should we be live-polling warm progress right now? True while ANY expected (media, platform) upload
  // is not yet terminal. An expected pair the server is still creating shows here as "missing", which
  // counts as not-terminal — so polling bridges the async row-creation gap after a media drop and then
  // runs until every targeted upload is ready/failed. Recomputed each render from the editable buffer +
  // targets + latest progress, so it flips reactively (no react-query interval quirks). Far-future
  // scheduled drafts aren't warmed yet (server gate: within 20h of publish), so they don't poll.
  const shouldPollWarm = useMemo(() => {
    if (!draftId) return false;
    if (draft?.scheduled_at) {
      const at = Date.parse(draft.scheduled_at.replace(' ', 'T'));
      if (!Number.isNaN(at) && at - Date.now() > 20 * 60 * 60 * 1000) return false;
    }
    const map = mediaProgressQuery.data?.media;
    for (const tw of tweets) {
      for (const m of tw.media ?? []) {
        for (const p of connectedMediaPlatforms) {
          if (!targets[p] || !isMediaTargeted(m, p)) continue; // not an expected warm
          const status = map?.[m.key]?.[p]?.status as string | undefined;
          if (status !== 'ready' && status !== 'failed' && status !== 'expired') return true;
        }
      }
    }
    return false;
  }, [draftId, draft?.scheduled_at, tweets, targets, connectedMediaPlatforms, mediaProgressQuery.data]);

  // Manual poll loop (robust vs. react-query's refetchInterval restart behavior): refetch immediately
  // when polling becomes wanted, then every 2.5s, and clear when everything settles or on unmount.
  const mediaProgressRefetchRef = useRef(mediaProgressQuery.refetch);
  mediaProgressRefetchRef.current = mediaProgressQuery.refetch;
  useEffect(() => {
    if (!shouldPollWarm) return;
    void mediaProgressRefetchRef.current();
    const id = setInterval(() => { void mediaProgressRefetchRef.current(); }, 2500);
    return () => clearInterval(id);
  }, [shouldPollWarm]);

  // ============================================================
  // Persistence — every write goes through an existing endpoint.
  // ============================================================

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['draft', draftId] });
  }, [queryClient, draftId]);

  /** Build the DraftContent payload from the current tweet buffer (drops empty trailing tweets). */
  const buildContent = useCallback((): DraftContent => {
    const cleaned = tweets
      .map((tw) => ({ text: tw.text, media: tw.media }))
      .filter((tw, i) => i === 0 || tw.text.trim().length > 0 || (tw.media && tw.media.length > 0));
    const finalTweets: Tweet[] = (cleaned.length ? cleaned : [{ text: '', media: undefined }]).map(
      (tw, i) => ({ text: tw.text, index: i, media: tw.media }),
    );
    return { format: finalTweets.length === 1 ? 'single' : 'thread', tweets: finalTweets };
  }, [tweets]);

  const effectiveLangOverride = langOverride && langOverride !== lang ? langOverride : undefined;

  // ---- Save (handwrite compose) ----
  const handleSave = useCallback(async () => {
    setErrorMsg(null);
    setPending(true);
    try {
      const content = buildContent();
      const res = await api.post<{ success: boolean; draftId: string }>('/api/v1/compose', {
        tweets: content.tweets.map((tw) => ({ text: tw.text, media: tw.media })),
        options: {
          aiRefine: aiOn,
          instruction: instruction.trim() || undefined,
          langOverride: effectiveLangOverride,
        },
      });
      haptics.notification('success');
      // Morph in place: keep the screen, switch to the existing-draft (Approve) state.
      setDraftId(res.draftId);
      navigate(`/draft/${res.draftId}`, { replace: true });
    } catch (err) {
      setErrorMsg(messageOf(err));
      haptics.notification('error');
    } finally {
      setPending(false);
    }
  }, [buildContent, aiOn, instruction, effectiveLangOverride, navigate]);

  // ---- Generate (commit- or repost-seeded) ----
  const handleGenerate = useCallback(async () => {
    if (!commitSource && !repostSource) return;
    setErrorMsg(null);
    setPending(true);
    haptics.impact('medium');
    try {
      const firstText = tweets[0]?.text.trim();
      let res: { success: boolean; draftId: string };
      if (commitSource) {
        // POST /api/v1/generate { sha, message, instruction, options }
        res = await api.post<{ success: boolean; draftId: string }>('/api/v1/generate', {
          sha: commitSource.sha,
          message: firstText || undefined,
          instruction: instruction.trim() || undefined,
          options: { langOverride: effectiveLangOverride },
        });
      } else {
        // POST /api/v1/repost { url, tweets, options }
        res = await api.post<{ success: boolean; draftId: string }>('/api/v1/repost', {
          url: repostSource!.url,
          tweets: buildContent().tweets.map((tw) => ({ text: tw.text, media: tw.media })),
          options: {
            instruction: instruction.trim() || undefined,
            langOverride: effectiveLangOverride,
          },
        });
      }
      haptics.notification('success');
      setCommitSource(null);
      setRepostSource(null);
      setDraftId(res.draftId);
      navigate(`/draft/${res.draftId}`, { replace: true });
    } catch (err) {
      setErrorMsg(messageOf(err));
      haptics.notification('error');
    } finally {
      setPending(false);
    }
  }, [commitSource, repostSource, tweets, instruction, effectiveLangOverride, buildContent, navigate]);

  // ---- Persist content edits (existing draft) ----
  const saveContentMutation = useMutation({
    mutationFn: (content: DraftContent) =>
      api.put<DraftDetail>(`/api/v1/drafts/${draftId}`, { content }),
    // Adopt the server-assigned stable ids for locally-created tweets. The PUT response carries the
    // reconciled tweets (each with an `id`) 1:1-by-position with the savable buffer tweets we sent;
    // we fill in any MISSING id BY POSITION without touching text, caret, or media. Without this a
    // new tweet never learns its id and later media ops fall back to numeric-index addressing (which
    // can misroute / 404). See adoptTweetIdsByPosition for the position-mapping + bail guard.
    onSuccess: (data) => {
      const serverTweets = (data?.content as DraftContent | undefined)?.tweets;
      if (serverTweets?.length) setTweets((prev) => adoptTweetIdsByPosition(prev, serverTweets));
    },
    onError: (err) => setErrorMsg(messageOf(err)),
    // Intentionally NO refetch: the local tweet buffer is the source of truth while editing, and
    // the backend persists + syncs the bot message on its own. Refetching here would re-hydrate
    // mid-edit and jump the caret. (Warm-progress polling is driven reactively by shouldPollWarm —
    // when the server warms this draft's media the rings pick it up on the next poll.)
  });

  /** Debounced content persistence while editing an existing, editable draft. */
  // Always persist the LATEST tweet buffer at fire time, never a snapshot captured when the timer
  // was armed (the user may keep typing while the debounce is pending).
  const tweetsRef = useRef(tweets);
  useEffect(() => { tweetsRef.current = tweets; }, [tweets]);
  // Keep the latest mutation reachable from the one stable saver instance below.
  const saveContentMutationRef = useRef(saveContentMutation);
  useEffect(() => { saveContentMutationRef.current = saveContentMutation; });

  /**
   * Build the TEXT-ONLY content payload from the latest tweet buffer. Tweets carry `{ id, text }`
   * only — NO media. The server reconciles by `id` and preserves each surviving tweet's stored media
   * untouched, so this save can never add, drop, or reorder media. New tweets omit `id` → the server
   * assigns one. (Media lives in the buffer for rendering and for the keep filter, but is intentionally
   * not serialized into the payload.)
   *
   * CRITICAL (F1): a tweet that has an `id` is NEVER dropped, even when its LOCAL buffer is empty
   * (no text, no media) — the SERVER may hold media on it (e.g. a lost generate/attach response), and
   * omitting its id from the payload would make the server's reconcile DELETE the tweet and its media.
   * Only an id-LESS, empty, media-less non-first tweet is droppable (it has no server identity, so it
   * cannot hold server media). See keepTweetForSave.
   */
  const buildLatestContent = useCallback((): DraftContent => {
    const finalTweets: Tweet[] = tweetsRef.current
      .filter((tw, i) => keepTweetForSave(tw, i))
      .map((tw, i) => ({ id: tw.id, text: tw.text, index: i }));
    return {
      format: finalTweets.length === 1 ? 'single' : 'thread',
      tweets: finalTweets.length ? finalTweets : [{ text: '', index: 0 }],
    };
  }, []);

  // One stable deferred-save instance. It reads refs lazily, so every fire sees the latest buffer
  // and the latest mutation. Media is no longer in the payload, so no in-flight guard is needed —
  // a stale/lost text save is structurally incapable of clobbering server-held media.
  const deferredSaveRef = useRef<DeferredSave | null>(null);
  if (!deferredSaveRef.current) {
    deferredSaveRef.current = createDeferredSave<DraftContent>({
      getValue: () => buildLatestContent(),
      save: (content) => saveContentMutationRef.current.mutate(content),
    });
  }

  const persistContentDebounced = useCallback(() => {
    if (!draftId || !lifecycle.isExistingDraft || !lifecycle.canEdit) return;
    deferredSaveRef.current!.schedule();
  }, [draftId, lifecycle.isExistingDraft, lifecycle.canEdit]);

  useEffect(() => () => deferredSaveRef.current?.cancel(), []);

  // ---- Approve ----
  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/drafts/${draftId}/approve`),
    onSuccess: () => { haptics.notification('success'); void refresh(); },
    onError: (err) => { setErrorMsg(messageOf(err)); void notifyError(messageOf(err)); },
  });

  // ---- Publish (background pipeline) ----
  const publishMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/drafts/${draftId}/publish`),
    onSuccess: () => { haptics.notification('success'); void refresh(); },
    onError: (err) => { setErrorMsg(messageOf(err)); void notifyError(messageOf(err)); },
  });

  // ---- Targets ----
  const targetsMutation = useMutation({
    mutationFn: (next: Targets) =>
      api.put(`/api/v1/drafts/${draftId}/targets`, { publish_targets: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['draft', draftId] });
      const prev = queryClient.getQueryData<DraftDetail>(['draft', draftId]);
      if (prev) {
        queryClient.setQueryData<DraftDetail>(['draft', draftId], {
          ...prev,
          publish_targets: next as DraftDetail['publish_targets'],
        });
      }
      return { prev };
    },
    onError: (err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['draft', draftId], ctx.prev);
      setErrorMsg(messageOf(err));
    },
    onSuccess: () => { void refresh(); },
  });

  // ---- Schedule / Unschedule ----
  const scheduleMutation = useMutation({
    mutationFn: (scheduledAt: string) =>
      api.post(`/api/v1/drafts/${draftId}/schedule`, { scheduled_at: scheduledAt }),
    onSuccess: () => { haptics.notification('success'); void refresh(); },
    onError: (err) => { setErrorMsg(messageOf(err)); void notifyError(messageOf(err)); },
  });
  const unscheduleMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/drafts/${draftId}/schedule`),
    onSuccess: () => { haptics.notification('success'); void refresh(); },
    onError: (err) => { setErrorMsg(messageOf(err)); void notifyError(messageOf(err)); },
  });

  // ---- Refine ----
  const refineMutation = useMutation({
    mutationFn: (vars: { instruction: string; newImage: boolean }) =>
      api.post<{ success: boolean; content: DraftContent; imageError?: string }>(
        `/api/v1/drafts/${draftId}/refine`, vars,
      ),
    // Refine replaces the content server-side, so force a one-time re-seed of the editable buffer.
    onSuccess: (res) => {
      hydratedFor.current = null;
      haptics.notification('success');
      setRefining(false);
      // The text refine still succeeded even if the requested new image failed — surface a soft error.
      if (res?.imageError) void notifyError(t('editor.refineImageError'));
      void refresh();
    },
    onError: (err) => { setErrorMsg(messageOf(err)); void notifyError(messageOf(err)); },
  });

  // ---- Delete ----
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/drafts/${draftId}`),
    onSuccess: () => { haptics.notification('success'); navigate(-1); },
    onError: (err) => { setErrorMsg(messageOf(err)); void notifyError(messageOf(err)); },
  });

  // ============================================================
  // MainButton wiring (morphs by lifecycle)
  // ============================================================

  const doPublish = useCallback(async () => {
    const ok = await confirm(t('editor.confirmPublish'));
    if (ok) publishMutation.mutate();
  }, [t, publishMutation]);

  const mainBusy =
    pending ||
    approveMutation.isPending ||
    publishMutation.isPending ||
    saveContentMutation.isPending;

  const mainConfig = useMemo(() => {
    switch (lifecycle.primaryAction) {
      case 'save':
        return { text: t('composer.save'), onClick: () => void handleSave(), enabled: hasAnyText(tweets) && !pending, loading: pending };
      case 'generate':
        return {
          text: t('composer.generate'),
          onClick: () => void handleGenerate(),
          // A commit must be resolved before Generate; a repost source is ready as soon as attached.
          enabled: ((commitSource ? commitSource.resolved : !!repostSource)) && !pending,
          loading: pending,
        };
      case 'approve':
        return { text: t('composer.approve'), onClick: () => approveMutation.mutate(), enabled: !mainBusy, loading: approveMutation.isPending };
      case 'publish':
        return {
          text: lifecycle.mode === 'scheduled' ? t('composer.publishNow') : t('composer.publish'),
          onClick: () => void doPublish(),
          enabled: !mainBusy,
          loading: publishMutation.isPending,
        };
      default:
        return null;
    }
  }, [
    lifecycle.primaryAction, lifecycle.mode, t, tweets, pending, commitSource, repostSource,
    handleSave, handleGenerate, approveMutation, publishMutation, doPublish, mainBusy,
  ]);

  useMainButton(mainConfig);

  // ============================================================
  // Tweet editing helpers
  // ============================================================

  const updateTweetText = useCallback((index: number, text: string) => {
    setTweets((prev) => {
      const next = prev.map((tw, i) => (i === index ? { ...tw, text } : tw));
      persistContentDebounced();
      return next;
    });
  }, [persistContentDebounced]);

  const addThreadTweet = useCallback(() => {
    setTweets((prev) => [...prev, { text: '', index: prev.length }]);
    haptics.selectionChanged();
  }, []);

  const removeTweet = useCallback((index: number) => {
    setTweets((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index).map((tw, i) => ({ ...tw, index: i }));
      persistContentDebounced();
      return next;
    });
  }, [persistContentDebounced]);

  const moveTweet = useCallback((index: number, dir: -1 | 1) => {
    setTweets((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      const reindexed = next.map((tw, i) => ({ ...tw, index: i }));
      persistContentDebounced();
      return reindexed;
    });
    haptics.selectionChanged();
  }, [persistContentDebounced]);

  // ---- Server-authoritative tweet-id resolution for media ops ----
  // A media endpoint MUST be addressed by a tweet's stable server `id`. A locally-created tweet
  // (addThreadTweet) has none until a content save mints one; addressing it by numeric array index
  // resolves out-of-range server-side → 404 → the media op (and its media) is lost (F7/F8). So before
  // any media op on an id-less tweet we FLUSH a content save (await the PUT), adopt the server id for
  // that tweet, and address the endpoint with the real id.

  /**
   * Flush a content save NOW (cancelling any pending debounce) and return the stable id the server
   * assigned to the tweet at `index`. The payload keeps the savable tweets (mirroring buildLatestContent)
   * but ALWAYS includes the target `index` — so even a brand-new, still-empty tweet (e.g. an image
   * dropped onto a freshly-added thread tweet before any text) is persisted and gets a real id, instead
   * of being filtered out (which would leave us unable to mint its id). The PUT response's tweets are
   * 1:1-by-position with what we sent, so we read back the id at the target's position. Returns null on
   * failure. (Dropped tweets are only id-less/unpersisted — the server never deletes a stored tweet.)
   */
  const flushContentSaveForTweet = useCallback(async (id: string, index: number): Promise<string | null> => {
    deferredSaveRef.current?.cancel();
    const sent = tweetsRef.current;
    const keptIdx: number[] = [];
    sent.forEach((tw, i) => { if (keepTweetForSave(tw, i) || i === index) keptIdx.push(i); });
    const payloadTweets: Tweet[] = (keptIdx.length ? keptIdx : [0]).map((bi, pos) => ({
      id: sent[bi]?.id, text: sent[bi]?.text ?? '', index: pos,
    }));
    const payload: DraftContent = {
      format: payloadTweets.length === 1 ? 'single' : 'thread',
      tweets: payloadTweets,
    };
    try {
      const res = await api.put<DraftDetail>(`/api/v1/drafts/${id}`, { content: payload });
      const serverTweets = (res?.content as DraftContent | undefined)?.tweets ?? [];
      setTweets((prev) => adoptTweetIdsByPosition(prev, serverTweets));
      const k = keptIdx.indexOf(index);
      return (k >= 0 ? serverTweets[k]?.id : undefined) ?? null;
    } catch (err) {
      setErrorMsg(messageOf(err));
      return null;
    }
  }, []);

  /**
   * Adopt (loss-free) the stable id the SERVER already holds for the tweet at `index`, via a GET — used
   * when the local buffer isn't hydrated yet (a just-created draft). A GET never mutates server media,
   * so this is always safe. Maps the tweet to a server tweet BY POSITION among the savable tweets and
   * returns its id, or null if it can't be mapped (shape diverged / extra local tweet).
   */
  const adoptIdFromServer = useCallback(async (id: string, index: number): Promise<string | null> => {
    try {
      const fresh = await api.get<DraftDetail>(`/api/v1/drafts/${id}`);
      const serverTweets = (fresh?.content as DraftContent | undefined)?.tweets ?? [];
      setTweets((prev) => adoptTweetIdsByPosition(prev, serverTweets));
      const cur = tweetsRef.current;
      const savable: number[] = [];
      cur.forEach((tw, i) => { if (keepTweetForSave(tw, i)) savable.push(i); });
      if (savable.length !== serverTweets.length) return null;
      const k = savable.indexOf(index);
      return (k >= 0 ? serverTweets[k]?.id : undefined) ?? null;
    } catch {
      return null;
    }
  }, []);

  /**
   * The stable id for the tweet at `index`: return it if the buffer already has it. Otherwise mint /
   * adopt it WITHOUT ever dropping server-held media:
   *  - Buffer hydrated for this draft → every pre-existing tweet carries its server id, so a content
   *    save reconciles by id (media-safe). FLUSH it to persist the new tweet and mint its id (F7/F8).
   *  - Buffer NOT yet hydrated (just-created draft) → flushing id-less content could mis-reconcile and
   *    drop composed media, so DON'T flush: adopt the id the server already assigned (loss-free GET),
   *    falling back to the numeric index string (the server resolves an in-range index, and a 404 then
   *    triggers the caller's re-hydrate-and-retry self-heal).
   */
  const resolveTweetId = useCallback(async (id: string, index: number): Promise<string | null> => {
    const existing = tweetsRef.current[index]?.id;
    if (existing) return existing;
    if (hydratedFor.current === id) return flushContentSaveForTweet(id, index);
    return (await adoptIdFromServer(id, index)) ?? String(index);
  }, [flushContentSaveForTweet, adoptIdFromServer]);

  /**
   * Self-heal after a media op 404s (the tweet id is unknown server-side — a losing concurrent
   * backfill, or an unpersisted tweet): re-read the draft, adopt the authoritative tweet ids into the
   * buffer, and return the authoritative server tweet for `index` (matched by id, else by position).
   * The caller surfaces a soft error and may retry once with the freshly-adopted id.
   */
  const rehydrateTweetFromServer = useCallback(async (id: string, index: number): Promise<Tweet | null> => {
    try {
      const fresh = await api.get<DraftDetail>(`/api/v1/drafts/${id}`);
      const serverTweets = (fresh?.content as DraftContent | undefined)?.tweets ?? [];
      const local = tweetsRef.current[index];
      const match = (local?.id ? serverTweets.find((st) => st.id === local.id) : undefined)
        ?? serverTweets[index];
      setTweets((prev) => adoptTweetIdsByPosition(prev, serverTweets));
      return match ?? null;
    } catch {
      return null;
    }
  }, []);

  // Media mutations go through the dedicated, atomic, server-authoritative endpoints (NOT the text
  // auto-save). We update local state optimistically for responsiveness, then reconcile from the
  // endpoint's authoritative media array; on error we revert. Pre-save (no draft id) there is no
  // endpoint yet, so media is held locally and submitted with the compose/repost POST.
  const addMedia = useCallback(async (index: number, m: UploadedMedia) => {
    if (!draftId) {
      // Pre-save compose: keep locally; handleSave/handleGenerate carry it in the compose payload.
      setTweets((prev) => prev.map((tw, i) =>
        i === index ? { ...tw, media: [...(tw.media ?? []), { key: m.key, type: m.type }] } : tw));
      return;
    }
    // Optimistic append.
    setTweets((prev) => prev.map((tw, i) =>
      i === index ? { ...tw, media: [...(tw.media ?? []), { key: m.key, type: m.type }] } : tw));
    const revert = () => setTweets((prev) => prev.map((tw, i) =>
      i === index ? { ...tw, media: (tw.media ?? []).filter((mm) => mm.key !== m.key) } : tw));
    // Ensure the tweet exists server-side (mint+adopt its id) BEFORE addressing the endpoint (F7/F8).
    const ref = await resolveTweetId(draftId, index);
    if (!ref) { revert(); return; }
    const attach = async (tweetRef: string) => {
      const res = await api.attachMedia(draftId, tweetRef, { key: m.key, type: m.type });
      setTweets((prev) => prev.map((tw, i) =>
        i === index ? { ...tw, id: tw.id ?? res.tweetId, media: res.media } : tw));
    };
    try {
      await attach(ref);
    } catch (err) {
      // Stale/unknown id (losing concurrent backfill or unpersisted tweet) → re-hydrate authoritative
      // ids and retry once with the freshly-adopted id (F6).
      if (err instanceof ApiError && err.status === 404) {
        const healed = await rehydrateTweetFromServer(draftId, index);
        if (healed?.id && healed.id !== ref) {
          try { await attach(healed.id); return; } catch (e2) { setErrorMsg(messageOf(e2)); }
        } else { setErrorMsg(messageOf(err)); }
      } else {
        setErrorMsg(messageOf(err));
      }
      revert();
    }
  }, [draftId, resolveTweetId, rehydrateTweetFromServer]);

  const removeMedia = useCallback(async (tweetIndex: number, mediaIndex: number) => {
    const item = tweets[tweetIndex]?.media?.[mediaIndex];
    if (!item) return;
    if (!draftId) {
      setTweets((prev) => prev.map((tw, i) => {
        if (i !== tweetIndex) return tw;
        const media = (tw.media ?? []).filter((_, mi) => mi !== mediaIndex);
        return { ...tw, media: media.length ? media : undefined };
      }));
      return;
    }
    // Optimistic unlink.
    setTweets((prev) => prev.map((tw, i) =>
      i === tweetIndex ? { ...tw, media: (tw.media ?? []).filter((mm) => mm.key !== item.key) } : tw));
    const revert = () => setTweets((prev) => prev.map((tw, i) => {
      if (i !== tweetIndex) return tw;
      const media = [...(tw.media ?? [])];
      media.splice(mediaIndex, 0, item);
      return { ...tw, media };
    }));
    const ref = await resolveTweetId(draftId, tweetIndex);
    if (!ref) { revert(); return; }
    try {
      const res = await api.removeMedia(draftId, ref, item.key);
      setTweets((prev) => prev.map((tw, i) =>
        i === tweetIndex ? { ...tw, id: tw.id ?? res.tweetId, media: res.media.length ? res.media : undefined } : tw));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Unknown id server-side → adopt authoritative ids + media for this tweet, surface soft error (F6).
        const healed = await rehydrateTweetFromServer(draftId, tweetIndex);
        if (healed) {
          setTweets((prev) => prev.map((tw, i) =>
            i === tweetIndex ? { ...tw, id: tw.id ?? healed.id, media: healed.media?.length ? healed.media : undefined } : tw));
        } else {
          revert();
        }
        setErrorMsg(messageOf(err));
      } else {
        setErrorMsg(messageOf(err));
        revert();
      }
    }
  }, [draftId, tweets, resolveTweetId, rehydrateTweetFromServer]);

  /** Toggle one platform on one media item's per-item targeting via the retarget endpoint. */
  const toggleMediaTarget = useCallback(async (tweetIndex: number, mediaIndex: number, platform: MediaPlatform, next: boolean) => {
    const item = tweets[tweetIndex]?.media?.[mediaIndex];
    if (!item) return;
    const prevTargets = item.targets;
    const newTargets = withTarget(prevTargets, platform, next);
    // Optimistic flip.
    setTweets((prev) => prev.map((tw, i) =>
      i === tweetIndex
        ? { ...tw, media: (tw.media ?? []).map((m, mi) => (mi === mediaIndex ? { ...m, targets: newTargets } : m)) }
        : tw));
    const revert = () => setTweets((prev) => prev.map((tw, i) =>
      i === tweetIndex
        ? { ...tw, media: (tw.media ?? []).map((m, mi) => (mi === mediaIndex ? { ...m, targets: prevTargets } : m)) }
        : tw));
    // Highlighting a platform also makes it a draft destination, so the highlighted media publishes.
    // This stays a SEPARATE, draft-level call (the retarget endpoint only owns per-item targeting).
    // (Only for a saved draft — pre-save the media's own targeting persists with the compose POST.)
    if (draftId && next && !targets[platform]) targetsMutation.mutate({ ...targets, [platform]: true });
    if (!draftId) return; // pre-save: local-only targeting
    const ref = await resolveTweetId(draftId, tweetIndex);
    if (!ref) { revert(); return; }
    const retarget = async (tweetRef: string) => {
      const res = await api.retargetMedia(draftId, tweetRef, item.key, newTargets);
      setTweets((prev) => prev.map((tw, i) =>
        i === tweetIndex ? { ...tw, id: tw.id ?? res.tweetId, media: res.media } : tw));
    };
    try {
      await retarget(ref);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        const healed = await rehydrateTweetFromServer(draftId, tweetIndex);
        if (healed?.id && healed.id !== ref) {
          try { await retarget(healed.id); return; } catch (e2) { setErrorMsg(messageOf(e2)); }
        } else { setErrorMsg(messageOf(err)); }
      } else {
        setErrorMsg(messageOf(err));
      }
      revert();
    }
  }, [draftId, tweets, targets, targetsMutation, resolveTweetId, rehydrateTweetFromServer]);

  // ---- Per-slot AI image generation ----
  const { generate: generateImageForSlot } = useGenerateImage();
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [imageGenError, setImageGenError] = useState<{ index: number; message: string } | null>(null);

  /** Ensure a saved draft exists so the per-tweet image endpoint has an id to target. */
  const ensureDraftForImage = useCallback(async (): Promise<string | null> => {
    if (draftId) return draftId;
    // Commit/repost compose has no content until the main Generate runs — require it first.
    if (commitSource || repostSource) {
      setImageGenError({ index: -1, message: t('composer.generateDraftFirst') });
      return null;
    }
    // Handwrite: save to obtain a draft id, then generate against it.
    try {
      const content = buildContent();
      const res = await api.post<{ success: boolean; draftId: string }>('/api/v1/compose', {
        tweets: content.tweets.map((tw) => ({ text: tw.text, media: tw.media })),
        options: { aiRefine: aiOn, instruction: instruction.trim() || undefined, langOverride: effectiveLangOverride },
      });
      setDraftId(res.draftId);
      navigate(`/draft/${res.draftId}`, { replace: true });
      return res.draftId;
    } catch (err) {
      setImageGenError({ index: -1, message: messageOf(err) });
      return null;
    }
  }, [draftId, commitSource, repostSource, buildContent, aiOn, instruction, effectiveLangOverride, navigate, t]);

  /**
   * Recover from a possibly-lost image-generation response: re-read the draft and, if the server's
   * media for this tweet has more items than the local buffer (the append landed but the response
   * was lost), merge the authoritative media in. Returns true iff media was recovered.
   */
  const healTweetMediaFromServer = useCallback(async (id: string, index: number): Promise<boolean> => {
    try {
      const fresh = await api.get<DraftDetail>(`/api/v1/drafts/${id}`);
      const content = fresh.content as DraftContent | undefined;
      const serverTweets = content?.tweets ?? [];
      const localTweet = tweetsRef.current[index];
      const match = (localTweet?.id ? serverTweets.find((st) => st.id === localTweet.id) : undefined)
        ?? serverTweets[index];
      const serverMedia = match?.media ?? [];
      const localMedia = localTweet?.media ?? [];
      if (serverMedia.length > localMedia.length) {
        setTweets((prev) => prev.map((tw, i) =>
          i === index ? { ...tw, id: tw.id ?? match?.id, media: serverMedia } : tw));
        return true;
      }
    } catch {
      // Re-read failed — fall through to reporting the original generation error.
    }
    return false;
  }, []);

  const generateImageForTweet = useCallback(async (index: number) => {
    // UI-level serialization: the Generate buttons are disabled while `generatingIndex` is set
    // (anyGenerating), so a second generation can't be triggered from the same render. Overlapping
    // generations are now structurally safe anyway — each is an atomic server-side append keyed by
    // tweet id, and the text auto-save no longer carries media, so nothing can clobber the append.
    if (generatingIndex !== null) return;
    setImageGenError(null);
    setGeneratingIndex(index);
    try {
      const id = await ensureDraftForImage();
      if (!id) return;
      // Ensure the tweet exists server-side (mint+adopt its id) BEFORE addressing the image endpoint
      // by ref — a locally-created, not-yet-persisted tweet has no id and would resolve out-of-range
      // server-side → 404 → the generated image is lost (F7/F8).
      const ref = await resolveTweetId(id, index);
      if (!ref) {
        setImageGenError({ index, message: t('composer.generateImageFailed') });
        return;
      }
      haptics.impact('medium');
      const result = await generateImageForSlot(id, ref);
      if (result) {
        const { media } = result;
        haptics.notification('success');
        // The server already appended the media to the draft (atomically) and synced the bot.
        // Merge into local state ONLY (no content re-persist) — the response carries the single
        // newly-appended item. Adopt the server's RESOLVED stable `tweetId` (NOT the request `ref`,
        // which may be a numeric-index string) so a subsequent text save addresses this tweet by its
        // real id and the server carries its (just-generated) media — otherwise an id-less / wrong-id
        // save could reconcile-replace the tweet and drop the image. Guard against a double-merge.
        setTweets((prev) => prev.map((tw, i) => {
          if (i !== index) return tw;
          const existing = tw.media ?? [];
          if (existing.some((mm) => mm.key === media.key)) return { ...tw, id: tw.id ?? result.tweetId };
          return { ...tw, id: tw.id ?? result.tweetId, media: [...existing, { key: media.key, type: media.type }] };
        }));
      } else {
        // The call reported failure — but the response may simply have been LOST after the server
        // atomically appended the image. Re-read the draft and merge its authoritative media for
        // this tweet; if media actually grew, the append self-heals and we treat it as success.
        const healed = await healTweetMediaFromServer(id, index);
        if (healed) {
          haptics.notification('success');
        } else {
          haptics.notification('error');
          setImageGenError({ index, message: t('composer.generateImageFailed') });
        }
      }
    } finally {
      setGeneratingIndex(null);
    }
  }, [generatingIndex, ensureDraftForImage, resolveTweetId, generateImageForSlot, healTweetMediaFromServer, t]);

  // ============================================================
  // Top-action handlers
  // ============================================================

  const onDelete = useCallback(async () => {
    const ok = await confirmDestructive(t('editor.confirmDelete'), t('composer.delete'));
    if (ok) deleteMutation.mutate();
  }, [t, deleteMutation]);

  // Schedule picker (calendar: month grid → day hour-ruler). Opening it is just a state toggle;
  // the picker emits a wall-clock "YYYY-MM-DDTHH:mm" string in the user's tz.
  const [scheduling, setScheduling] = useState(false);

  // AI refine dialog (instruction + "generate new image" toggle). Opening it is a state toggle;
  // the dialog emits { instruction, newImage } on submit.
  const [refining, setRefining] = useState(false);

  const onSchedule = useCallback(() => {
    haptics.selectionChanged();
    setScheduling((s) => !s);
  }, []);

  const onScheduleConfirm = useCallback((value: string) => {
    // The sheet yields a wall-clock with no timezone; the bot interprets it in the user's
    // configured `users.timezone` and converts to UTC server-side. Do NOT convert here.
    scheduleMutation.mutate(value);
    setScheduling(false);
  }, [scheduleMutation]);

  const onUnschedule = useCallback(async () => {
    const ok = await confirm(t('composer.unschedule') + '?');
    if (ok) unscheduleMutation.mutate();
  }, [t, unscheduleMutation]);

  const onRefine = useCallback(() => {
    haptics.selectionChanged();
    setRefining(true);
  }, []);

  // ============================================================
  // Commit source ([+ commit])
  // ============================================================

  const [resolvingCommit, setResolvingCommit] = useState(false);

  /**
   * Resolve a (partial) SHA via GET /api/v1/commits/resolve. On 200 attach a resolved commit
   * source and show its summary inline; on 404 surface an actionable error and create no draft.
   */
  const resolveCommit = useCallback(async (sha: string) => {
    setResolvingCommit(true);
    setErrorMsg(null);
    try {
      const r = await api.get<ResolvedCommit>(
        `/api/v1/commits/resolve?sha=${encodeURIComponent(sha)}`,
      );
      setCommitSource({
        sha: r.sha,
        repo: r.repo,
        title: r.title,
        summary: r.summary,
        resolved: true,
      });
      haptics.notification('success');
    } catch (err) {
      // 404 → not found: clear any unresolved seed/source, let the user retry, no draft created.
      setCommitSource(null);
      const msg = err instanceof ApiError && err.status === 404
        ? t('composer.commitNotFound')
        : messageOf(err);
      setErrorMsg(msg);
      await notifyError(msg);
    } finally {
      setResolvingCommit(false);
    }
  }, [t]);

  // Auto-resolve a commit SEED on mount so its summary card renders without a manual step.
  const resolvedSeedSha = useRef<string | null>(null);
  useEffect(() => {
    if (seed?.kind !== 'commit') return;
    if (resolvedSeedSha.current === seed.sha) return;
    resolvedSeedSha.current = seed.sha;
    void resolveCommit(seed.sha);
  }, [seed, resolveCommit]);

  const onAddCommit = useCallback(async () => {
    const sha = await promptText(t('generate.commitShaPlaceholder'));
    if (!sha) return;
    const trimmed = sha.trim();
    if (!/^[0-9a-f]{7,40}$/i.test(trimmed)) {
      await notifyError(t('generate.invalidSha'));
      return;
    }
    haptics.impact('light');
    await resolveCommit(trimmed);
  }, [t, resolveCommit]);

  // ============================================================
  // Toggles
  // ============================================================

  // Image generation is no longer a compose toggle — it is a per-slot Generate action
  // on each image placeholder (see TweetCard / useGenerateImage).
  const toggleAi = () => { setAiOn((v) => !v); haptics.selectionChanged(); };
  const toggleLang = () => {
    setLangOverride((cur) => (cur ? null : (lang === 'he' ? 'en' : 'he')));
    haptics.selectionChanged();
  };
  const langChipLabel = (langOverride ?? lang).toUpperCase();

  // ============================================================
  // SecondaryButton — "+ Add tweet", rendered beside the MainButton (Save/Generate/…).
  // On clients without SecondaryButton support we fall back to an inline add button.
  // ============================================================
  const secondarySupported = SecondaryButton.isSupported();
  useSecondaryButton(
    lifecycle.canEdit && secondarySupported
      ? { text: t('composer.addTweetBtn'), onClick: addThreadTweet, position: 'left' }
      : null,
  );

  // ============================================================
  // Render
  // ============================================================

  if (draftId && draftQuery.isLoading) {
    return <PageLoading />;
  }
  if (draftId && draftQuery.isError) {
    return (
      <div className={styles.screen}>
        <div className={styles.inlineError}>{messageOf(draftQuery.error)}</div>
      </div>
    );
  }

  // Media always renders as a full-width preview (both while composing and in the viewer).
  const showFullMedia: boolean = true;

  return (
    <div className={styles.screen}>
      {/* ---- Banners ---- */}
      {lifecycle.mode === 'scheduled' && draft?.scheduled_at && (
        <div className={styles.banner} data-tone="scheduled">
          <CalendarClock size={16} />
          <span>{t('composer.scheduledBanner', { when: formatWhen(draft.scheduled_at, tz, t) })}</span>
          <span className={styles.bannerSpacer} />
          <button
            type="button"
            className={styles.bannerAction}
            onClick={() => void onUnschedule()}
            disabled={unscheduleMutation.isPending}
          >
            {t('composer.unschedule')}
          </button>
        </div>
      )}
      {lifecycle.mode === 'publishing' && (
        <div className={styles.banner}>
          <Clock size={16} />
          <span>{t('editor.publishing')}</span>
        </div>
      )}
      {lifecycle.mode === 'published' && (
        <div className={styles.banner} data-tone="published">
          <CheckCircle2 size={16} />
          <span>{t('composer.publishedBanner')}</span>
        </div>
      )}

      {/* ---- Top action row (existing editable drafts) ---- */}
      {lifecycle.showActions && (
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.actionBtn}
            data-tone="destructive"
            onClick={() => void onDelete()}
            disabled={deleteMutation.isPending}
            aria-label={t('composer.delete')}
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => void onSchedule()}
            disabled={scheduleMutation.isPending}
            aria-label={t('composer.schedule')}
          >
            <CalendarClock size={18} />
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => void onRefine()}
            disabled={refineMutation.isPending}
            aria-label={t('composer.refine')}
          >
            <Sparkles size={18} />
          </button>
        </div>
      )}

      {/* ---- Commit source summary (pre-generate) ---- */}
      {commitSource && (
        <div className={styles.commitCard}>
          <GitCommitHorizontal size={20} className={styles.commitIcon} />
          <div className={styles.commitBody}>
            <div className={styles.commitTitle}>
              {commitSource.title || t('composer.commitSummary')}
            </div>
            <div className={styles.commitMeta}>
              {resolvingCommit
                ? t('composer.resolvingCommit')
                : [commitSource.repo, commitSource.sha.slice(0, 10)].filter(Boolean).join(' · ')}
            </div>
            {commitSource.summary && (
              <div className={styles.commitSummary} dir="auto">{commitSource.summary}</div>
            )}
          </div>
          <button
            type="button"
            className={styles.commitRemove}
            onClick={() => { setCommitSource(null); haptics.selectionChanged(); }}
            aria-label={t('common.remove')}
          >
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* ---- Repost source summary (pre-generate) ---- */}
      {repostSource && (
        <div className={styles.commitCard}>
          <Repeat2 size={20} className={styles.commitIcon} />
          <div className={styles.commitBody}>
            <div className={styles.commitTitle}>{t('composer.repostSummary')}</div>
            {repostSource.preview && (
              <div className={styles.commitSummary} dir="auto">{repostSource.preview}</div>
            )}
            <a
              className={styles.commitLink}
              href={repostSource.url}
              target="_blank"
              rel="noreferrer"
            >
              {repostSource.url}
            </a>
          </div>
          <button
            type="button"
            className={styles.commitRemove}
            onClick={() => { setRepostSource(null); haptics.selectionChanged(); }}
            aria-label={t('common.remove')}
          >
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* ---- Thread — all tweets stacked in one window (X-style) ---- */}
      {tweets.map((tw, i) => (
        <TweetCard
          key={i}
          tweet={tw}
          index={i}
          total={tweets.length}
          canEdit={lifecycle.canEdit}
          showFullMedia={showFullMedia}
          placeholder={i === 0 ? t('composer.tweetPlaceholder') : t('composer.addToThread')}
          removeLabel={t('editor.removeTweet')}
          onText={updateTweetText}
          onRemove={removeTweet}
          onMove={moveTweet}
          onAddMedia={addMedia}
          onRemoveMedia={removeMedia}
          mediaPlatforms={connectedMediaPlatforms}
          mediaEnabledTargets={targets}
          onToggleMediaTarget={toggleMediaTarget}
          mediaProgress={progressByMediaKey}
          onGenerateImage={generateImageForTweet}
          generating={generatingIndex === i}
          anyGenerating={generatingIndex !== null}
          generateError={imageGenError?.index === i ? imageGenError.message : null}
        />
      ))}

      {/* ---- Inline add-tweet fallback (only when the SecondaryButton is unsupported) ---- */}
      {lifecycle.canEdit && !secondarySupported && (
        <button type="button" className={styles.addInline} onClick={addThreadTweet}>
          <Plus size={16} /> {t('composer.addToThread')}
        </button>
      )}

      {/* ---- Instruction — the last card after the thread ---- */}
      {lifecycle.canEdit && (
        <InstructionCard
          value={instruction}
          onChange={setInstruction}
          placeholder={t('composer.instructionPlaceholder')}
          label={t('composer.instruction')}
          disabled={!lifecycle.canEdit}
        />
      )}

      {/* ---- Customize row (pre-draft only: [+ commit] · ai · image · language) ---- */}
      {lifecycle.showCustomize && (
        <div className={styles.customize}>
          <button
            type="button"
            className={styles.chip}
            disabled={resolvingCommit}
            onClick={() => void onAddCommit()}
            aria-label={t('composer.addCommit')}
            title={t('composer.addCommit')}
          >
            <GitCommitHorizontal size={18} />
          </button>
          <button
            type="button"
            className={styles.chip}
            data-active={aiOn || undefined}
            aria-pressed={aiOn}
            onClick={toggleAi}
            aria-label={t('composer.toggleAi')}
            title={t('composer.toggleAi')}
          >
            <Sparkles size={18} />
          </button>
          <button
            type="button"
            className={styles.chip}
            data-active={langOverride ? true : undefined}
            onClick={toggleLang}
            aria-label={langChipLabel}
            title={langChipLabel}
          >
            <Languages size={18} />
          </button>
        </div>
      )}

      {/* ---- Platform self-toggle pills (existing drafts) ---- */}
      {lifecycle.showPlatforms && (
        <div className={styles.platforms}>
          <div className={styles.platformsHeader}>{t('composer.platforms')}</div>
          <div className={styles.platformPills}>
            <PlatformTogglePill
              label={t('platform.x')}
              icon={<XLogo size={18} />}
              active={targets.x}
              disabled={!lifecycle.canEdit || targetsMutation.isPending}
              onToggle={(next) => commitTargets({ ...targets, x: next })}
            />
            {hasInstagram && (
              <>
                <PlatformTogglePill
                  label={t('platform.igPost')}
                  icon={<InstagramLogo size={18} />}
                  active={targets.instagram_post}
                  disabled={!lifecycle.canEdit || targetsMutation.isPending}
                  onToggle={(next) => commitTargets({ ...targets, instagram_post: next })}
                />
                <PlatformTogglePill
                  label={t('platform.igStory')}
                  icon={<MonitorPlay size={18} />}
                  active={targets.instagram_story}
                  disabled={!lifecycle.canEdit || targetsMutation.isPending}
                  onToggle={(next) => commitTargets({ ...targets, instagram_story: next })}
                />
                <PlatformTogglePill
                  label={t('platform.igReel')}
                  icon={<Clapperboard size={18} />}
                  active={targets.instagram_reel}
                  disabled={!lifecycle.canEdit || targetsMutation.isPending}
                  onToggle={(next) => commitTargets({ ...targets, instagram_reel: next })}
                />
              </>
            )}
            {hasLinkedIn && (
              <PlatformTogglePill
                label={t('platform.linkedin')}
                icon={<LinkedInLogo size={18} />}
                active={targets.linkedin}
                disabled={!lifecycle.canEdit || targetsMutation.isPending}
                onToggle={(next) => commitTargets({ ...targets, linkedin: next })}
              />
            )}
          </div>
        </div>
      )}

      {/* ---- Published results / links ---- */}
      {lifecycle.showResults && draft && (
        <PublishedResults draft={draft} title={t('editor.publishResults')} />
      )}

      {errorMsg && <div className={styles.inlineError}>{errorMsg}</div>}

      {scheduling && (
        <ScheduleCalendar
          tz={tz}
          busy={scheduleMutation.isPending}
          currentScheduledAt={draft?.scheduled_at ?? null}
          currentDraftId={draftId}
          onConfirm={onScheduleConfirm}
          onCancel={() => setScheduling(false)}
        />
      )}

      {refining && (
        <RefineDialog
          busy={refineMutation.isPending}
          title={t('editor.refineTitle')}
          placeholder={t('editor.refineInstruction')}
          newImageLabel={t('editor.refineNewImage')}
          cancelLabel={t('common.cancel')}
          submitLabel={t('editor.refine')}
          onCancel={() => setRefining(false)}
          onSubmit={(instruction, newImage) => refineMutation.mutate({ instruction, newImage })}
        />
      )}
    </div>
  );

  // ---- inner helper: commit targets with "at least one platform" guard ----
  function commitTargets(next: Targets) {
    const anyOn = next.x || next.instagram_post || next.instagram_story || next.instagram_reel || next.linkedin;
    if (!anyOn) {
      void popup({ message: t('editor.platforms') + ': ' + t('common.error') });
      return;
    }
    targetsMutation.mutate(next);
  }
}

/* ================================================================== *
 * Sub-components (co-located, page-private)
 * ================================================================== */

interface TweetCardProps {
  tweet: Tweet;
  index: number;
  total: number;
  canEdit: boolean;
  showFullMedia: boolean;
  placeholder: string;
  removeLabel: string;
  onText: (index: number, text: string) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onAddMedia: (index: number, m: UploadedMedia) => void;
  onRemoveMedia: (tweetIndex: number, mediaIndex: number) => void;
  /** All connected platforms — every one renders a pill under each media item. */
  mediaPlatforms: MediaPlatform[];
  /** Draft-enabled destinations — a media pill is highlighted only for these. */
  mediaEnabledTargets: Targets;
  onToggleMediaTarget: (tweetIndex: number, mediaIndex: number, platform: MediaPlatform, next: boolean) => void;
  /** Per-media warm progress (media_key → platform → { status }) for the icon rings. */
  mediaProgress?: Record<string, Partial<Record<MediaPlatform, { status: ProgressState }>>>;
  onGenerateImage: (index: number) => void;
  generating: boolean;
  /** True while ANY tweet's image is generating — disables every Generate button (serialized generation). */
  anyGenerating: boolean;
  generateError: string | null;
}

function TweetCard(props: TweetCardProps) {
  const { t } = useTranslation();
  const {
    tweet, index, total, canEdit, showFullMedia, placeholder, removeLabel,
    onText, onRemove, onMove, onAddMedia, onRemoveMedia,
    mediaPlatforms, mediaEnabledTargets, onToggleMediaTarget, mediaProgress,
    onGenerateImage, generating, anyGenerating, generateError,
  } = props;

  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [tweet.text]);

  const dir = getTextDirection(tweet.text);
  const media = tweet.media ?? [];
  const hasVideo = media.some((m) => m.type === 'video');
  const photoCount = media.filter((m) => m.type === 'photo').length;
  const canAddMore = canEdit && !hasVideo && photoCount < MAX_IMAGES;
  const accept = media.length === 0 ? 'both' : 'image';

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardLabel}>{t('editor.tweetN', { n: String(index + 1) })}</span>
        {canEdit && total > 1 && (
          <button type="button" className={styles.removeTweet} onClick={() => onRemove(index)}>
            <Trash2 size={14} /> {removeLabel}
          </button>
        )}
      </div>

      <textarea
        ref={ref}
        className={styles.textarea}
        value={tweet.text}
        dir={dir}
        rows={1}
        readOnly={!canEdit}
        placeholder={placeholder}
        onChange={(e) => onText(index, e.target.value)}
      />

      <div className={styles.cardFooter}>
        {canEdit && total > 1 ? (
          <div className={styles.reorder}>
            <button
              type="button"
              className={styles.reorderBtn}
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
              aria-label="up"
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              className={styles.reorderBtn}
              disabled={index === total - 1}
              onClick={() => onMove(index, 1)}
              aria-label="down"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        ) : <span />}
        <CharCounter count={tweet.text.length} limit={X_LIMIT} />
      </div>

      {/* Media — full-size in existing-draft/viewer; compact grid while composing. */}
      {showFullMedia && media.length > 0 ? (
        <div className={styles.mediaFull} data-count={Math.min(media.length, 4)}>
          {media.map((m, mi) => (
            <div key={m.key} className={styles.mediaItem}>
              {m.type === 'video' ? (
                <video className={styles.mediaVideo} src={`${MEDIA_BASE}/media/${m.key}`} controls playsInline preload="metadata" />
              ) : (
                <img className={styles.mediaImg} src={`${MEDIA_BASE}/media/${m.key}`} alt="" />
              )}
              {canEdit && (
                <button
                  type="button"
                  className={styles.mediaRemove}
                  onClick={() => onRemoveMedia(index, mi)}
                  aria-label={t('common.remove')}
                >
                  <XIcon size={16} />
                </button>
              )}
              {canEdit && (
                <MediaTargetRow
                  media={m}
                  platforms={mediaPlatforms}
                  enabled={mediaEnabledTargets}
                  onToggle={(platform, next) => onToggleMediaTarget(index, mi, platform, next)}
                  progress={flattenMediaProgress(mediaProgress?.[m.key])}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        media.length > 0 && (
          <div className={styles.mediaArea}>
            <MediaGrid
              media={media}
              maxImages={MAX_IMAGES}
              disabled={!canEdit}
              baseMediaUrl={MEDIA_BASE}
              onAdd={(m) => onAddMedia(index, m)}
              onRemove={(mi) => onRemoveMedia(index, mi)}
            />
          </div>
        )
      )}

      {/* Add affordance — always offered while editable and under the exclusivity limit.
          Upload OR generate an AI image into this slot; video generation is a stub for now. */}
      {canAddMore && (
        <div className={styles.mediaArea}>
          <ImageDropZone onUpload={(m) => onAddMedia(index, m)} accept={accept} />
          <div style={{ display: 'flex', gap: '8px', marginTop: 'var(--sp-xs)', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onGenerateImage(index)}
              disabled={anyGenerating}
              style={genButtonStyle(anyGenerating)}
            >
              {generating ? <Spinner size="s" /> : <><Sparkles size={16} /> {t('composer.generateImage')}</>}
            </button>
            {accept === 'both' && (
              <button
                type="button"
                disabled
                title={t('composer.generateVideoSoon')}
                style={genButtonStyle(false, true)}
              >
                <Clapperboard size={16} /> {t('composer.generateVideoSoon')}
              </button>
            )}
          </div>
          {generateError && (
            <div style={{ color: 'var(--destructive)', fontSize: 'var(--text-sm)', marginTop: 'var(--sp-xs)' }}>
              {generateError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline style for the per-slot Generate buttons (mirrors the dashed add-zone affordances). */
function genButtonStyle(busy: boolean, stub = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: 'var(--sp-xs) var(--sp-sm)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 'var(--text-sm)',
    cursor: busy || stub ? 'default' : 'pointer',
    opacity: stub ? 0.4 : busy ? 0.6 : 1,
  };
}

interface InstructionCardProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  disabled: boolean;
}

function InstructionCard({ value, onChange, placeholder, label, disabled }: InstructionCardProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  const dir = getTextDirection(value);
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardLabel}>{label}</span>
      </div>
      <textarea
        ref={ref}
        className={styles.textarea}
        value={value}
        dir={dir}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface RefineDialogProps {
  busy: boolean;
  title: string;
  placeholder: string;
  newImageLabel: string;
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (instruction: string, newImage: boolean) => void;
}

/**
 * AI-refine bottom sheet: a free-text instruction plus a "generate new image" toggle (default OFF).
 * Mirrors the ScheduleCalendar overlay pattern. Emits { instruction, newImage } on submit; the parent
 * owns the mutation + close-on-success. Refine is disabled until a non-empty instruction is entered.
 */
function RefineDialog({
  busy, title, placeholder, newImageLabel, cancelLabel, submitLabel, onCancel, onSubmit,
}: RefineDialogProps) {
  const [instruction, setInstruction] = useState('');
  const [newImage, setNewImage] = useState(false);
  const dir = getTextDirection(instruction);
  const canSubmit = instruction.trim().length > 0 && !busy;

  return (
    <div className={styles.refineBackdrop} onClick={busy ? undefined : onCancel}>
      <div className={styles.refineSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.refineTitle}>{title}</div>
        <textarea
          className={styles.refineTextarea}
          value={instruction}
          dir={dir}
          rows={3}
          autoFocus
          disabled={busy}
          placeholder={placeholder}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <label className={styles.refineToggleRow}>
          <span>{newImageLabel}</span>
          <Toggle checked={newImage} onChange={setNewImage} disabled={busy} />
        </label>
        <div className={styles.refineActions}>
          <button
            type="button"
            className={styles.refineCancel}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.refineSubmit}
            onClick={() => onSubmit(instruction.trim(), newImage)}
            disabled={!canSubmit}
          >
            {busy ? <Spinner /> : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PublishedResultsProps {
  draft: Draft;
  title: string;
}

function PublishedResults({ draft, title }: PublishedResultsProps) {
  const results = draft.publish_results || {};
  const links: Array<{ label: string; url: string }> = [];
  if (results.x?.url) links.push({ label: 'X', url: results.x.url });
  if (results.instagram_post?.url) links.push({ label: 'Instagram Post', url: results.instagram_post.url });
  if (results.instagram_reel?.url) links.push({ label: 'Instagram Reel', url: results.instagram_reel.url });
  // LinkedIn result lives on the wire even though the webapp type omits it.
  const li = (results as { linkedin?: { url?: string } }).linkedin;
  if (li?.url) links.push({ label: 'LinkedIn', url: li.url });

  const errors = results.errors ?? {};
  const errorEntries = Object.entries(errors);

  if (!links.length && !errorEntries.length) return null;

  return (
    <div className={styles.results}>
      <div className={styles.resultsHeader}>{title}</div>
      {links.length > 0 && (
        <div className={styles.resultLinks}>
          {links.map((l) => (
            <a key={l.label} className={styles.resultLink} href={l.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> {l.label}
            </a>
          ))}
        </div>
      )}
      {errorEntries.map(([platform, msg]) => (
        <div key={platform} className={styles.resultError}>
          <AlertTriangle size={14} /> {platform}: {msg}
        </div>
      ))}
    </div>
  );
}

/* ================================================================== *
 * Pure helpers
 * ================================================================== */

function hasAnyText(tweets: Tweet[]): boolean {
  return tweets.some((tw) => tw.text.trim().length > 0 || !!(tw.media && tw.media.length > 0));
}

/**
 * Which buffer tweets are emitted by a content save (mirrors buildLatestContent's filter). The first
 * tweet is always kept. A non-first tweet is kept when it has a stable `id` (it may hold server media,
 * so dropping it would reconcile-DELETE that media — F1), non-empty text, or local media. ONLY an
 * id-less, empty, media-less non-first tweet is droppable — it has no server identity and thus no
 * server media to lose.
 */
function keepTweetForSave(tw: Tweet, i: number): boolean {
  return i === 0 || !!tw.id || tw.text.trim().length > 0 || !!(tw.media && tw.media.length > 0);
}

/**
 * Adopt server-assigned stable ids into the local buffer BY POSITION, without disturbing text, caret,
 * or media. `serverTweets` are the reconciled tweets returned by a content save (1:1-by-position with
 * the savable buffer tweets we sent) or a draft GET. We map them onto the buffer's savable tweets in
 * order and fill in any MISSING id; an existing id is never overwritten. If the savable count does not
 * match the server count (the buffer changed since the save was built), we bail and return `prev`
 * unchanged — a subsequent save reconciles. Returns `prev` (same ref) when nothing changed, so React
 * skips the re-render and the caret is untouched.
 */
function adoptTweetIdsByPosition(prev: Tweet[], serverTweets: Array<{ id?: string }>): Tweet[] {
  const savable: number[] = [];
  prev.forEach((tw, i) => { if (keepTweetForSave(tw, i)) savable.push(i); });
  if (savable.length !== serverTweets.length) return prev;
  let changed = false;
  const next = prev.slice();
  savable.forEach((bufIdx, k) => {
    const id = serverTweets[k]?.id;
    if (id && !next[bufIdx].id) { next[bufIdx] = { ...next[bufIdx], id }; changed = true; }
  });
  return changed ? next : prev;
}

/**
 * Flatten one media item's warm progress (platform → { status }) into the platform → state map the
 * MediaTargetRow ring expects. Returns undefined when there is nothing to show, so pills render ringless.
 */
function flattenMediaProgress(
  byPlatform: Partial<Record<MediaPlatform, { status: ProgressState }>> | undefined,
): Partial<Record<MediaPlatform, ProgressState>> | undefined {
  if (!byPlatform) return undefined;
  const out: Partial<Record<MediaPlatform, ProgressState>> = {};
  for (const [platform, entry] of Object.entries(byPlatform)) {
    if (entry) out[platform as MediaPlatform] = entry.status;
  }
  return out;
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/**
 * Format a scheduled-at UTC ISO string into a short "today/tomorrow + time" label in the
 * user's configured timezone (`tz`), so it agrees with the bot's scheduled-time display.
 */
function formatWhen(iso: string, tz: string, t: (k: string, p?: Record<string, string>) => string): string {
  const d = parseUTC(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const delta = dayDeltaInTz(iso, tz);
  const time = formatTimeInTz(iso, tz);
  if (delta === 0) return `${t('time.today')} ${time}`;
  if (delta === 1) return `${t('time.tomorrow')} ${time}`;
  return `${formatDateInTz(iso, tz)} ${time}`;
}

/**
 * Native text prompt. Telegram has no native text-input popup, so we degrade to window.prompt
 * (works in the in-app browser and in dev). Returns null when cancelled.
 */
function promptText(message: string): Promise<string | null> {
  return Promise.resolve(window.prompt(message));
}
