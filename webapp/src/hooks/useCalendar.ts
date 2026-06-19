import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { CalendarItem } from '../types/calendar';

/**
 * Posts for a calendar window (`from`/`to` are YYYY-MM-DD local dates in the user's offset),
 * keyed by the window so paging between months caches per-month. Returns scheduled + published
 * items; an empty array until loaded / on error.
 */
export function useCalendar(from: string, to: string): { items: CalendarItem[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.getCalendar(from, to),
    staleTime: 60_000,
  });
  return { items: data?.items ?? [], isLoading };
}
