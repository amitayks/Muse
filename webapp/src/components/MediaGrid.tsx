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
  const canAdd = media.length < maxImages && !disabled;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
      {media.map((m, i) => (
        <div key={m.key} style={{ position: 'relative', width: 80, height: 80 }}>
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
          <ImageDropZone onUpload={onAdd} disabled={!canAdd} />
        </div>
      )}
      {media.length >= maxImages && !disabled && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)', alignSelf: 'center' }}>
          {t('editor.maxImages')}
        </span>
      )}
    </div>
  );
}
