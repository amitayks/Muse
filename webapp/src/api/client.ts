/**
 * API client for communicating with the Cloudflare Worker backend.
 *
 * Auth: every request includes `Authorization: tma <initData>` from Telegram WebApp.
 */

import { getInitData } from '../lib/telegram';

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

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

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

  return response.json() as Promise<T>;
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
};
