/**
 * X (Twitter) OAuth 2.0 — Authorization Code + PKCE (public client).
 *
 * Replaces the legacy OAuth 1.0a signing for the live path. The webapp drives the
 * connect flow: backend mints a `state` + PKCE `code_verifier`, redirects the user to
 * X's authorize URL, then exchanges the returned `code` for access + refresh tokens at
 * the token endpoint. Because this is a PUBLIC client there is NO client secret — token
 * requests are `application/x-www-form-urlencoded`, carry `client_id` in the body, and
 * send NO Authorization header.
 *
 * Endpoints:
 *   GET  https://x.com/i/oauth2/authorize            (browser redirect)
 *   POST https://api.twitter.com/2/oauth2/token      (code exchange + refresh)
 *
 * `offline.access` is required to receive a refresh token. X rotates the refresh token
 * on every refresh, so callers MUST persist the new refresh token each time.
 */

import type { Env } from '../types';

export const X_OAUTH_SCOPES = 'tweet.read tweet.write users.read media.write offline.access';
export const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
export const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';

/**
 * Thrown when the token endpoint definitively rejects the refresh token (the token is
 * dead and unrecoverable — e.g. HTTP 400 `invalid_grant` / "token was invalid").
 * Distinct from the generic Error thrown for transient failures (network/5xx/429), so
 * callers can clear credentials only on a genuine dead-token signal.
 */
export class XRefreshInvalidError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'XRefreshInvalidError';
    }
}

export interface XTokenSet {
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
}

interface XTokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
}

/**
 * Base64url-encode raw bytes (RFC 4648 §5, no padding).
 */
function base64url(bytes: Uint8Array): string {
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Generate a PKCE pair: a random high-entropy verifier and its
 * `code_challenge = BASE64URL(SHA-256(verifier))` (S256 method).
 */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
    // 32 random bytes → 43-char base64url verifier (within the 43–128 spec range).
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64url(new Uint8Array(digest));
    return { verifier, challenge };
}

/**
 * Build the X authorize URL the webapp redirects the user to.
 */
export function buildAuthorizeUrl(env: Env, state: string, challenge: string): string {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: env.X_OAUTH2_CLIENT_ID ?? '',
        redirect_uri: env.X_OAUTH2_REDIRECT_URI ?? '',
        scope: X_OAUTH_SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    });
    return `${X_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization `code` (+ PKCE verifier) for an access + refresh token.
 */
export async function exchangeCode(env: Env, code: string, codeVerifier: string): Promise<XTokenSet> {
    return requestToken(env, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.X_OAUTH2_REDIRECT_URI ?? '',
        client_id: env.X_OAUTH2_CLIENT_ID ?? '',
        code_verifier: codeVerifier,
    });
}

/**
 * Refresh an access token. X rotates the refresh token — the returned `refreshToken`
 * MUST be persisted or the next refresh fails.
 */
export async function refreshAccessToken(env: Env, refreshToken: string): Promise<XTokenSet> {
    return requestToken(env, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: env.X_OAUTH2_CLIENT_ID ?? '',
    });
}

/**
 * POST to the token endpoint as a public client (form-encoded, client_id in body,
 * no Authorization header, no client secret). Parses the token set or throws.
 */
async function requestToken(env: Env, fields: Record<string, string>): Promise<XTokenSet> {
    const res = await fetch(X_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
    });

    const body = await res.json().catch(() => ({})) as XTokenResponse;

    if (!res.ok || !body.access_token || !body.refresh_token) {
        const message = body.error_description || body.error || `X token request failed (HTTP ${res.status})`;
        // Definitive dead-token signal: a 4xx whose body indicates an invalid token.
        // Everything else (network, 5xx, 429) stays a generic Error → treated as transient.
        const isInvalidToken =
            res.status >= 400 && res.status < 500 &&
            (body.error === 'invalid_grant' || body.error === 'invalid_request' ||
                /token was invalid/i.test(body.error_description || ''));
        if (isInvalidToken) {
            throw new XRefreshInvalidError(message);
        }
        throw new Error(message);
    }

    return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresInSec: body.expires_in ?? 7200,
    };
}
