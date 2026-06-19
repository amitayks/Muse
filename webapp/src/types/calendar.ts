/** Publish targets per platform (mirrors the backend `PublishTargets`). */
export interface CalendarTargets {
  x: boolean;
  instagram_post: boolean;
  instagram_story: boolean;
  instagram_reel: boolean;
  linkedin: boolean;
}

/**
 * One post on the content calendar, from `GET /api/v1/calendar`.
 * `at` is a UTC instant (scheduled_at / published_at); the webapp positions it in the
 * user's configured offset via the `lib/timezone` helpers.
 */
export interface CalendarItem {
  id: string;
  kind: 'scheduled' | 'published';
  at: string;
  title: string;
  firstTweet: string;
  format: string; // 'single' | `thread-${n}`
  targets: CalendarTargets;
  draftId: string;
  /** Permalink — published items only. */
  url?: string;
}

export interface CalendarResponse {
  items: CalendarItem[];
}
