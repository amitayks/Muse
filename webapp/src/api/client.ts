/**
 * API client for communicating with the Cloudflare Worker backend.
 *
 * Auth: every request includes `Authorization: tma <initData>` from Telegram WebApp.
 */

import { getInitData } from '../lib/telegram';
import type { CalendarResponse } from '../types/calendar';
import type { TweetMedia, MediaTargets } from '../types/draft';

/**
 * Shared response shape for the dedicated draft-media endpoints (attach / remove / retarget).
 * The server returns the tweet's FULL, authoritative media array plus the resolved tweet identity
 * — the editor sets its local media from this, so a lost response self-heals on the next op.
 */
export interface TweetMediaResponse {
  success: boolean;
  tweetId: string;
  tweetIndex: number;
  media: TweetMedia[];
}

/** Thrown when the server returns 401 (session expired) */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired — please reopen the app from Telegram');
    this.name = 'SessionExpiredError';
  }
}

/** Thrown on API error responses (4xx, 5xx) */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const BASE_URL = import.meta.env.VITE_API_URL || '';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const initData = getInitData();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (initData) {
    headers['Authorization'] = `tma ${initData}`;
  }

  // Only set Content-Type for non-FormData bodies
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch {
    // fetch rejected before any response — network, DNS, or CORS failure
    throw new ApiError(0, `Network error reaching the API (${url}). Check your connection, or the API URL configuration.`);
  }

  if (response.status === 401) {
    let detail = 'Session expired';
    try {
      const body = await response.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch { /* use default */ }
    throw new ApiError(401, detail);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* use default message */ }
    throw new ApiError(response.status, message);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // Guard against non-JSON success responses — e.g. an SPA/HTML fallback served when
  // VITE_API_URL is misconfigured. Surface a clear, actionable error instead of a
  // cryptic "Unexpected token '<'" JSON parse crash.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const snippet = (await response.text()).slice(0, 80).replace(/\s+/g, ' ').trim();
    throw new ApiError(
      response.status,
      `Expected JSON from ${path} but received "${contentType || 'unknown'}" (HTTP ${response.status}). The API URL may be misconfigured. Response began: ${snippet}`,
    );
  }

  try {
    return await response.json() as T;
  } catch {
    throw new ApiError(response.status, `Invalid JSON received from ${path} (HTTP ${response.status}).`);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),

  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, {
      method: 'POST',
      body: formData,
    }),

  // ---- Dedicated draft-media operations (server is authoritative; keyed by tweet id) ----
  // `tweetRef` is the stable tweet `id` (preferred) or a legacy numeric array-index string —
  // the server resolves either. `key` is the R2 key (may contain `/`); it is URL-encoded here.

  /** Attach an already-uploaded media item to a tweet. Returns the tweet's full updated media. */
  attachMedia: (
    draftId: string,
    tweetRef: string,
    body: { key: string; type: 'photo' | 'video'; width?: number; height?: number; targets?: MediaTargets },
  ) =>
    request<TweetMediaResponse>(
      `/api/v1/drafts/${draftId}/tweets/${encodeURIComponent(tweetRef)}/media`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  /** Remove (unlink) one media item from a tweet by its R2 key. R2 object is retained server-side. */
  removeMedia: (draftId: string, tweetRef: string, key: string) =>
    request<TweetMediaResponse>(
      `/api/v1/drafts/${draftId}/tweets/${encodeURIComponent(tweetRef)}/media/${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    ),

  /** Set one media item's per-item platform targeting. Returns the tweet's full updated media. */
  retargetMedia: (draftId: string, tweetRef: string, key: string, targets: MediaTargets) =>
    request<TweetMediaResponse>(
      `/api/v1/drafts/${draftId}/tweets/${encodeURIComponent(tweetRef)}/media/${encodeURIComponent(key)}/targets`,
      { method: 'PUT', body: JSON.stringify({ targets }) },
    ),

  /**
   * Content-calendar feed for the schedule picker: scheduled + published posts within a
   * local-date window (`from`/`to` are YYYY-MM-DD in the user's configured timezone).
   */
  getCalendar: (from: string, to: string) =>
    request<CalendarResponse>(`/api/v1/calendar?from=${from}&to=${to}`),

  /**
   * Start the X (Twitter) OAuth 2.0 connect flow.
   * Returns the X authorize URL the user must be redirected to.
   */
  startXOAuth: () =>
    request<{ authorizeUrl: string }>('/api/v1/x/oauth/start'),

  /**
   * Live X (Twitter) connection-health probe. The backend resolves a usable bearer
   * (refreshing, and clearing a dead token, as needed) and reports the current state.
   */
  getXOAuthStatus: () =>
    request<{ connected: boolean; needsReconnect: boolean }>('/api/v1/x/oauth/status'),

  /**
   * Start the LinkedIn OAuth 2.0 connect flow.
   * Returns the LinkedIn authorize URL the user must be redirected to.
   */
  startLinkedInOAuth: () =>
    request<{ authorizeUrl: string }>('/api/v1/linkedin/oauth/start'),

  /**
   * Live LinkedIn connection-health probe. The backend resolves a usable bearer
   * (refreshing, and clearing a dead token, as needed) and reports the current state.
   */
  getLinkedInOAuthStatus: () =>
    request<{ connected: boolean; needsReconnect: boolean }>('/api/v1/linkedin/oauth/status'),
};
