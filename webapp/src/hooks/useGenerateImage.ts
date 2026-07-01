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
 * Calls POST /api/v1/drafts/:id/tweets/:tweetId/image — the backend assembles the
 * image-prompt-builder skill + identity + tweet context, sends the JSON prompt
 * to the image model, stores the result, and atomically appends it to that tweet's
 * media. `tweetRef` is the stable tweet `id` (preferred) or a legacy numeric index
 * string — the server resolves either. The response carries the SINGLE newly-appended
 * media item AND the RESOLVED stable `tweetId`, so the caller binds the media to a durable
 * id (never the numeric ref). Returns `{ media, tweetId }`, or null on failure (error is
 * surfaced in state); on a lost response the caller re-reads the draft to recover the append.
 */
export function useGenerateImage() {
  const [state, setState] = useState<GenerateState>({ generating: false, error: null });

  const generate = useCallback(
    async (draftId: string, tweetRef: string | number): Promise<{ media: TweetMedia; tweetId: string } | null> => {
      try {
        setState({ generating: true, error: null });
        const result = await api.post<{ success: boolean; media: TweetMedia; tweetId: string }>(
          `/api/v1/drafts/${draftId}/tweets/${encodeURIComponent(String(tweetRef))}/image`,
        );
        setState({ generating: false, error: null });
        return { media: result.media, tweetId: result.tweetId };
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
