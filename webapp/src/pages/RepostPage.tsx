import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { Spinner, useToast } from '../components/ui';
import { Heart, Repeat, MessageCircle } from 'lucide-react';

interface TweetPreviewData {
  text: string;
  author: { username: string; name: string; profile_image_url: string | null } | null;
  metrics: { like_count: number; retweet_count: number; reply_count: number } | null;
}

export function RepostPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show: showToast, element: toastEl } = useToast();

  const [url, setUrl] = useState('');
  const [quoteText, setQuoteText] = useState('');
  const [tweetPreview, setTweetPreview] = useState<TweetPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const isValidUrl = /https?:\/\/(x\.com|twitter\.com)\/\w+\/status\/\d+/.test(url.trim());

  // Fetch tweet preview when URL is valid
  useEffect(() => {
    if (!isValidUrl) { setTweetPreview(null); return; }
    const tweetIdMatch = url.match(/\/status\/(\d+)/);
    if (!tweetIdMatch) return;
    setPreviewLoading(true);
    api.post<TweetPreviewData>('/api/v1/tweet/fetch', { tweetId: tweetIdMatch[1] })
      .then(data => setTweetPreview(data))
      .catch(() => setTweetPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [url, isValidUrl]);

  const repostMutation = useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; draftId?: string; duplicate?: boolean; existingDraftId?: string }>('/api/v1/repost', {
        url: url.trim(),
        tweets: quoteText.trim() ? [{ text: quoteText.trim() }] : undefined,
      }),
    onSuccess: (data) => {
      if (data.duplicate && data.existingDraftId) {
        showToast(t('repost.duplicateWarning'), 'info');
        navigate(`/draft/${data.existingDraftId}`);
      } else if (data.draftId) {
        navigate(`/draft/${data.draftId}`);
      }
    },
    onError: (err) => showToast(err instanceof Error ? err.message : t('common.error'), 'error'),
  });

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-lg)' }}>{t('repost.title')}</h1>

      {/* URL input */}
      <div style={{ marginBottom: 'var(--sp-lg)' }}>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={t('repost.urlPlaceholder')}
          style={{
            width: '100%', padding: 'var(--sp-md)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg)', color: 'var(--text)',
            fontSize: 'var(--text-base)', fontFamily: 'var(--font)',
            outline: 'none',
          }}
        />
        {url.trim() && !isValidUrl && (
          <span style={{ color: 'var(--destructive)', fontSize: 'var(--text-sm)' }}>{t('repost.invalidUrl')}</span>
        )}
      </div>

      {/* Tweet preview */}
      {previewLoading && (
        <div style={{ textAlign: 'center', padding: 'var(--sp-lg)' }}><Spinner size={20} /></div>
      )}
      {tweetPreview && (
        <div className="card" style={{ marginBottom: 'var(--sp-lg)', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-sm)' }}>
            {tweetPreview.author?.profile_image_url && (
              <img src={tweetPreview.author.profile_image_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{tweetPreview.author?.name}</div>
              <div style={{ color: 'var(--hint)', fontSize: '12px' }}>@{tweetPreview.author?.username}</div>
            </div>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, marginBottom: 'var(--sp-sm)' }}>{tweetPreview.text}</p>
          {tweetPreview.metrics && (
            <div style={{ fontSize: '12px', color: 'var(--hint)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Heart size={14} /> {tweetPreview.metrics.like_count} · <Repeat size={14} /> {tweetPreview.metrics.retweet_count} · <MessageCircle size={14} /> {tweetPreview.metrics.reply_count}
            </div>
          )}
        </div>
      )}

      {/* Quote tweet compose */}
      {isValidUrl && (
        <div style={{ marginBottom: 'var(--sp-lg)' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--sp-xs)' }}>
            {t('repost.quoteCompose')}
          </label>
          <textarea
            value={quoteText}
            onChange={e => setQuoteText(e.target.value)}
            rows={4}
            style={{
              width: '100%', padding: 'var(--sp-md)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)', color: 'var(--text)',
              fontSize: 'var(--text-base)', fontFamily: 'var(--font)',
              resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ fontSize: 'var(--text-sm)', color: quoteText.length > 280 ? 'var(--destructive)' : 'var(--hint)', textAlign: 'right' }}>
            {quoteText.length}/280
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        className="btn btn-success"
        style={{ width: '100%' }}
        onClick={() => repostMutation.mutate()}
        disabled={!isValidUrl || repostMutation.isPending}
      >
        {repostMutation.isPending ? <Spinner size={14} /> : t('compose.saveAsDraft')}
      </button>

      {toastEl}
    </div>
  );
}
