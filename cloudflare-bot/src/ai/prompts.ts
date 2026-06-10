/**
 * Prompt Service — Database-backed system prompt storage
 *
 * Provides prompt resolution with three-level fallback:
 * 1. User custom prompt (if exists)
 * 2. Global default in requested language
 * 3. Global default in English (last resort)
 *
 * Also provides CRUD helpers for Phase 3/4 WebApp integration.
 */

import type { Env } from '../types';
import { getDefaultPromptTexts } from '../skills';

// ==================== TYPES & CONSTANTS ====================

export type PromptType = 'work-progress' | 'refine' | 'quote' | 'video' | 'know-my-project' | 'persona' | 'what-i-like' | 'who-am-i' | 'identity' | 'image-gen' | 'voice-protocol' | 'thumbnail';

/** Prompt types that users can customize (identity = their identity doc, editable in webapp) */
export const USER_EDITABLE_SKILLS: PromptType[] = ['work-progress', 'refine', 'quote', 'identity', 'thumbnail'];

/** All prompt types */
export const ALL_SKILLS: PromptType[] = ['work-progress', 'refine', 'quote', 'video', 'know-my-project', 'persona', 'what-i-like', 'who-am-i', 'identity', 'image-gen', 'voice-protocol', 'thumbnail'];

/** Skills that receive identity injection in assembleSystemInstruction */
export const IDENTITY_ATTACHED_SKILLS: PromptType[] = ['work-progress', 'refine', 'quote', 'video', 'know-my-project', 'what-i-like', 'image-gen'];

/**
 * Skills that generate posts in my own voice and therefore receive the voice protocol —
 * the doctrine for how to USE the injected identity (think from it, don't copy phrases out of it).
 * Welded to the identity injection: the protocol travels wherever identity travels for these skills.
 */
export const VOICE_PROTOCOL_SKILLS: PromptType[] = ['work-progress', 'refine', 'quote', 'video'];

export interface UserPromptStatus {
    isCustom: boolean;
    isStale: boolean;
    basedOnVersion: number;
    currentVersion: number;
}

// ==================== CORE RESOLUTION ====================

/**
 * Resolve the active prompt with three-level fallback:
 * 1. User custom → 2. Default in lang → 3. Default in English
 */
export async function getPrompt(
    env: Env,
    chatId: string,
    type: PromptType,
    lang: string,
): Promise<string> {
    const db = env.DB;

    // 1. Check user custom
    const custom = await db.prepare(
        'SELECT content FROM user_prompts WHERE chat_id = ? AND prompt_type = ? AND language = ?'
    ).bind(chatId, type, lang).first<{ content: string }>();
    if (custom) return custom.content;

    // 2. Fall back to global default in requested language
    const def = await db.prepare(
        'SELECT content FROM default_prompts WHERE prompt_type = ? AND language = ?'
    ).bind(type, lang).first<{ content: string }>();
    if (def) return def.content;

    // 3. Last resort: fall back to English default
    const enDef = await db.prepare(
        'SELECT content FROM default_prompts WHERE prompt_type = ? AND language = ?'
    ).bind(type, 'en').first<{ content: string }>();
    return enDef?.content ?? '';
}

// ==================== SYSTEM INSTRUCTION ASSEMBLY ====================

/**
 * Assemble a complete system instruction for a Gemini call.
 * For identity-attached skills: skill prompt + identity document + optional image-gen.
 * For utility skills (persona): skill prompt only.
 */
export async function assembleSystemInstruction(
    env: Env,
    chatId: string,
    type: PromptType,
    lang: string,
    options?: { attachImageGen?: boolean },
): Promise<string> {
    const skill = await getPrompt(env, chatId, type, lang);
    const parts = [skill];

    // Identity injection for identity-attached skills
    if (IDENTITY_ATTACHED_SKILLS.includes(type)) {
        const identity = await getPrompt(env, chatId, 'identity', lang);
        parts.push(identity);

        // Voice protocol — paired with identity for voice-generating skills.
        // Governs HOW to use the identity (think from it, never copy its phrases out verbatim).
        // Sits right after the identity so its anti-mimicry rules are the freshest thing read.
        if (VOICE_PROTOCOL_SKILLS.includes(type)) {
            const voiceProtocol = await getPrompt(env, chatId, 'voice-protocol', lang);
            if (voiceProtocol) parts.push(voiceProtocol);
        }
    }

    // Optional image-gen attachment
    if (options?.attachImageGen) {
        const imageGen = await getPrompt(env, chatId, 'image-gen', lang);
        parts.push(imageGen);
    }

    return parts.filter(Boolean).join('\n\n');
}

// ==================== USER PROMPT CRUD ====================

/**
 * Save a user's custom prompt (upsert).
 * Sets based_on_version to the current default version.
 */
export async function saveUserPrompt(
    env: Env,
    chatId: string,
    type: PromptType,
    lang: string,
    content: string,
): Promise<void> {
    const version = await getDefaultPromptVersion(env, type, lang);

    await env.DB.prepare(`
        INSERT INTO user_prompts (chat_id, prompt_type, language, content, based_on_version, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT (chat_id, prompt_type, language)
        DO UPDATE SET content = excluded.content, based_on_version = excluded.based_on_version, updated_at = excluded.updated_at
    `).bind(chatId, type, lang, content, version).run();
}

/**
 * Delete a user's custom prompt (reset to default).
 */
export async function deleteUserPrompt(
    env: Env,
    chatId: string,
    type: PromptType,
    lang: string,
): Promise<void> {
    await env.DB.prepare(
        'DELETE FROM user_prompts WHERE chat_id = ? AND prompt_type = ? AND language = ?'
    ).bind(chatId, type, lang).run();
}

// ==================== DEFAULT PROMPT MANAGEMENT ====================

/**
 * Update a default prompt and bump its version.
 */
export async function updateDefaultPrompt(
    env: Env,
    type: PromptType,
    lang: string,
    content: string,
): Promise<void> {
    await env.DB.prepare(`
        UPDATE default_prompts
        SET content = ?, version = version + 1, updated_at = datetime('now')
        WHERE prompt_type = ? AND language = ?
    `).bind(content, type, lang).run();
}

/**
 * Get the current version number for a default prompt.
 */
export async function getDefaultPromptVersion(
    env: Env,
    type: PromptType,
    lang: string,
): Promise<number> {
    const row = await env.DB.prepare(
        'SELECT version FROM default_prompts WHERE prompt_type = ? AND language = ?'
    ).bind(type, lang).first<{ version: number }>();
    return row?.version ?? 1;
}

// ==================== ADMIN PROMPT TYPES ====================

/** Prompt types that admins can edit (all types including identity skeleton and voice protocol) */
export const ADMIN_EDITABLE_SKILLS: PromptType[] = ['work-progress', 'refine', 'quote', 'video', 'know-my-project', 'persona', 'what-i-like', 'who-am-i', 'identity', 'image-gen', 'voice-protocol', 'thumbnail'];

// ==================== STALE PROMPT DETECTION ====================

/**
 * Count how many of a user's custom prompts are stale (based on older default version).
 */
export async function countStalePrompts(env: Env, chatId: string): Promise<number> {
    const row = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM user_prompts up
        INNER JOIN default_prompts dp
            ON up.prompt_type = dp.prompt_type AND up.language = dp.language
        WHERE up.chat_id = ? AND up.based_on_version < dp.version
            AND up.prompt_type != 'identity'
    `).bind(chatId).first<{ count: number }>();
    return row?.count ?? 0;
}

/**
 * Acknowledge a stale prompt — update based_on_version to current default version without changing content.
 */
export async function acknowledgeStalePrompt(
    env: Env,
    chatId: string,
    type: PromptType,
    lang: string,
): Promise<void> {
    const currentVersion = await getDefaultPromptVersion(env, type, lang);
    await env.DB.prepare(`
        UPDATE user_prompts SET based_on_version = ?, updated_at = datetime('now')
        WHERE chat_id = ? AND prompt_type = ? AND language = ?
    `).bind(currentVersion, chatId, type, lang).run();
}

// ==================== ADMIN PUSH ====================

/**
 * Push a prompt as the new global default and bump version.
 * Also saves to the admin's personal user_prompts.
 * Returns the new version number.
 */
export async function pushDefaultPrompt(
    env: Env,
    adminChatId: string,
    type: PromptType,
    lang: string,
    content: string,
): Promise<number> {
    // Batch: update default + save admin's personal copy
    await env.DB.batch([
        env.DB.prepare(`
            UPDATE default_prompts SET content = ?, version = version + 1, updated_at = datetime('now')
            WHERE prompt_type = ? AND language = ?
        `).bind(content, type, lang),
        env.DB.prepare(`
            INSERT INTO user_prompts (chat_id, prompt_type, language, content, based_on_version,  updated_at)
            VALUES (?, ?, ?, ?, (SELECT version FROM default_prompts WHERE prompt_type = ? AND language = ?), datetime('now'))
            ON CONFLICT (chat_id, prompt_type, language)
            DO UPDATE SET content = excluded.content, based_on_version = excluded.based_on_version, updated_at = excluded.updated_at
        `).bind(adminChatId, type, lang, content, type, lang),
    ]);

    return await getDefaultPromptVersion(env, type, lang);
}

/**
 * Get the default prompt text (ignoring user customization).
 */
export async function getDefaultPromptText(
    env: Env,
    type: PromptType,
    lang: string,
): Promise<string> {
    const row = await env.DB.prepare(
        'SELECT content FROM default_prompts WHERE prompt_type = ? AND language = ?'
    ).bind(type, lang).first<{ content: string }>();
    if (row) return row.content;
    // Fall back to English
    const enRow = await env.DB.prepare(
        'SELECT content FROM default_prompts WHERE prompt_type = ? AND language = ?'
    ).bind(type, 'en').first<{ content: string }>();
    return enRow?.content ?? '';
}

// ==================== STATUS CHECK ====================

/**
 * Check if a user has a custom prompt and whether it's stale.
 */
export async function getUserPromptStatus(
    env: Env,
    chatId: string,
    type: PromptType,
    lang: string,
): Promise<UserPromptStatus> {
    const currentVersion = await getDefaultPromptVersion(env, type, lang);

    const userRow = await env.DB.prepare(
        'SELECT based_on_version FROM user_prompts WHERE chat_id = ? AND prompt_type = ? AND language = ?'
    ).bind(chatId, type, lang).first<{ based_on_version: number }>();

    if (!userRow) {
        return { isCustom: false, isStale: false, basedOnVersion: 0, currentVersion };
    }

    return {
        isCustom: true,
        isStale: userRow.based_on_version < currentVersion,
        basedOnVersion: userRow.based_on_version,
        currentVersion,
    };
}

// ==================== SEEDING ====================

/**
 * Seed default prompts into the database.
 * Called from migrate route. Inserts new rows or updates existing ones with fresh content.
 * Preserves version for existing rows (bumps by 1), starts at 1 for new rows.
 */
export async function seedDefaultPrompts(env: Env): Promise<number> {
    const defaults = getDefaultPromptTexts();
    let inserted = 0;

    for (const { type, language, content } of defaults) {
        const result = await env.DB.prepare(`
            INSERT INTO default_prompts (prompt_type, language, content, version, updated_at)
            VALUES (?, ?, ?, 1, datetime('now'))
            ON CONFLICT (prompt_type, language)
            DO UPDATE SET content = excluded.content, version = version + 1, updated_at = datetime('now')
        `).bind(type, language, content).run();
        if (result.meta.changes > 0) inserted++;
    }

    return inserted;
}

