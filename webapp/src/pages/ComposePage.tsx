import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { Toggle, ConfirmDialog, Spinner, useToast } from '../components/ui';
import { MediaGrid } from '../components/MediaGrid';
import { AutoTextarea } from '../components/AutoTextarea';
import { Brain, ImagePlus, Search, FileText } from 'lucide-react';
import type { TweetMedia } from '../types/draft';
import type { UploadedMedia } from '../hooks/useMediaUpload';

interface ComposeTweet {
  text: string;
  media: TweetMedia[];
}

export function ComposePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show: showToast, element: toastEl } = useToast();

  const [tweets, setTweets] = useState<ComposeTweet[]>([{ text: '', media: [] }]);
  const [aiRefine, setAiRefine] = useState(false);
  const [imageGen, setImageGen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const hasContent = tweets.some(tw => tw.text.trim() || tw.media.length > 0);
  const hasImages = tweets.some(tw => tw.media.length > 0);

  const composeMutation = useMutation({
    mutationFn: async () => {
      const result = await api.post<{ success: boolean; draftId: string }>('/api/v1/compose', {
        tweets: tweets.map(tw => ({ text: tw.text, media: tw.media })),
        options: { aiRefine, imageGen: !hasImages && imageGen, instruction: instruction || undefined },
      });
      return result;
    },
    onSuccess: (data) => {
      navigate(`/draft/${data.draftId}`);
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
    },
  });

  function updateTweet(index: number, text: string) {
    setTweets(prev => prev.map((tw, i) => i === index ? { ...tw, text } : tw));
  }

  function addTweet() {
    setTweets(prev => [...prev, { text: '', media: [] }]);
  }

  function removeTweet(index: number) {
    if (tweets.length <= 1) return;
    setTweets(prev => prev.filter((_, i) => i !== index));
  }

  function addMedia(tweetIndex: number, media: UploadedMedia) {
    setTweets(prev => prev.map((tw, i) => {
      if (i !== tweetIndex) return tw;
      return { ...tw, media: [...tw.media, { key: media.key, type: media.type as 'photo' | 'video' }] };
    }));
  }

  function removeMedia(tweetIndex: number, mediaIndex: number) {
    setTweets(prev => prev.map((tw, i) => {
      if (i !== tweetIndex) return tw;
      return { ...tw, media: tw.media.filter((_, mi) => mi !== mediaIndex) };
    }));
  }

  function handleCancel() {
    if (hasContent) {
      setConfirmDiscard(true);
    } else {
      navigate('/');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-lg)' }}>{t('compose.title')}</h1>

      {/* Tweet editors */}
      {tweets.map((tweet, i) => (
        <div key={i} style={{ marginBottom: 'var(--sp-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-xs)' }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              {t('editor.tweetN', { n: String(i + 1) })}
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: tweet.text.length > 280 ? 'var(--destructive)' : 'var(--hint)' }}>
              {tweet.text.length}/280
            </span>
            {tweets.length > 1 && (
              <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '12px', color: 'var(--destructive)' }} onClick={() => removeTweet(i)}>
                {t('editor.removeTweet')}
              </button>
            )}
          </div>
          <AutoTextarea
            className="tweet-input"
            value={tweet.text}
            onChange={e => updateTweet(i, e.target.value)}
            placeholder={i === 0 ? "What's on your mind?" : ''}
          />
          <div style={{ marginTop: 'var(--sp-sm)' }}>
            <MediaGrid
              media={tweet.media}
              onAdd={(m) => addMedia(i, m)}
              onRemove={(mi) => removeMedia(i, mi)}
            />
          </div>
        </div>
      ))}

      <button className="btn btn-outline" onClick={addTweet} style={{ width: '100%', marginBottom: 'var(--sp-lg)' }}>
        {t('editor.addTweet')}
      </button>

      {/* Toggles */}
      <div className="card" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)' }}><Brain size={14} /> {t('compose.aiRefineToggle')}</span>
            <Toggle checked={aiRefine} onChange={setAiRefine} />
          </div>
          {!hasImages ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)' }}><ImagePlus size={14} /> {t('compose.imageGenToggle')}</span>
              <Toggle checked={imageGen} onChange={setImageGen} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)' }}><Search size={14} /> {t('compose.analyzeToggle')}</span>
              <Toggle checked={false} onChange={() => {}} />
            </div>
          )}
        </div>
      </div>

      {/* Instruction */}
      <div style={{ marginBottom: 'var(--sp-lg)' }}>
        <button className="btn btn-ghost" onClick={() => setShowInstruction(!showInstruction)} style={{ fontSize: 'var(--text-sm)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><FileText size={14} /> {t('compose.instruction')}</span>
        </button>
        {showInstruction && (
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder={t('compose.instructionPlaceholder')}
            rows={2}
            style={{
              width: '100%', padding: 'var(--sp-sm)', marginTop: 'var(--sp-sm)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)', color: 'var(--text)',
              fontSize: 'var(--text-sm)', fontFamily: 'var(--font)',
              resize: 'none', outline: 'none',
            }}
          />
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        <button className="btn btn-outline" onClick={handleCancel}>{t('common.cancel')}</button>
        <button
          className="btn btn-success"
          style={{ flex: 1 }}
          onClick={() => composeMutation.mutate()}
          disabled={!hasContent || composeMutation.isPending}
        >
          {composeMutation.isPending ? <Spinner size={14} /> : t('compose.saveAsDraft')}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        message={t('compose.unsavedChanges')}
        confirmText={t('common.yes')}
        onConfirm={() => navigate('/')}
        onCancel={() => setConfirmDiscard(false)}
      />
      {toastEl}
    </div>
  );
}
