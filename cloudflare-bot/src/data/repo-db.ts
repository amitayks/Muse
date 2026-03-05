/**
 * Repository & Overview Database Operations
 *
 * CRUD for repos and repo_overviews tables.
 * SECURITY: All data operations require and filter by chat_id for ownership verification.
 */

import type { Env, WatchedRepo, RepoConfig, RepoOverview, OverviewPatch } from '../types';
import { DEFAULT_REPO_CONFIG } from '../types';
import { logInfo } from '../infra/security';

/**
 * Generate a UUID v4
 */
function generateId(): string {
    return crypto.randomUUID();
}

// ==================== REPOS ====================

/**
 * Get all repos for a user
 */
export async function getRepos(env: Env, chatId: string): Promise<WatchedRepo[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM repos WHERE chat_id = ? ORDER BY created_at DESC'
    )
        .bind(chatId)
        .all<WatchedRepo>();
    return result.results || [];
}

/**
 * Get repos that are currently being watched for a user
 */
export async function getWatchingRepos(env: Env, chatId: string): Promise<WatchedRepo[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM repos WHERE chat_id = ? AND is_watching = 1 ORDER BY created_at DESC'
    )
        .bind(chatId)
        .all<WatchedRepo>();
    return result.results || [];
}

/**
 * Get all watching repos (for GitHub webhook processing)
 * SECURITY: Only use in webhook context to match incoming events
 */
export async function getAllWatchingRepos(env: Env): Promise<WatchedRepo[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM repos WHERE is_watching = 1 ORDER BY created_at DESC'
    ).all<WatchedRepo>();
    return result.results || [];
}

/**
 * Get a repo by ID - verifies ownership
 */
export async function getRepo(env: Env, id: string, chatId: string): Promise<WatchedRepo | null> {
    return env.DB.prepare('SELECT * FROM repos WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .first<WatchedRepo>();
}

/**
 * Get a repo by owner and repo name for a user
 */
export async function getRepoByOwnerRepo(
    env: Env,
    chatId: string,
    owner: string,
    repo: string
): Promise<WatchedRepo | null> {
    return env.DB.prepare('SELECT * FROM repos WHERE chat_id = ? AND owner = ? AND repo = ?')
        .bind(chatId, owner, repo)
        .first<WatchedRepo>();
}

/**
 * Get ALL repos matching owner/repo — returns all rows (multiple users may watch same repo)
 * Used for webhook signature verification (try each row's webhook_secret)
 */
export async function getAllReposByOwnerRepo(
    env: Env,
    owner: string,
    repo: string
): Promise<WatchedRepo[]> {
    const result = await env.DB.prepare('SELECT * FROM repos WHERE owner = ? AND repo = ? AND is_watching = 1')
        .bind(owner, repo)
        .all<WatchedRepo>();
    return result.results || [];
}

/**
 * Create a new repo with ownership
 */
export async function createRepo(
    env: Env,
    chatId: string,
    data: {
        owner: string;
        repo: string;
        webhook_id?: string;
        webhook_secret?: string;
        config?: RepoConfig;
    }
): Promise<string> {
    const id = generateId();
    const config = data.config || DEFAULT_REPO_CONFIG;

    await env.DB.prepare(
        `INSERT INTO repos (id, chat_id, owner, repo, config, webhook_id, webhook_secret)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(id, chatId, data.owner, data.repo, JSON.stringify(config), data.webhook_id || null, data.webhook_secret || null)
        .run();

    return id;
}

/**
 * Update a repo - verifies ownership
 */
export async function updateRepo(
    env: Env,
    id: string,
    chatId: string,
    updates: {
        is_watching?: number;
        config?: RepoConfig;
        webhook_id?: string | null;
        webhook_secret?: string | null;
    }
): Promise<boolean> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.is_watching !== undefined) {
        sets.push('is_watching = ?');
        values.push(updates.is_watching);
    }
    if (updates.config !== undefined) {
        sets.push('config = ?');
        values.push(JSON.stringify(updates.config));
    }
    if (updates.webhook_id !== undefined) {
        sets.push('webhook_id = ?');
        values.push(updates.webhook_id);
    }
    if (updates.webhook_secret !== undefined) {
        sets.push('webhook_secret = ?');
        values.push(updates.webhook_secret);
    }

    if (sets.length === 0) return false;

    sets.push("updated_at = datetime('now')");
    values.push(id, chatId);

    const result = await env.DB.prepare(
        `UPDATE repos SET ${sets.join(', ')} WHERE id = ? AND chat_id = ?`
    )
        .bind(...values)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Delete a repo - verifies ownership
 */
export async function deleteRepo(env: Env, id: string, chatId: string): Promise<boolean> {
    const result = await env.DB.prepare('DELETE FROM repos WHERE id = ? AND chat_id = ?')
        .bind(id, chatId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

/**
 * Parse config from repo record
 */
export function parseRepoConfig(repo: WatchedRepo): RepoConfig {
    try {
        return JSON.parse(repo.config) as RepoConfig;
    } catch {
        return DEFAULT_REPO_CONFIG;
    }
}

// ==================== REPO OVERVIEWS ====================

interface RepoOverviewRow {
    id: string;
    repo_id: string;
    summary: string | null;
    tech_stack: string | null;
    key_features: string | null;
    target_audience: string | null;
    brand_voice: string | null;
    visual_theme: string | null;
    recent_changes: string | null;
    version: number;
    created_at: string;
    updated_at: string;
}

function parseOverviewRow(row: RepoOverviewRow): RepoOverview {
    let keyFeatures: string[] = [];
    let recentChanges: string[] = [];
    try {
        keyFeatures = row.key_features ? JSON.parse(row.key_features) : [];
    } catch { /* empty */ }
    try {
        recentChanges = row.recent_changes ? JSON.parse(row.recent_changes) : [];
    } catch { /* empty */ }

    return {
        id: row.id,
        repo_id: row.repo_id,
        summary: row.summary,
        tech_stack: row.tech_stack,
        key_features: keyFeatures,
        target_audience: row.target_audience,
        brand_voice: row.brand_voice,
        visual_theme: row.visual_theme,
        recent_changes: recentChanges,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

/**
 * Get repo overview by repo ID.
 * When chatId is provided, verifies repo ownership via repos.chat_id before returning.
 */
export async function getRepoOverview(env: Env, repoId: string, chatId?: string): Promise<RepoOverview | null> {
    if (chatId) {
        // Verify the caller owns this repo
        const repo = await env.DB.prepare('SELECT id FROM repos WHERE id = ? AND chat_id = ?')
            .bind(repoId, chatId)
            .first();
        if (!repo) return null;
    }

    const row = await env.DB.prepare('SELECT * FROM repo_overviews WHERE repo_id = ?')
        .bind(repoId)
        .first<RepoOverviewRow>();
    if (!row) return null;
    return parseOverviewRow(row);
}

/**
 * Insert or replace full overview (used by bootstrap /overview command)
 */
export async function upsertRepoOverview(env: Env, repoId: string, overview: Omit<RepoOverview, 'id' | 'repo_id' | 'version' | 'created_at' | 'updated_at'>): Promise<void> {
    const id = generateId();
    await env.DB.prepare(`
        INSERT INTO repo_overviews (id, repo_id, summary, tech_stack, key_features, target_audience, brand_voice, visual_theme, recent_changes, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(repo_id) DO UPDATE SET
            summary = excluded.summary,
            tech_stack = excluded.tech_stack,
            key_features = excluded.key_features,
            target_audience = excluded.target_audience,
            brand_voice = excluded.brand_voice,
            visual_theme = excluded.visual_theme,
            recent_changes = excluded.recent_changes,
            version = 1,
            updated_at = datetime('now')
    `)
        .bind(
            id,
            repoId,
            overview.summary || null,
            overview.tech_stack || null,
            JSON.stringify(overview.key_features || []),
            overview.target_audience || null,
            overview.brand_voice || null,
            overview.visual_theme || null,
            JSON.stringify(overview.recent_changes || []),
        )
        .run();
}

/**
 * Apply field-level patches to an existing overview.
 * Reads current, applies patches, enforces 20-item FIFO on recent_changes, increments version.
 */
export async function applyOverviewPatches(env: Env, repoId: string, patches: OverviewPatch): Promise<void> {
    const current = await getRepoOverview(env, repoId);
    if (!current) {
        logInfo('No overview to patch for repo:', repoId);
        return;
    }

    let changed = false;

    // Scalar fields
    if (patches.summary !== undefined && patches.summary !== null) {
        current.summary = patches.summary;
        changed = true;
    }
    if (patches.tech_stack !== undefined && patches.tech_stack !== null) {
        current.tech_stack = patches.tech_stack;
        changed = true;
    }
    if (patches.target_audience !== undefined && patches.target_audience !== null) {
        current.target_audience = patches.target_audience;
        changed = true;
    }
    if (patches.brand_voice !== undefined && patches.brand_voice !== null) {
        current.brand_voice = patches.brand_voice;
        changed = true;
    }
    if (patches.visual_theme !== undefined && patches.visual_theme !== null) {
        current.visual_theme = patches.visual_theme;
        changed = true;
    }

    // Array fields: key_features
    if (patches.key_features && typeof patches.key_features === 'object') {
        const patch = patches.key_features;
        if (Array.isArray(patch.remove) && patch.remove.length > 0) {
            current.key_features = current.key_features.filter(f => !patch.remove.includes(f));
            changed = true;
        }
        if (Array.isArray(patch.add) && patch.add.length > 0) {
            for (const item of patch.add) {
                if (!current.key_features.includes(item)) {
                    current.key_features.push(item);
                }
            }
            // Cap at 10 items
            if (current.key_features.length > 10) {
                current.key_features = current.key_features.slice(-10);
            }
            changed = true;
        }
    }

    // Array fields: recent_changes (FIFO, max 20)
    if (patches.recent_changes && typeof patches.recent_changes === 'object') {
        const patch = patches.recent_changes;
        if (Array.isArray(patch.remove) && patch.remove.length > 0) {
            current.recent_changes = current.recent_changes.filter(c => !patch.remove.includes(c));
            changed = true;
        }
        if (Array.isArray(patch.add) && patch.add.length > 0) {
            current.recent_changes.push(...patch.add);
            // FIFO: keep last 20
            if (current.recent_changes.length > 20) {
                current.recent_changes = current.recent_changes.slice(-20);
            }
            changed = true;
        }
    }

    if (!changed) return;

    await env.DB.prepare(`
        UPDATE repo_overviews SET
            summary = ?,
            tech_stack = ?,
            key_features = ?,
            target_audience = ?,
            brand_voice = ?,
            visual_theme = ?,
            recent_changes = ?,
            version = version + 1,
            updated_at = datetime('now')
        WHERE repo_id = ?
    `)
        .bind(
            current.summary,
            current.tech_stack,
            JSON.stringify(current.key_features),
            current.target_audience,
            current.brand_voice,
            current.visual_theme,
            JSON.stringify(current.recent_changes),
            repoId,
        )
        .run();
}

/**
 * Update a single field of the overview (for manual editing)
 */
export async function updateOverviewField(
    env: Env,
    repoId: string,
    field: string,
    value: string
): Promise<boolean> {
    const allowedFields = ['summary', 'tech_stack', 'key_features', 'target_audience', 'brand_voice', 'visual_theme'];
    if (!allowedFields.includes(field)) return false;

    const result = await env.DB.prepare(
        `UPDATE repo_overviews SET ${field} = ?, version = version + 1, updated_at = datetime('now') WHERE repo_id = ?`
    )
        .bind(value, repoId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}
