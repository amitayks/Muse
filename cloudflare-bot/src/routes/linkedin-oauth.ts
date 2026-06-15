/**
 * LinkedIn OAuth 2.0 connect flow — Authorization Code (confidential client).
 *
 * Two endpoints (mirrors routes/x-oauth.ts), differing only in: confidential client
 * (client_secret in the token exchange), no PKCE, and a one-time person-URN fetch on connect.
 *   - GET /api/v1/linkedin/oauth/start (authenticated): mints a CSRF `state`, persists the
 *     transient state row, and returns the LinkedIn authorize URL for the webapp to redirect to.
 *   - GET /linkedin/oauth/callback (top-level, must match LINKEDIN_REDIRECT_URI's path):
 *     validates `state`, exchanges the `code`, resolves the member's person URN, stores the
 *     tokens, and redirects back to the webapp with a connected/failure indicator.
 */

import type { Env } from '../types';
import { logError } from '../infra/security';
import { buildAuthorizeUrl, exchangeCode, fetchPersonUrn } from '../services/linkedin-oauth';
import { putLinkedInOAuthState, takeLinkedInOAuthState, updateUser, getUser } from '../data/user-db';
import { storeLinkedInTokens, getValidLinkedInAccessToken } from '../data/user-keys';
import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

/**
 * GET /api/v1/linkedin/oauth/start — authenticated.
 *
 * Generates a random `state`, persists `{ state → chatId }`, and returns `{ authorizeUrl }`
 * for the webapp to redirect to. No PKCE — LinkedIn is a confidential client.
 */
export async function handleLinkedInOAuthStart(ctx: ApiContext): Promise<Response> {
    const { env, chatId, request } = ctx;
    if (request.method !== 'GET') return errorResponse('Method Not Allowed', 405);

    if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_REDIRECT_URI || !env.LINKEDIN_CLIENT_SECRET) {
        return errorResponse('LinkedIn OAuth is not configured', 503);
    }

    const state = crypto.randomUUID();
    await putLinkedInOAuthState(env, state, chatId);

    const authorizeUrl = buildAuthorizeUrl(env, state);
    return jsonResponse({ authorizeUrl });
}

/**
 * GET /api/v1/linkedin/oauth/status — authenticated.
 *
 * Live connection-health probe: resolves a usable bearer via `getValidLinkedInAccessToken`
 * (which performs a live refresh and, on a confirmed dead token, runs the invalidation path).
 *   - `connected`: a valid bearer could be resolved.
 *   - `needsReconnect`: no bearer, but the user intended to connect LinkedIn (`has_linkedin === 1`).
 */
export async function handleLinkedInOAuthStatus(ctx: ApiContext): Promise<Response> {
    const { env, chatId, request } = ctx;
    if (request.method !== 'GET') return errorResponse('Method Not Allowed', 405);

    const bearer = await getValidLinkedInAccessToken(env, chatId);
    const user = await getUser(env, chatId);
    const hasIntent = user?.has_linkedin === 1;

    const connected = !!bearer;
    const needsReconnect = !bearer && hasIntent;
    return jsonResponse({ connected, needsReconnect });
}

/**
 * GET /linkedin/oauth/callback — top-level (matches the registered redirect URI).
 *
 * Reads `code` + `state`, single-use-validates the state, exchanges the code for tokens,
 * resolves the member's person URN (fails the connect if that fetch fails — a post needs an
 * author URN), persists tokens, marks connected, and redirects back to the webapp with
 * `?linkedin_connected=1` on success or `?linkedin_connected=0` on any failure.
 */
export async function handleLinkedInOAuthCallback(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    let connected = false;
    try {
        if (!code || !state) {
            throw new Error('Missing code or state');
        }

        const stored = await takeLinkedInOAuthState(env, state);
        if (!stored) {
            throw new Error('Unknown, expired, or already-used state');
        }

        const tokens = await exchangeCode(env, code);

        // Resolve the member's person URN once — required as the post author. If this fails we
        // must NOT leave the account "connected" without an author URN.
        const personUrn = await fetchPersonUrn(tokens.accessToken);
        if (!personUrn) {
            throw new Error('Failed to resolve LinkedIn person URN');
        }

        await storeLinkedInTokens(
            env,
            stored.chatId,
            tokens.accessToken,
            tokens.refreshToken,
            tokens.expiresInSec,
            tokens.refreshExpiresInSec
        );
        await updateUser(env, stored.chatId, { has_linkedin: 1, linkedin_person_urn: personUrn });
        connected = true;
    } catch (error) {
        logError('[linkedin-oauth] callback failed:', error instanceof Error ? error.message : String(error));
    }

    return Response.redirect(buildWebappReturnUrl(env, connected), 302);
}

/** Build the webapp return URL with the connected indicator. */
function buildWebappReturnUrl(env: Env, connected: boolean): string {
    const base = env.WEBAPP_URL || '/';
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}linkedin_connected=${connected ? '1' : '0'}`;
}
