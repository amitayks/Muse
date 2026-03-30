/**
 * /api/v1/settings — User settings CRUD
 */

import { getUser, updateUser } from '../data/user-db';
import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

export async function handleSettingsApi(ctx: ApiContext, path: string): Promise<Response> {
    const { env, chatId, request } = ctx;
    const method = request.method;

    // GET /api/v1/settings
    if (path === '/settings' && method === 'GET') {
        const user = await getUser(env, chatId);
        if (!user) return errorResponse('User not found', 404);

        const { getRepostDefaults, getCommitDefaults, getRepoDefaults } = await import('../data/db');
        const [repostDefaults, commitDefaults, repoDefaults] = await Promise.all([
            getRepostDefaults(env, chatId),
            getCommitDefaults(env, chatId),
            getRepoDefaults(env, chatId),
        ]);

        return jsonResponse({
            language: user.language,
            timezone: user.timezone,
            page_size: user.page_size,
            ai_provider: user.ai_provider,
            default_publish_targets: safeJsonParse(user.default_publish_targets),
            repost_defaults: repostDefaults,
            commit_defaults: commitDefaults,
            repo_defaults: repoDefaults,
            has_gemini: user.has_gemini === 1,
            has_x: user.has_x === 1,
            has_github: user.has_github === 1,
            has_heygen: user.has_heygen === 1,
            has_instagram: user.has_instagram === 1,
            has_claude: user.has_claude === 1,
        });
    }

    // PUT /api/v1/settings
    if (path === '/settings' && method === 'PUT') {
        const body = await request.json() as Record<string, unknown>;

        // Handle sub-defaults (repost, commit, repo)
        if (body.repost_defaults) {
            const { setRepostDefault } = await import('../data/db');
            const rd = body.repost_defaults as Record<string, boolean>;
            if (rd.fastGenerateImage !== undefined) await setRepostDefault(env, chatId, 'fast_generate_image', rd.fastGenerateImage);
            if (rd.analyzeSourceImage !== undefined) await setRepostDefault(env, chatId, 'analyze_source_image', rd.analyzeSourceImage);
        }
        if (body.commit_defaults) {
            const { setCommitDefault } = await import('../data/db');
            const cd = body.commit_defaults as Record<string, boolean>;
            if (cd.commitFastImage !== undefined) await setCommitDefault(env, chatId, 'commit_fast_image', cd.commitFastImage);
            if (cd.commitFastAi !== undefined) await setCommitDefault(env, chatId, 'commit_fast_ai', cd.commitFastAi);
        }
        if (body.repo_defaults) {
            const { setRepoDefault } = await import('../data/db');
            const rrd = body.repo_defaults as Record<string, boolean>;
            if (rrd.autoOverview !== undefined) await setRepoDefault(env, chatId, 'repo_auto_overview', rrd.autoOverview);
            if (rrd.defaultWatchPushes !== undefined) await setRepoDefault(env, chatId, 'repo_default_watch_pushes', rrd.defaultWatchPushes);
        }

        // Handle direct user fields
        const allowedFields = [
            'language', 'timezone', 'page_size', 'ai_provider',
            'default_publish_targets',
        ];

        const updates: Record<string, unknown> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                if (field === 'default_publish_targets') {
                    updates[field] = JSON.stringify(body[field]);
                } else {
                    updates[field] = body[field];
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            await updateUser(env, chatId, updates as any);
        }

        return jsonResponse({ success: true });
    }

    // PUT /api/v1/settings/keys/:service
    const keysMatch = path.match(/^\/settings\/keys\/(\w+)$/);
    if (keysMatch && method === 'PUT') {
        const service = keysMatch[1];
        const body = await request.json() as Record<string, string>;

        const { encrypt } = await import('../infra/crypto');
        const { storeEncryptedKey } = await import('../data/user-db');

        switch (service) {
            case 'gemini': {
                if (!body.key) return errorResponse('key is required', 400);
                await storeEncryptedKey(env, chatId, 'gemini_key_enc', await encrypt(env, body.key));
                await updateUser(env, chatId, { has_gemini: 1 });
                break;
            }
            case 'claude': {
                if (!body.key) return errorResponse('key is required', 400);
                await storeEncryptedKey(env, chatId, 'claude_key_enc', await encrypt(env, body.key));
                await updateUser(env, chatId, { has_claude: 1 });
                break;
            }
            case 'github': {
                if (!body.key) return errorResponse('key is required', 400);
                await storeEncryptedKey(env, chatId, 'github_token_enc', await encrypt(env, body.key));
                await updateUser(env, chatId, { has_github: 1 });
                break;
            }
            case 'x': {
                const { apiKey, apiSecret, accessToken, accessSecret } = body;
                if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
                    return errorResponse('apiKey, apiSecret, accessToken, accessSecret are required', 400);
                }
                await storeEncryptedKey(env, chatId, 'x_api_key_enc', await encrypt(env, apiKey));
                await storeEncryptedKey(env, chatId, 'x_api_secret_enc', await encrypt(env, apiSecret));
                await storeEncryptedKey(env, chatId, 'x_access_token_enc', await encrypt(env, accessToken));
                await storeEncryptedKey(env, chatId, 'x_access_secret_enc', await encrypt(env, accessSecret));
                await updateUser(env, chatId, { has_x: 1 });
                break;
            }
            case 'instagram': {
                if (!body.token || !body.accountId) {
                    return errorResponse('token and accountId are required', 400);
                }
                await storeEncryptedKey(env, chatId, 'instagram_token_enc', await encrypt(env, body.token));
                await storeEncryptedKey(env, chatId, 'instagram_account_id_enc', await encrypt(env, body.accountId));
                await updateUser(env, chatId, { has_instagram: 1 });
                break;
            }
            default:
                return errorResponse(`Unknown service: ${service}`, 400);
        }

        return jsonResponse({ success: true });
    }

    return errorResponse('Not Found', 404);
}

function safeJsonParse(str: string | null | undefined): unknown {
    if (!str) return {};
    try { return JSON.parse(str); } catch { return {}; }
}
