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
import type { Draft, DraftContent, Tweet, TweetMedia } from '../types/draft';
import type { UploadedMedia } from '../hooks/useMediaUpload';
import { useGenerateImage } from '../hooks/useGenerateImage';
import { getTextDirection } from '../lib/textDirection';
import { withTarget, type MediaPlatform } from '../lib/mediaTargets';
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
import { PageLoading, CharCounter, PlatformTogglePill, XLogo, InstagramLogo, LinkedInLogo, MediaGrid, ImageDropZone, Spinner } from '../components/shared';
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
    onError: (err) => setErrorMsg(messageOf(err)),
    // Intentionally NO refetch: the local tweet buffer is the source of truth while editing, and
    // the backend persists + syncs the bot message on its own. Refetching here would re-hydrate
    // mid-edit and jump the caret.
  });

  /** Debounced content persistence while editing an existing, editable draft. */
  // Synchronous "a per-tweet image generation is in flight" guard. A ref (not state) so it can't
  // lag a render: it serializes generation (see generateImageForTweet) AND tells the debounced
  // save to stand down while the server is appending media out-of-band.
  const generatingRef = useRef(false);
  // Always persist the LATEST tweet buffer at fire time, never a snapshot captured when the timer
  // was armed. This is what stops a save armed before an image finished generating from writing
  // stale content that drops the freshly-appended media.
  const tweetsRef = useRef(tweets);
  useEffect(() => { tweetsRef.current = tweets; }, [tweets]);
  // Keep the latest mutation reachable from the one stable saver instance below.
  const saveContentMutationRef = useRef(saveContentMutation);
  useEffect(() => { saveContentMutationRef.current = saveContentMutation; });

  /** Build DraftContent from the latest tweet buffer (drops empty trailing tweets). */
  const buildLatestContent = useCallback((): DraftContent => {
    const finalTweets: Tweet[] = tweetsRef.current
      .filter((tw, i) => i === 0 || tw.text.trim().length > 0 || (tw.media && tw.media.length > 0))
      .map((tw, i) => ({ text: tw.text, index: i, media: tw.media }));
    return {
      format: finalTweets.length === 1 ? 'single' : 'thread',
      tweets: finalTweets.length ? finalTweets : [{ text: '', index: 0 }],
    };
  }, []);

  // One stable deferred-save instance. It reads refs lazily, so every fire sees the latest buffer,
  // the latest mutation, and the live generation flag — deferring the PUT while an image generates
  // and then persisting the up-to-date content (including the generated media).
  const deferredSaveRef = useRef<DeferredSave | null>(null);
  if (!deferredSaveRef.current) {
    deferredSaveRef.current = createDeferredSave<DraftContent>({
      isBlocked: () => generatingRef.current,
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
    mutationFn: (refineInstruction: string) =>
      api.post(`/api/v1/drafts/${draftId}/refine`, { instruction: refineInstruction }),
    // Refine replaces the content server-side, so force a one-time re-seed of the editable buffer.
    onSuccess: () => { hydratedFor.current = null; haptics.notification('success'); void refresh(); },
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

  const addMedia = useCallback((index: number, m: UploadedMedia) => {
    setTweets((prev) => {
      const next = prev.map((tw, i) => {
        if (i !== index) return tw;
        const media: TweetMedia[] = [...(tw.media ?? []), { key: m.key, type: m.type }];
        return { ...tw, media };
      });
      persistContentDebounced();
      return next;
    });
  }, [persistContentDebounced]);

  const removeMedia = useCallback((tweetIndex: number, mediaIndex: number) => {
    setTweets((prev) => {
      const next = prev.map((tw, i) => {
        if (i !== tweetIndex) return tw;
        const media = (tw.media ?? []).filter((_, mi) => mi !== mediaIndex);
        return { ...tw, media: media.length ? media : undefined };
      });
      persistContentDebounced();
      return next;
    });
  }, [persistContentDebounced]);

  /** Toggle one platform on one media item's per-item targeting, then persist. */
  const toggleMediaTarget = useCallback((tweetIndex: number, mediaIndex: number, platform: MediaPlatform, next: boolean) => {
    setTweets((prev) => {
      const updated = prev.map((tw, i) => {
        if (i !== tweetIndex) return tw;
        const media = (tw.media ?? []).map((m, mi) =>
          mi === mediaIndex ? { ...m, targets: withTarget(m.targets, platform, next) } : m,
        );
        return { ...tw, media };
      });
      persistContentDebounced();
      return updated;
    });
    // Highlighting a platform also makes it a draft destination, so the highlighted media publishes.
    // (Only for a saved draft — the draft-level targets endpoint needs an id; pre-save, the media's
    // own targeting still persists with the draft content on save.)
    if (draftId && next && !targets[platform]) targetsMutation.mutate({ ...targets, [platform]: true });
  }, [draftId, persistContentDebounced, targets, targetsMutation]);

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

  const generateImageForTweet = useCallback(async (index: number) => {
    // Serialize generation: only one image may generate at a time. The ref guard is synchronous
    // (state lags a render, and the user can click a second tweet's button before re-render), so
    // overlapping requests — which previously raced the draft and dropped media — can't start.
    if (generatingRef.current) return;
    generatingRef.current = true;
    setImageGenError(null);
    try {
      const id = await ensureDraftForImage();
      if (!id) return;
      setGeneratingIndex(index);
      haptics.impact('medium');
      const media = await generateImageForSlot(id, index);
      if (media) {
        haptics.notification('success');
        // The server already appended the media to the draft (atomically) and synced the bot.
        // Update local state ONLY (no re-persist) — re-persisting would PUT the draft again and
        // trigger a second bot-sync photo.
        setTweets((prev) => prev.map((tw, i) =>
          i === index ? { ...tw, media: [...(tw.media ?? []), { key: media.key, type: media.type }] } : tw,
        ));
      } else {
        haptics.notification('error');
        setImageGenError({ index, message: t('composer.generateImageFailed') });
      }
    } finally {
      generatingRef.current = false;
      setGeneratingIndex(null);
    }
  }, [ensureDraftForImage, generateImageForSlot, t]);

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

  const onRefine = useCallback(async () => {
    const text = await promptText(t('editor.refineInstruction'));
    if (text && text.trim()) refineMutation.mutate(text.trim());
  }, [t, refineMutation]);

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
    mediaPlatforms, mediaEnabledTargets, onToggleMediaTarget,
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
