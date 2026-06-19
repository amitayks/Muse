import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * The user's configured timezone offset ('UTC', 'UTC+2', …) from `GET /api/v1/settings`.
 *
 * Shares the `['settings']` query cache with the Settings screen, so this adds no extra
 * request once Settings has loaded. Defaults to 'UTC' until loaded / on error.
 *
 * Scheduling and scheduled-time *display* use this offset (not the device timezone) so the
 * webapp agrees with the bot, which interprets all scheduling in `users.timezone`.
 */
export function useTimezone(): string {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ timezone?: string }>('/api/v1/settings'),
    staleTime: 120_000,
    retry: false,
  });
  return data?.timezone || 'UTC';
}
