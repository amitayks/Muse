import { Play } from 'lucide-react';
import type { TweetMedia } from '../types/draft';
import type { UploadedMedia } from '../hooks/useMediaUpload';
import { ImageDropZone } from './ImageDropZone';
import { useTranslation } from '../i18n';
import styles from './MediaGrid.module.css';

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
    <div className={styles.grid}>
      {media.map((m, i) => (
        <div key={m.key} className={styles.item}>
          {m.type === 'video' ? (
            <>
              <video
                src={`${baseMediaUrl}/media/${m.key}`}
                muted
                playsInline
                preload="metadata"
                className={`${styles.thumb} ${styles.video}`}
              />
              <div className={styles.playOverlay}>
                <Play size={22} fill="currentColor" />
              </div>
            </>
          ) : (
            <img
              src={`${baseMediaUrl}/media/${m.key}`}
              alt=""
              className={styles.thumb}
            />
          )}
          {!disabled && (
            <button onClick={() => onRemove(i)} className={styles.remove} aria-label={t('common.remove')}>
              ×
            </button>
          )}
        </div>
      ))}
      {canAdd && (
        <div className={styles.dropzone}>
          <ImageDropZone onUpload={onAdd} disabled={!canAdd} accept={accept} />
        </div>
      )}
      {atPhotoMax && !disabled && (
        <span className={styles.maxHint}>{t('editor.maxImages')}</span>
      )}
    </div>
  );
}
