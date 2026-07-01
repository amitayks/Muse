/** Types mirrored from cloudflare-bot/src/types.ts (webapp subset) */

export type DraftStatus = 'draft' | 'approved' | 'publishing' | 'published' | 'scheduled';
export type DraftFormat = 'single' | 'thread';

/** Per-item platform targeting; absent object / absent key ⇒ targeted (see lib/mediaTargets). */
export interface MediaTargets {
  x?: boolean;
  instagram_post?: boolean;
  instagram_story?: boolean;
  instagram_reel?: boolean;
  linkedin?: boolean;
}

export interface TweetMedia {
  key: string;
  type: 'photo' | 'video';
  width?: number;
  height?: number;
  targets?: MediaTargets;
}

export interface Tweet {
  /**
   * Stable, opaque tweet identity (short uuid) assigned server-side. Media binds to this id,
   * not the array index, so the editor addresses media endpoints by tweet id. Optional for
   * back-compat: legacy drafts lack it and get one assigned lazily on read-for-edit.
   */
  id?: string;
  text: string;
  index: number;
  media?: TweetMedia[];
}

export interface DraftContent {
  format: DraftFormat;
  tweets: Tweet[];
  imagePrompt?: unknown;
}

export interface PublishTargets {
  x: boolean;
  instagram_post: boolean;
  instagram_story: boolean;
  instagram_reel: boolean;
}

export interface PublishResults {
  x?: { tweet_ids: string[]; url: string };
  instagram_post?: { post_id: string; url: string };
  instagram_story?: { post_id: string; url: null };
  instagram_reel?: { post_id: string; url: string };
  errors?: Record<string, string>;
}

export interface Draft {
  id: string;
  chat_id: string;
  pr_number: number;
  pr_title: string;
  commit_sha: string;
  source: 'auto' | 'handwrite' | 'repost' | 'commit';
  status: DraftStatus;
  content: DraftContent;
  image_url: string | null;
  scheduled_at: string | null;
  original_tweet_id: string | null;
  original_tweet_url: string | null;
  publish_targets: PublishTargets;
  publish_results: PublishResults;
  has_video: number;
  created_at: string;
  updated_at: string;
}
