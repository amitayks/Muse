import { useState, useRef, type DragEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { useMediaUpload, type UploadedMedia } from '../hooks/useMediaUpload';
import { useTranslation } from '../i18n';
import { Spinner } from './ui';

interface Props {
  onUpload: (media: UploadedMedia) => void;
  disabled?: boolean;
}

export function ImageDropZone({ onUpload, disabled }: Props) {
  const { t } = useTranslation();
  const { upload, uploading, error, clearError } = useMediaUpload();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    clearError();
    const result = await upload(files[0]);
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
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
      {uploading ? (
        <Spinner size={20} />
      ) : (
        <span style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <ImagePlus size={16} /> {t('editor.addImage')}
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
