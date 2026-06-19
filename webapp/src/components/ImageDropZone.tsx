import { useState, useRef, type DragEvent } from 'react';
import { ImagePlus, Video, Clapperboard } from 'lucide-react';
import { useMediaUpload, type UploadedMedia } from '../hooks/useMediaUpload';
import { validateVideoForX } from '../lib/validateVideo';
import { useTranslation } from '../i18n';
import { Spinner } from './shared/Spinner';

/** What kind of media this drop zone offers to add. */
export type MediaAccept = 'image' | 'video' | 'both';

const ACCEPT_ATTR: Record<MediaAccept, string> = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  video: 'video/mp4',
  both: 'image/jpeg,image/png,image/gif,image/webp,video/mp4',
};

const VIDEO_TYPE = 'video/mp4';

interface Props {
  onUpload: (media: UploadedMedia) => void;
  disabled?: boolean;
  accept?: MediaAccept;
}

export function ImageDropZone({ onUpload, disabled, accept = 'both' }: Props) {
  const { t } = useTranslation();
  const { upload, uploading, error, setError, clearError } = useMediaUpload();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    clearError();
    const file = files[0];

    // For videos, check X (Twitter) tweet-video spec BEFORE uploading — X rejects
    // out-of-spec media at publish time. fps can't be detected in the browser, so the
    // message still spells out the full spec so users convert high-fps recordings too.
    if (file.type === VIDEO_TYPE) {
      const check = await validateVideoForX(file);
      if (!check.ok) {
        if (check.reason === 'duration') {
          setError(t('editor.videoTooLong', { seconds: String(Math.round(check.durationSec ?? 0)) }));
        } else if (check.reason === 'unreadable') {
          setError(t('editor.videoUnreadable'));
        } else {
          setError(t('editor.videoOutOfSpec', {
            width: String(check.width ?? '?'),
            height: String(check.height ?? '?'),
          }));
        }
        return;
      }
    }

    const result = await upload(file);
    if (result) onUpload(result);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  const Icon = accept === 'video' ? Video : accept === 'both' ? Clapperboard : ImagePlus;
  const label = accept === 'video' ? t('editor.addVideo') : accept === 'both' ? t('editor.addMedia') : t('editor.addImage');

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onClick={() => !disabled && !uploading && inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? 'var(--btn)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--sp-md)',
        textAlign: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'border-color 0.15s',
        background: dragOver ? 'color-mix(in srgb, var(--btn) 5%, transparent)' : 'transparent',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR[accept]}
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
      {uploading ? (
        <Spinner size="s" />
      ) : (
        <span style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Icon size={16} /> {label}
        </span>
      )}
      {error && (
        <div style={{ color: 'var(--destructive)', fontSize: 'var(--text-sm)', marginTop: 'var(--sp-xs)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
