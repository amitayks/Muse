import { useState, useCallback } from 'react';
import { api } from '../api/client';
import type { TweetMedia } from '../types/draft';

interface GenerateState {
  generating: boolean;
  error: string | null;
}

/**
 * Generate an AI image into a specific tweet slot.
 *
 * Calls POST /api/v1/drafts/:id/tweets/:idx/image — the backend assembles the
 * image-prompt-builder skill + identity + tweet context, sends the JSON prompt
 * to the image model, stores the result, and attaches it to that tweet's media.
 * Returns the new media reference, or null on failure (error is surfaced in state).
 */
export function useGenerateImage() {
  const [state, setState] = useState<GenerateState>({ generating: false, error: null });

  const generate = useCallback(
    async (draftId: string, tweetIndex: number): Promise<TweetMedia | null> => {
      try {
        setState({ generating: true, error: null });
        const result = await api.post<{ success: boolean; media: TweetMedia }>(
          `/api/v1/drafts/${draftId}/tweets/${tweetIndex}/image`,
        );
        setState({ generating: false, error: null });
        return result.media;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Image generation failed';
        setState({ generating: false, error: message });
        return null;
      }
    },
    [],
  );

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  return { generate, generating: state.generating, error: state.error, clearError };
}
