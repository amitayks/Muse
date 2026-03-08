/**
 * Persona Cache Database Operations
 *
 * CRUD for persona_cache table.
 */

import type { Env, PersonaCache } from '../types';

/**
 * Generate a UUID v4
 */
function generateId(): string {
    return crypto.randomUUID();
}

// ==================== PERSONA CACHE ====================

/**
 * Get cached persona for a username
 */
export async function getPersonaCache(env: Env, username: string): Promise<PersonaCache | null> {
    return env.DB.prepare('SELECT * FROM persona_cache WHERE username = ?')
        .bind(username.toLowerCase())
        .first<PersonaCache>();
}

/**
 * Upsert persona cache entry
 */
export async function upsertPersonaCache(
    env: Env,
    username: string,
    data: { user_id?: string; display_name?: string; bio?: string; persona?: string; topics?: string; profile_image_url?: string | null }
): Promise<void> {
    const existing = await getPersonaCache(env, username);
    if (existing) {
        const sets: string[] = ["updated_at = datetime('now')"];
        const values: (string | null)[] = [];
        if (data.user_id !== undefined) { sets.push('user_id = ?'); values.push(data.user_id); }
        if (data.display_name !== undefined) { sets.push('display_name = ?'); values.push(data.display_name); }
        if (data.bio !== undefined) { sets.push('bio = ?'); values.push(data.bio); }
        if (data.persona !== undefined) { sets.push('persona = ?'); values.push(data.persona); }
        if (data.topics !== undefined) { sets.push('topics = ?'); values.push(data.topics); }
        if (data.profile_image_url !== undefined) { sets.push('profile_image_url = ?'); values.push(data.profile_image_url); }
        values.push(existing.id);
        await env.DB.prepare(`UPDATE persona_cache SET ${sets.join(', ')} WHERE id = ?`)
            .bind(...values)
            .run();
    } else {
        const id = generateId();
        await env.DB.prepare(
            `INSERT INTO persona_cache (id, username, user_id, display_name, bio, persona, topics, profile_image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
            .bind(id, username.toLowerCase(), data.user_id || null, data.display_name || null, data.bio || null, data.persona || null, data.topics || null, data.profile_image_url || null)
            .run();
    }
}
