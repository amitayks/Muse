import { useState, useCallback } from 'react';
import { api } from '../api/client';

const IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const VIDEO_TYPE = 'video/mp4';

export interface UploadedMedia {
  key: string;
  url: string;
  type: 'photo' | 'video';
}

interface UploadState {
  uploading: boolean;
  error: string | null;
}

export function useMediaUpload() {
  const [state, setState] = useState<UploadState>({ uploading: false, error: null });

  const validate = useCallback((file: File): string | null => {
    const isVideo = file.type === VIDEO_TYPE;
    const isImage = ALLOWED_IMAGE_TYPES.has(file.type);
    if (!isImage && !isVideo) {
      return 'Invalid file type. Allowed: jpg, png, gif, webp, mp4';
    }
    if (isVideo && file.size > VIDEO_MAX_SIZE) {
      return 'Video too large (max 50MB)';
    }
    if (isImage && file.size > IMAGE_MAX_SIZE) {
      return 'Image too large (max 10MB)';
    }
    return null;
  }, []);

  const upload = useCallback(async (file: File): Promise<UploadedMedia | null> => {
    const validationError = validate(file);
    if (validationError) {
      setState({ uploading: false, error: validationError });
      return null;
    }

    setState({ uploading: true, error: null });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const result = await api.upload<{ key: string; url: string }>('/api/v1/media/upload', formData);
      setState({ uploading: false, error: null });
      const type = file.type === VIDEO_TYPE ? 'video' : 'photo';
      return { key: result.key, url: result.url, type };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setState({ uploading: false, error: message });
      return null;
    }
  }, [validate]);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  return {
    upload,
    validate,
    uploading: state.uploading,
    error: state.error,
    clearError,
  };
}
