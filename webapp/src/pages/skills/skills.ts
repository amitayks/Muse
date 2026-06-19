/**
 * Skill metadata + prompt API client, co-located with SkillsPage.
 *
 * Mirrors the bot's standalone prompt editors (routes/app.ts user editor +
 * routes/app-admin.ts admin editor) so the in-app editor is at parity:
 *   - the user-editable skill set (matches ai/prompts USER_EDITABLE_SKILLS minus identity gets
 *     its own friendly label) and the full admin skill set,
 *   - labels/descriptions copied from the admin editor's <select> options,
 *   - the prompt API surface (`/api/prompt`, `/api/admin/prompt`, acknowledge, push).
 *
 * Labels live here (not in shared i18n) because they name backend skill slugs that are
 * not part of the localized UI surface; the editor's UI chrome strings come from t('skills.*').
 */

import { api } from '../../api/client';

export type SkillType =
  | 'work-progress'
  | 'refine'
  | 'quote'
  | 'video'
  | 'know-my-project'
  | 'persona'
  | 'what-i-like'
  | 'who-am-i'
  | 'identity'
  | 'image-gen'
  | 'voice-protocol'
  | 'thumbnail';

export type SkillLang = 'en' | 'he';

export interface SkillMeta {
  type: SkillType;
  /** Short label shown as the cell title (e.g. "/work-progress" or "My Identity"). */
  label: string;
  /** One-line description shown as the cell subtitle. */
  description: string;
}

/**
 * User-editable skills — mirrors the bot user editor tabs (routes/app.ts):
 * /work-progress, /refine, /quote, My Identity, /thumbnail.
 */
export const USER_SKILLS: SkillMeta[] = [
  { type: 'work-progress', label: '/work-progress', description: 'Tweet generation from commits' },
  { type: 'refine', label: '/refine', description: 'Refine existing tweets' },
  { type: 'quote', label: '/quote', description: 'Quote tweet responses' },
  { type: 'identity', label: 'My Identity', description: 'Who you are, your style & personality' },
  { type: 'thumbnail', label: '/thumbnail', description: 'Video thumbnail generation' },
];

/**
 * All skills (admin global editor) — mirrors routes/app-admin.ts <select> options.
 */
export const ADMIN_SKILLS: SkillMeta[] = [
  { type: 'work-progress', label: '/work-progress', description: 'Tweet generation from commits' },
  { type: 'refine', label: '/refine', description: 'Refine existing tweets' },
  { type: 'quote', label: '/quote', description: 'Quote tweet responses' },
  { type: 'video', label: '/video', description: 'AI avatar script writing' },
  { type: 'know-my-project', label: '/know-my-project', description: 'Repo analysis & summary' },
  { type: 'persona', label: '/persona', description: 'Twitter account research' },
  { type: 'what-i-like', label: '/what-i-like', description: 'Tweet relevance scoring' },
  { type: 'who-am-i', label: '/who-am-i', description: 'Identity analysis skill' },
  { type: 'identity', label: '/identity', description: 'Default identity skeleton' },
  { type: 'image-gen', label: '/image-gen', description: 'Visual direction module' },
  { type: 'voice-protocol', label: '/voice-protocol', description: 'How to wield identity (anti-mimicry)' },
  { type: 'thumbnail', label: '/thumbnail', description: 'Video thumbnail generation' },
];

export interface PromptStatus {
  content: string;
  isCustom: boolean;
  isStale: boolean;
  defaultVersion: number;
}

// ==================== USER PROMPT API (/api/prompt) ====================

/** GET /api/prompt?type=&lang= — resolved prompt + custom/stale status. */
export function fetchUserPrompt(type: SkillType, lang: SkillLang) {
  return api.get<PromptStatus>(`/api/prompt?type=${encodeURIComponent(type)}&lang=${lang}`);
}

/** GET /api/prompt?type=&lang=&default=true — the resolved default text only. */
export function fetchUserDefault(type: SkillType, lang: SkillLang) {
  return api.get<{ content: string }>(
    `/api/prompt?type=${encodeURIComponent(type)}&lang=${lang}&default=true`,
  );
}

/** POST /api/prompt — save the user's custom prompt for this language. */
export function saveUserPrompt(type: SkillType, lang: SkillLang, content: string) {
  return api.post<{ success: true }>('/api/prompt', { type, lang, content });
}

/** DELETE /api/prompt?type=&lang= — reset to resolved default; returns default content. */
export function resetUserPrompt(type: SkillType, lang: SkillLang) {
  return api.delete<{ success: true; content: string }>(
    `/api/prompt?type=${encodeURIComponent(type)}&lang=${lang}`,
  );
}

/** POST /api/prompt/acknowledge — record the current default version as accepted (Keep Mine). */
export function acknowledgePrompt(type: SkillType, lang: SkillLang) {
  return api.post<{ success: true }>('/api/prompt/acknowledge', { type, lang });
}

// ==================== ADMIN PROMPT API (/api/admin/prompt) ====================

/** GET /api/admin/prompt?type=&lang= — resolved default prompt for any skill. */
export function fetchAdminPrompt(type: SkillType, lang: SkillLang) {
  return api.get<PromptStatus>(`/api/admin/prompt?type=${encodeURIComponent(type)}&lang=${lang}`);
}

/** POST /api/admin/prompt — save the admin's personal copy (does not affect users). */
export function saveAdminPrompt(type: SkillType, lang: SkillLang, content: string) {
  return api.post<{ success: true }>('/api/admin/prompt', { type, lang, content });
}

/** POST /api/admin/prompt/push — publish as the new default for all non-customized users. */
export function pushAdminPrompt(type: SkillType, lang: SkillLang, content: string) {
  return api.post<{ success: true; newVersion: number }>('/api/admin/prompt/push', {
    type,
    lang,
    content,
  });
}
