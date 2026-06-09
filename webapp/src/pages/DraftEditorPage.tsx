import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import {
  PageLoading, ErrorBanner, StatusBadge, ConfirmDialog,
  useToast, Spinner,
} from '../components/ui';
import { MediaGrid } from '../components/MediaGrid';
import { AutoTextarea } from '../components/AutoTextarea';
import { getTextDirection } from '../lib/textDirection';
import { X, Brain, Calendar, ExternalLink, Image, Video, XCircle, Trash2, Plus, ChevronUp, ChevronDown, Link as LinkIcon } from 'lucide-react';
import type { DraftContent, Tweet, PublishTargets, PublishResults } from '../types/draft';
import type { UploadedMedia } from '../hooks/useMediaUpload';

interface DraftDetailResponse {
  id: string;
  pr_number: number;
  pr_title: string;
  source: string;
  status: string;
  content: DraftContent;
  image_url: string | null;
  scheduled_at: string | null;
  original_tweet_id: string | null;
  original_tweet_url: string | null;
  publish_targets: PublishTargets;
  publish_results: PublishResults;
  has_video: number;
  user_profile: { display_name: string; username: string; has_instagram: boolean } | null;
}

export function DraftEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast, element: toastEl } = useToast();

  const [editedTweets, setEditedTweets] = useState<Tweet[] | null>(null);
  const [preRefineTweets, setPreRefineTweets] = useState<Tweet[] | null>(null);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [confirmAction, setConfirmAction] = useState<'publish' | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<'refine' | 'schedule' | 'delete' | null>(null);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data: draft, isLoading, error, refetch } = useQuery({
    queryKey: ['draft', id],
    queryFn: () => api.get<DraftDetailResponse>(`/api/v1/drafts/${id}`),
    enabled: !!id,
    // Publish runs in the background; while the draft is 'publishing', poll so the editor
    // reflects the terminal state (published / back to approved) once the pipeline finishes.
    refetchInterval: (query) => query.state.data?.status === 'publishing' ? 3000 : false,
  });

  useEffect(() => {
    if (draft && !editedTweets) {
      setEditedTweets(draft.content.tweets);
    }
  }, [draft, editedTweets]);

  const tweets = editedTweets ?? draft?.content.tweets ?? [];
  const isPublished = draft?.status === 'published';
  const isReadOnly = isPublished;

  // ==================== Save ====================

  const saveMutation = useMutation({
    mutationFn: (content: DraftContent) => api.put(`/api/v1/drafts/${id}`, { content }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ['draft', id] });
    },
  });

  const triggerSave = useCallback((updatedTweets: Tweet[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMutation.mutate({
        format: updatedTweets.length === 1 ? 'single' : 'thread',
        tweets: updatedTweets,
        imagePrompt: draft?.content.imagePrompt,
      });
    }, 1500);
  }, [draft?.content.imagePrompt, saveMutation]);

  function updateTweet(index: number, text: string) {
    const updated = tweets.map((tw, i) => i === index ? { ...tw, text } : tw);
    setEditedTweets(updated);
    triggerSave(updated);
  }

  function addTweet() {
    const updated = [...tweets, { text: '', index: tweets.length, media: [] }];
    setEditedTweets(updated);
  }

  function removeTweet(index: number) {
    if (tweets.length <= 1) return;
    const updated = tweets.filter((_, i) => i !== index).map((tw, i) => ({ ...tw, index: i }));
    setEditedTweets(updated);
    triggerSave(updated);
  }

  function moveTweet(from: number, direction: -1 | 1) {
    const to = from + direction;
    if (to < 0 || to >= tweets.length) return;
    const updated = [...tweets];
    [updated[from], updated[to]] = [updated[to], updated[from]];
    const reindexed = updated.map((tw, i) => ({ ...tw, index: i }));
    setEditedTweets(reindexed);
    triggerSave(reindexed);
  }

  function addMedia(tweetIndex: number, media: UploadedMedia) {
    const updated = tweets.map((tw, i) => {
      if (i !== tweetIndex) return tw;
      const existing = tw.media ?? [];
      return { ...tw, media: [...existing, { key: media.key, type: media.type as 'photo' | 'video' }] };
    });
    setEditedTweets(updated);
    triggerSave(updated);
  }

  function removeMedia(tweetIndex: number, mediaIndex: number) {
    const updated = tweets.map((tw, i) => {
      if (i !== tweetIndex) return tw;
      return { ...tw, media: (tw.media ?? []).filter((_, mi) => mi !== mediaIndex) };
    });
    setEditedTweets(updated);
    triggerSave(updated);
  }

  // ==================== Actions ====================

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/drafts/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft', id] });
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      showToast(t('status.approved'), 'success');
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/drafts/${id}/publish`),
    onSuccess: () => {
      // Publish was kicked off in the background; the draft is now 'publishing'.
      // Polling (refetchInterval) surfaces the final result once it completes.
      queryClient.invalidateQueries({ queryKey: ['draft', id] });
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      showToast(t('editor.publishing'), 'success');
      setConfirmAction(null);
    },
    onError: () => setConfirmAction(null),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/drafts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/drafts');
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (scheduledAt: string) => api.post(`/api/v1/drafts/${id}/schedule`, { scheduled_at: scheduledAt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft', id] });
      showToast(t('status.scheduled'), 'success');
      setExpandedPanel(null);
    },
  });

  const unscheduleMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/drafts/${id}/schedule`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft', id] });
      showToast(t('status.approved'), 'success');
    },
  });

  const refineMutation = useMutation({
    mutationFn: (instruction: string) =>
      api.post<{ success: boolean; content: DraftContent }>(`/api/v1/drafts/${id}/refine`, { instruction }),
    onSuccess: (data) => {
      setPreRefineTweets(tweets);
      setEditedTweets(data.content.tweets);
      setRefineInstruction('');
      showToast('Refined!', 'success');
    },
  });

  const targetsMutation = useMutation({
    mutationFn: (targets: PublishTargets) => api.put(`/api/v1/drafts/${id}/targets`, { publish_targets: targets }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['draft', id] }),
  });

  function togglePlatform(platform: keyof PublishTargets) {
    if (!draft) return;
    const updated = { ...draft.publish_targets, [platform]: !draft.publish_targets[platform] };
    if (!Object.values(updated).some(Boolean)) return;
    targetsMutation.mutate(updated);
  }

  function handleSchedule() {
    if (!scheduleDate || !scheduleTime) return;
    scheduleMutation.mutate(new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString());
  }

  // ==================== Render ====================

  if (isLoading) return <PageLoading />;
  if (error || !draft) return <ErrorBanner message={error instanceof Error ? error.message : t('common.error')} onRetry={() => refetch()} />;

  const hasInstagram = draft.user_profile?.has_instagram ?? false;

  const avatarSize = 36;

  return (
    <div style={{ margin: '0 calc(-1 * var(--sp-lg))' }}>
      {/* Top bar — X-style: close + status + action */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px var(--sp-lg)', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10,
      }}>
        <button className="btn btn-ghost" onClick={() => navigate('/drafts')} style={{ padding: 4 }}>
          <X size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
          {saved && <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Saved</span>}
          {saveMutation.isPending && <Spinner size={14} />}
          <StatusBadge status={draft.status} />
          {!isReadOnly && (draft.status === 'approved' || draft.status === 'scheduled') && (
            <button className="btn btn-primary" onClick={() => setConfirmAction('publish')} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? <Spinner size={14} /> : t('editor.publish')}
            </button>
          )}
          {!isReadOnly && draft.status === 'draft' && (
            <button className="btn btn-primary" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {t('editor.approve')}
            </button>
          )}
        </div>
      </div>

      {/* Repost source link */}
      {draft.source === 'repost' && draft.original_tweet_url && (
        <div style={{ padding: '8px var(--sp-lg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          <LinkIcon size={14} />
          <a href={draft.original_tweet_url} target="_blank" rel="noopener">{t('editor.originalTweet')}</a>
        </div>
      )}

      {/* Thread — X compose style */}
      <div style={{ padding: '0 var(--sp-lg)' }}>
        {tweets.map((tweet, i) => {
          const isLast = i === tweets.length - 1;
          const hasMore = tweets.length > 1;

          return (
            <div key={i} style={{ display: 'flex', gap: 'var(--sp-md)', paddingTop: 'var(--sp-md)', position: 'relative' }}>
              {/* Avatar column with thread line */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: avatarSize, flexShrink: 0 }}>
                <div style={{
                  width: avatarSize, height: avatarSize, borderRadius: '50%',
                  background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 700,
                }}>
                  {i + 1}
                </div>
                {/* Thread connector line */}
                {!isLast && (
                  <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4, marginBottom: -12, minHeight: 20 }} />
                )}
              </div>

              {/* Content column */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 'var(--sp-md)' }}>
                {/* Reorder/remove controls */}
                {hasMore && !isReadOnly && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 4 }}>
                    {i > 0 && (
                      <button className="btn btn-ghost" style={{ padding: 2 }} onClick={() => moveTweet(i, -1)}>
                        <ChevronUp size={14} />
                      </button>
                    )}
                    {!isLast && (
                      <button className="btn btn-ghost" style={{ padding: 2 }} onClick={() => moveTweet(i, 1)}>
                        <ChevronDown size={14} />
                      </button>
                    )}
                    <button className="btn btn-ghost" style={{ padding: 2, color: 'var(--destructive)', marginInlineStart: 'auto' }} onClick={() => removeTweet(i)}>
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Tweet text — borderless, X-style, auto-stretch */}
                <AutoTextarea
                  className="tweet-input"
                  value={tweet.text}
                  onChange={e => updateTweet(i, e.target.value)}
                  readOnly={isReadOnly}
                  placeholder={i === 0 ? "What's happening?" : 'Add another tweet'}
                />

                {/* Media */}
                {(tweet.media?.length || (!isReadOnly)) && (
                  <div style={{ marginTop: 'var(--sp-sm)' }}>
                    <MediaGrid
                      media={tweet.media ?? []}
                      onAdd={(m) => addMedia(i, m)}
                      onRemove={(mi) => removeMedia(i, mi)}
                      disabled={isReadOnly}
                    />
                  </div>
                )}

                {/* Char counter — end-aligned based on text direction */}
                <div style={{
                  fontSize: '12px', marginTop: 4,
                  textAlign: getTextDirection(tweet.text) === 'rtl' ? 'left' : 'right',
                  color: tweet.text.length > 280 ? 'var(--destructive)' : tweet.text.length > 260 ? '#888' : 'var(--text-secondary)',
                }}>
                  {tweet.text.length > 0 && `${tweet.text.length}/280`}
                </div>
              </div>
            </div>
          );
        })}

        {/* Add tweet — blue filled circle, clickable placeholder */}
        {!isReadOnly && (
          <div
            onClick={addTweet}
            style={{ display: 'flex', gap: 'var(--sp-md)', paddingTop: 'var(--sp-sm)', paddingBottom: 'var(--sp-lg)', cursor: 'pointer' }}
          >
            <div style={{ width: avatarSize, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{
                width: avatarSize, height: avatarSize, borderRadius: '50%',
                background: 'var(--btn)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff',
              }}>
                <Plus size={18} />
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              {t('editor.addTweet')}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* Tools section */}
      <div style={{ padding: '0 var(--sp-lg)' }}>

        {/* Platforms — inline toggle buttons */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: 'var(--sp-md) 0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
            <InlineToggle label={t('platform.x')} active={draft.publish_targets.x} onClick={() => togglePlatform('x')} disabled={isReadOnly} />
            {hasInstagram && (
              <>
                <InlineToggle label={t('platform.igPost')} active={draft.publish_targets.instagram_post} onClick={() => togglePlatform('instagram_post')} disabled={isReadOnly} />
                <InlineToggle label={t('platform.igStory')} active={draft.publish_targets.instagram_story} onClick={() => togglePlatform('instagram_story')} disabled={isReadOnly} />
                {draft.has_video === 1 && (
                  <InlineToggle label={t('platform.igReel')} active={draft.publish_targets.instagram_reel} onClick={() => togglePlatform('instagram_reel')} disabled={isReadOnly} />
                )}
              </>
            )}
          </div>
        </div>

        {/* AI Refine + Schedule + Delete — unified action row */}
        {!isReadOnly && draft.status !== 'published' && (
          <div style={{ padding: 'var(--sp-md) 0' }}>
            {/* Already scheduled — show date + cancel */}
            {draft.status === 'scheduled' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-md)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--btn)' }}>
                    <Calendar size={14} /> {draft.scheduled_at && new Date(draft.scheduled_at).toLocaleString()}
                  </span>
                  <button className="btn btn-danger" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={() => unscheduleMutation.mutate()} disabled={unscheduleMutation.isPending}>
                    {t('editor.unschedule')}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                  <button
                    className={`btn ${expandedPanel === 'refine' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setExpandedPanel(expandedPanel === 'refine' ? null : 'refine')}
                  >
                    <Brain size={14} /> {t('editor.aiRefine')}
                  </button>
                  <button
                    className={`btn ${expandedPanel === 'delete' ? 'btn-danger' : 'btn-outline'}`}
                    style={expandedPanel === 'delete' ? { background: 'var(--destructive)', color: '#fff', border: 'none' } : {}}
                    onClick={() => setExpandedPanel(expandedPanel === 'delete' ? null : 'delete')}
                  >
                    <Trash2 size={14} /> {t('common.delete')}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Buttons row — AI Refine, Schedule, Delete */}
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  <button
                    className={`btn ${expandedPanel === 'refine' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setExpandedPanel(expandedPanel === 'refine' ? null : 'refine')}
                  >
                    <Brain size={14} /> {t('editor.aiRefine')}
                  </button>
                  <button
                    className={`btn ${expandedPanel === 'schedule' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setExpandedPanel(expandedPanel === 'schedule' ? null : 'schedule')}
                  >
                    <Calendar size={14} /> {t('editor.schedule')}
                  </button>
                  <button
                    className={`btn ${expandedPanel === 'delete' ? 'btn-danger' : 'btn-outline'}`}
                    style={expandedPanel === 'delete' ? { background: 'var(--destructive)', color: '#fff', border: 'none' } : {}}
                    onClick={() => setExpandedPanel(expandedPanel === 'delete' ? null : 'delete')}
                  >
                    <Trash2 size={14} /> {t('common.delete')}
                  </button>
                </div>
              </>
            )}

            {/* Shared expandable box */}
            {expandedPanel && (
              <div style={{
                marginTop: 'var(--sp-md)', padding: 'var(--sp-md)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              }}>
                {expandedPanel === 'refine' && (
                  <div>
                    <textarea
                      value={refineInstruction}
                      onChange={e => setRefineInstruction(e.target.value)}
                      placeholder={t('editor.refineInstruction')}
                      rows={2}
                    />
                    <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-sm)' }}>
                      <button className="btn btn-primary" onClick={() => refineInstruction && refineMutation.mutate(refineInstruction)} disabled={!refineInstruction || refineMutation.isPending}>
                        {refineMutation.isPending ? <Spinner size={14} /> : t('editor.refine')}
                      </button>
                      {preRefineTweets && (
                        <button className="btn btn-outline" onClick={() => { setEditedTweets(preRefineTweets); setPreRefineTweets(null); triggerSave(preRefineTweets); }}>
                          {t('editor.undo')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {expandedPanel === 'schedule' && (
                  <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ flex: 1, minWidth: 130 }} />
                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
                    <button className="btn btn-primary" onClick={handleSchedule} disabled={!scheduleDate || !scheduleTime || scheduleMutation.isPending}>
                      {scheduleMutation.isPending ? <Spinner size={14} /> : t('editor.schedule')}
                    </button>
                  </div>
                )}
                {expandedPanel === 'delete' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{t('editor.confirmDelete')}</span>
                    <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                      <button className="btn btn-outline" onClick={() => setExpandedPanel(null)}>{t('common.cancel')}</button>
                      <button className="btn" style={{ background: 'var(--destructive)', color: '#fff' }} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                        {deleteMutation.isPending ? <Spinner size={14} /> : t('common.delete')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Publish results */}
        {isPublished && draft.publish_results && (
          <div style={{ padding: 'var(--sp-md) 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-sm)' }}>{t('editor.publishResults')}</div>
            <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
              {draft.publish_results.x?.url && <a href={draft.publish_results.x.url} target="_blank" rel="noopener" className="btn btn-outline"><ExternalLink size={14} /> X</a>}
              {draft.publish_results.instagram_post?.url && <a href={draft.publish_results.instagram_post.url} target="_blank" rel="noopener" className="btn btn-outline"><Image size={14} /> Post</a>}
              {draft.publish_results.instagram_reel?.url && <a href={draft.publish_results.instagram_reel.url} target="_blank" rel="noopener" className="btn btn-outline"><Video size={14} /> Reel</a>}
            </div>
            {draft.publish_results.errors && Object.entries(draft.publish_results.errors).map(([k, v]) => (
              <div key={k} style={{ color: 'var(--destructive)', fontSize: 'var(--text-sm)', marginTop: 'var(--sp-xs)', display: 'flex', alignItems: 'center', gap: '6px' }}><XCircle size={14} /> {k}: {v}</div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog open={confirmAction === 'publish'} message={t('editor.confirmPublish')} confirmText={t('editor.publish')} confirmStyle="success" onConfirm={() => publishMutation.mutate()} onCancel={() => setConfirmAction(null)} />
      {toastEl}
    </div>
  );
}

/** Inline toggle button — blue when active, outline when off */
function InlineToggle({ label, active, onClick, disabled }: { label?: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 14px',
        borderRadius: 'var(--radius-full)',
        border: active ? '1px solid var(--btn)' : '1px solid #333',
        background: active ? 'var(--btn)' : 'transparent',
        color: active ? '#fff' : '#999',
        fontSize: 'var(--text-sm)', fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'var(--font)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}
