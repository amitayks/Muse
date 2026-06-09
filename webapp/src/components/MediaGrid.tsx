import { Play } from 'lucide-react';
import type { TweetMedia } from '../types/draft';
import type { UploadedMedia } from '../hooks/useMediaUpload';
import { ImageDropZone } from './ImageDropZone';
import { useTranslation } from '../i18n';

interface Props {
  media: TweetMedia[];
  maxImages?: number;
  onAdd: (media: UploadedMedia) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  baseMediaUrl?: string;
}

export function MediaGrid({ media, maxImages = 4, onAdd, onRemove, disabled, baseMediaUrl = '' }: Props) {
  const { t } = useTranslation();

  // X/Instagram exclusivity: a tweet has EITHER exactly 1 video OR up to `maxImages` photos.
  const hasVideo = media.some(m => m.type === 'video');
  const photoCount = media.filter(m => m.type === 'photo').length;
  const atPhotoMax = photoCount >= maxImages;
  const canAdd = !disabled && !hasVideo && !atPhotoMax;
  // Empty tweet offers both photo and video; once photos exist, only more photos.
  const accept = media.length === 0 ? 'both' : 'image';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
      {media.map((m, i) => (
        <div key={m.key} style={{ position: 'relative', width: 80, height: 80 }}>
          {m.type === 'video' ? (
            <>
              <video
                src={`${baseMediaUrl}/media/${m.key}`}
                muted
                playsInline
                preload="metadata"
                style={{
                  width: 80, height: 80,
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: '#000',
                }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <Play size={22} fill="#fff" color="#fff" style={{ opacity: 0.9, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
              </div>
            </>
          ) : (
            <img
              src={`${baseMediaUrl}/media/${m.key}`}
              alt=""
              style={{
                width: 80, height: 80,
                objectFit: 'cover',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
              }}
            />
          )}
          {!disabled && (
            <button
              onClick={() => onRemove(i)}
              style={{
                position: 'absolute', top: -6, right: -6,
                width: 20, height: 20,
                borderRadius: '50%',
                background: 'var(--destructive)', color: '#fff',
                border: 'none', cursor: 'pointer',
                fontSize: '12px', lineHeight: '20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {canAdd && (
        <div style={{ width: 80, height: 80 }}>
          <ImageDropZone onUpload={onAdd} disabled={!canAdd} accept={accept} />
        </div>
      )}
      {atPhotoMax && !disabled && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)', alignSelf: 'center' }}>
          {t('editor.maxImages')}
        </span>
      )}
    </div>
  );
}
