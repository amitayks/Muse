/**
 * /api/v1/accounts/* — Twitter account management
 */

import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

export async function handleAccountsApi(ctx: ApiContext, path: string): Promise<Response> {
    const { env, chatId, request } = ctx;
    const method = request.method;

    // GET /api/v1/accounts
    if (path === '/accounts' && method === 'GET') {
        const { getTwitterAccounts } = await import('../data/db');
        const accounts = await getTwitterAccounts(env, chatId);
        return jsonResponse({ accounts });
    }

    // POST /api/v1/accounts (add new) — validate the handle exists on X BEFORE creating.
    // Reuses the same lookupUserByUsername the bot's add-account flow uses; unlike the
    // bot (which treats lookup as best-effort), the webapp rejects unresolvable handles
    // per the accounts spec, returning an actionable error with no account created.
    if (path === '/accounts' && method === 'POST') {
        const body = await request.json() as { username: string };
        if (!body.username) return errorResponse('username is required', 400);
        const username = body.username.replace(/^@/, '').toLowerCase();

        // Shape-validate the handle before hitting X.
        if (!/^[a-zA-Z0-9_]{1,15}$/.test(username)) {
            return errorResponse(`@${username} is not a valid X username`, 400);
        }

        // X credentials live on the user's hydrated env.
        const { hydrateEnv } = await import('../data/user-keys');
        const userEnv = await hydrateEnv(env, chatId);
        const { lookupUserByUsername } = await import('../integrations/x');

        let user;
        try {
            user = await lookupUserByUsername(userEnv, username);
        } catch (err) {
            const { XReconnectError } = await import('../integrations/x');
            if (err instanceof XReconnectError) {
                return errorResponse('X connection expired — reconnect your X account in Settings', 400);
            }
            console.error('[accounts] X lookup failed:', err);
            return errorResponse('Could not validate username against X — try again later', 502);
        }

        if (!user) {
            return errorResponse(`@${username} could not be found on X`, 404);
        }

        const { createTwitterAccount } = await import('../data/db');
        try {
            const id = await createTwitterAccount(env, chatId, {
                username,
                user_id: user.id,
                display_name: user.name,
                profile_image_url: user.profile_image_url,
            });
            return jsonResponse({ success: true, id });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to add account';
            if (msg.includes('UNIQUE constraint')) {
                return errorResponse(`You are already following @${username}`, 409);
            }
            console.error('[accounts] create failed:', err);
            return errorResponse('Failed to add account', 500);
        }
    }

    // POST /api/v1/accounts/:id/bootstrap — bootstrap/update the AI persona.
    // Reuses the bot's action:tw_bootstrap logic (bootstrapPersona).
    const bootstrapMatch = path.match(/^\/accounts\/([^/]+)\/bootstrap$/);
    if (bootstrapMatch && method === 'POST') {
        return bootstrapAccountPersona(ctx, bootstrapMatch[1]);
    }

    // Extract account ID: /accounts/:id
    const match = path.match(/^\/accounts\/([^/]+)$/);
    if (!match) return errorResponse('Not Found', 404);

    const accountId = match[1];

    // GET /api/v1/accounts/:id
    if (method === 'GET') {
        const { getTwitterAccount, getTwitterAccountOverview } = await import('../data/db');
        const [account, overview] = await Promise.all([
            getTwitterAccount(env, accountId, chatId),
            getTwitterAccountOverview(env, chatId, accountId),
        ]);
        if (!account) return errorResponse('Account not found', 404);
        return jsonResponse({ ...account, overview });
    }

    // PUT /api/v1/accounts/:id
    if (method === 'PUT') {
        const body = await request.json() as Record<string, unknown>;
        const { updateTwitterAccount } = await import('../data/db');
        await updateTwitterAccount(env, accountId, chatId, body as any);
        return jsonResponse({ success: true });
    }

    // DELETE /api/v1/accounts/:id
    if (method === 'DELETE') {
        const { deleteTwitterAccount } = await import('../data/db');
        await deleteTwitterAccount(env, accountId, chatId);
        return jsonResponse({ success: true });
    }

    return errorResponse('Not Found', 404);
}

/**
 * POST /api/v1/accounts/:id/bootstrap — (re)bootstrap the AI persona overview.
 * Reuses the bot's action:tw_bootstrap logic (bootstrapPersona). Returns the
 * persisted persona overview, or 500 with an actionable message on failure.
 */
async function bootstrapAccountPersona(ctx: ApiContext, accountId: string): Promise<Response> {
    const { env, chatId } = ctx;

    const { getTwitterAccount, getTwitterAccountOverview } = await import('../data/db');
    const account = await getTwitterAccount(env, accountId, chatId);
    if (!account) return errorResponse('Account not found', 404);

    // Gemini credentials live on the user's hydrated env.
    const { hydrateEnv } = await import('../data/user-keys');
    const userEnv = await hydrateEnv(env, chatId);

    try {
        const { bootstrapPersona } = await import('../ai/persona-bootstrap');
        const success = await bootstrapPersona(userEnv, accountId, chatId);
        if (!success) {
            return errorResponse('Failed to bootstrap persona — please try again', 500);
        }
        const overview = await getTwitterAccountOverview(env, chatId, accountId);
        return jsonResponse({ success: true, overview });
    } catch (err) {
        console.error('[accounts/bootstrap] failed:', err);
        return errorResponse('Persona bootstrap failed — please try again later', 500);
    }
}
