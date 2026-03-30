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

    // POST /api/v1/accounts (add new)
    if (path === '/accounts' && method === 'POST') {
        const body = await request.json() as { username: string };
        if (!body.username) return errorResponse('username is required', 400);
        const username = body.username.replace(/^@/, '');

        const { createTwitterAccount } = await import('../data/db');
        const id = await createTwitterAccount(env, chatId, { username });
        return jsonResponse({ success: true, id });
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
