/**
 * X (Twitter) OAuth 2.0 connect flow — Authorization Code + PKCE (public client).
 *
 * Two endpoints:
 *   - GET /api/v1/x/oauth/start (authenticated): mints a CSRF `state` + PKCE pair,
 *     persists the transient state row, and returns the X authorize URL for the webapp
 *     to redirect the user to.
 *   - GET /x/oauth/callback (top-level, must match X_OAUTH2_REDIRECT_URI's path):
 *     validates `state`, exchanges the `code`, stores the tokens, and redirects back to
 *     the webapp with a connected/failure indicator.
 */

import type { Env } from '../types';
import { logError } from '../infra/security';
import { generatePkce, buildAuthorizeUrl, exchangeCode } from '../services/x-oauth';
import { putXOAuthState, takeXOAuthState, updateUser } from '../data/user-db';
import { storeXOAuth2Tokens } from '../data/user-keys';
import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

/**
 * GET /api/v1/x/oauth/start — authenticated.
 *
 * Generates a PKCE pair + random `state`, persists `{state → chatId, codeVerifier}`,
 * and returns `{ authorizeUrl }` for the webapp to redirect to.
 */
export async function handleXOAuthStart(ctx: ApiContext): Promise<Response> {
    const { env, chatId, request } = ctx;
    if (request.method !== 'GET') return errorResponse('Method Not Allowed', 405);

    if (!env.X_OAUTH2_CLIENT_ID || !env.X_OAUTH2_REDIRECT_URI) {
        return errorResponse('X OAuth is not configured', 503);
    }

    const state = crypto.randomUUID();
    const { verifier, challenge } = await generatePkce();
    await putXOAuthState(env, state, chatId, verifier);

    const authorizeUrl = buildAuthorizeUrl(env, state, challenge);
    return jsonResponse({ authorizeUrl });
}

/**
 * GET /x/oauth/callback — top-level (matches the registered redirect URI).
 *
 * Reads `code` + `state` from the query, single-use-validates the state, exchanges the
 * code for tokens, persists them, and redirects back to the webapp with
 * `?x_connected=1` on success or `?x_connected=0` on any failure.
 */
export async function handleXOAuthCallback(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    let connected = false;
    try {
        if (!code || !state) {
            throw new Error('Missing code or state');
        }

        const stored = await takeXOAuthState(env, state);
        if (!stored) {
            throw new Error('Unknown, expired, or already-used state');
        }

        const tokens = await exchangeCode(env, code, stored.codeVerifier);
        await storeXOAuth2Tokens(env, stored.chatId, tokens.accessToken, tokens.refreshToken, tokens.expiresInSec);
        // has_x is the app-wide "X connected" flag; under OAuth 2.0 it means "has a valid token".
        await updateUser(env, stored.chatId, { has_x: 1 });
        connected = true;
    } catch (error) {
        logError('[x-oauth] callback failed:', error instanceof Error ? error.message : String(error));
    }

    return Response.redirect(buildWebappReturnUrl(env, connected), 302);
}

/** Build the webapp return URL with the connected indicator. */
function buildWebappReturnUrl(env: Env, connected: boolean): string {
    const base = env.WEBAPP_URL || '/';
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}x_connected=${connected ? '1' : '0'}`;
}
