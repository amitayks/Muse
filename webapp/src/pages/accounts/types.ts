/**
 * Account types — mirror the backend `TwitterAccount` / `TwitterAccountConfig` /
 * `TwitterAccountOverview` shapes returned by the `/api/v1/accounts` routes.
 * Co-located with the Accounts screen (not a shared type).
 */

export interface TwitterAccountConfig {
  relevanceThreshold: number; // 1-10
  autoApprove: boolean;
  analyzeMedia: boolean;
}

export interface TwitterAccount {
  id: string;
  chat_id?: string;
  username: string;
  user_id: string | null;
  display_name: string | null;
  is_watching: number; // 0 | 1
  config: string; // JSON string of TwitterAccountConfig
  profile_image_url: string | null;
  created_at?: string;
}

export interface TwitterAccountOverview {
  id: string;
  account_id: string;
  persona: string | null;
  topics: string | null;
  communication_style: string | null;
  notable_context: string | null;
  recent_themes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

/** GET /api/v1/accounts/:id returns the account fields plus the AI persona overview. */
export type AccountDetail = TwitterAccount & {
  overview: TwitterAccountOverview | null;
};

export const DEFAULT_ACCOUNT_CONFIG: TwitterAccountConfig = {
  relevanceThreshold: 6,
  autoApprove: false,
  analyzeMedia: true,
};

/** Mirror of the bot's `parseTwitterAccountConfig` — tolerant of malformed JSON. */
export function parseAccountConfig(account: Pick<TwitterAccount, 'config'>): TwitterAccountConfig {
  try {
    const parsed = JSON.parse(account.config) as Partial<TwitterAccountConfig>;
    return {
      relevanceThreshold:
        typeof parsed.relevanceThreshold === 'number'
          ? parsed.relevanceThreshold
          : DEFAULT_ACCOUNT_CONFIG.relevanceThreshold,
      autoApprove: parsed.autoApprove === true,
      // The bot treats `analyzeMedia !== false` as on (default-on).
      analyzeMedia: parsed.analyzeMedia !== false,
    };
  } catch {
    return { ...DEFAULT_ACCOUNT_CONFIG };
  }
}
