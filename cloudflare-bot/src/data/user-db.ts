/**
 * User Database Service - CRUD operations for users table
 */

import type { Env, User, UserStatus, OnboardingStep, PublishTargets } from '../types';

/**
 * Get a user by chat_id. Returns null if not found.
 */
export async function getUser(env: Env, chatId: string): Promise<User | null> {
    return env.DB.prepare('SELECT * FROM users WHERE chat_id = ?')
        .bind(chatId)
        .first<User>();
}

/**
 * Create a new user row (during onboarding).
 */
export async function createUser(
    env: Env,
    chatId: string,
    username: string | null,
    displayName: string | null,
    language: string = 'en'
): Promise<void> {
    await env.DB.prepare(`
        INSERT INTO users (chat_id, username, display_name, status, onboarding_step, language)
        VALUES (?, ?, ?, 'onboarding', 'welcome', ?)
    `).bind(chatId, username, displayName, language).run();
}

/**
 * Update arbitrary fields on a user row.
 */
export async function updateUser(
    env: Env,
    chatId: string,
    updates: Partial<Pick<User,
        'username' | 'display_name' | 'status' | 'onboarding_step' | 'onboarding_message_id' |
        'gemini_key_enc' | 'x_api_key_enc' | 'x_api_secret_enc' |
        'x_access_token_enc' | 'x_access_secret_enc' |
        'github_token_enc' | 'heygen_api_key_enc' |
        'instagram_token_enc' | 'instagram_account_id_enc' |
        'has_gemini' | 'has_x' | 'has_github' | 'has_heygen' | 'has_instagram' |
        'language' | 'default_publish_targets' |
        'own_profile_image_url' | 'own_username_x' | 'own_display_name_x' |
        'daily_generates' | 'daily_reposts' | 'last_reset_date' | 'consecutive_failures'
    >>
): Promise<void> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(updates)) {
        sets.push(`${key} = ?`);
        values.push(value as string | number | null);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = datetime('now')");
    values.push(chatId);

    await env.DB.prepare(
        `UPDATE users SET ${sets.join(', ')} WHERE chat_id = ?`
    ).bind(...values).run();
}

/**
 * Get total user count (for max users cap check).
 */
export async function getUserCount(env: Env): Promise<number> {
    const result = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
    return result?.count ?? 0;
}

/**
 * Store an encrypted key for a specific field.
 */
export async function storeEncryptedKey(
    env: Env,
    chatId: string,
    keyField: string,
    encryptedValue: string
): Promise<void> {
    const allowedFields = [
        'gemini_key_enc', 'x_api_key_enc', 'x_api_secret_enc',
        'x_access_token_enc', 'x_access_secret_enc',
        'github_token_enc', 'heygen_api_key_enc',
        'instagram_token_enc', 'instagram_account_id_enc'
    ];
    if (!allowedFields.includes(keyField)) {
        throw new Error(`Invalid key field: ${keyField}`);
    }
    await env.DB.prepare(
        `UPDATE users SET ${keyField} = ?, updated_at = datetime('now') WHERE chat_id = ?`
    ).bind(encryptedValue, chatId).run();
}

/**
 * Get all encrypted key fields for a user.
 */
export async function getUserEncryptedKeys(env: Env, chatId: string): Promise<{
    gemini_key_enc: string | null;
    x_api_key_enc: string | null;
    x_api_secret_enc: string | null;
    x_access_token_enc: string | null;
    x_access_secret_enc: string | null;
    github_token_enc: string | null;
    heygen_api_key_enc: string | null;
    instagram_token_enc: string | null;
    instagram_account_id_enc: string | null;
} | null> {
    return env.DB.prepare(`
        SELECT gemini_key_enc, x_api_key_enc, x_api_secret_enc,
               x_access_token_enc, x_access_secret_enc,
               github_token_enc, heygen_api_key_enc,
               instagram_token_enc, instagram_account_id_enc
        FROM users WHERE chat_id = ?
    `).bind(chatId).first();
}

/**
 * Update user's default publish targets.
 */
export async function updateDefaultPublishTargets(
    env: Env,
    chatId: string,
    targets: PublishTargets
): Promise<void> {
    await env.DB.prepare(
        "UPDATE users SET default_publish_targets = ?, updated_at = datetime('now') WHERE chat_id = ?"
    ).bind(JSON.stringify(targets), chatId).run();
}

/**
 * Update user's own X profile data (for tweet card rendering).
 */
export async function updateOwnProfileData(
    env: Env,
    chatId: string,
    data: { profileImageUrl: string; username: string; displayName: string }
): Promise<void> {
    await env.DB.prepare(
        "UPDATE users SET own_profile_image_url = ?, own_username_x = ?, own_display_name_x = ?, updated_at = datetime('now') WHERE chat_id = ?"
    ).bind(data.profileImageUrl, data.username, data.displayName, chatId).run();
}
