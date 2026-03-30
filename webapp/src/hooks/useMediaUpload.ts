import { useState, useCallback } from 'react';
import { api } from '../api/client';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export interface UploadedMedia {
  key: string;
  url: string;
  type: 'photo';
}

interface UploadState {
  uploading: boolean;
  error: string | null;
}

export function useMediaUpload() {
  const [state, setState] = useState<UploadState>({ uploading: false, error: null });

  const validate = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.has(file.type)) {
      return 'Invalid file type. Allowed: jpg, png, gif, webp';
    }
    if (file.size > MAX_SIZE) {
      return 'File too large (max 10MB)';
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
      return { key: result.key, url: result.url, type: 'photo' };
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
