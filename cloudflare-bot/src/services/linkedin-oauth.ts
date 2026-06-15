/**
 * LinkedIn OAuth 2.0 — Authorization Code flow (confidential client).
 *
 * Unlike X (a public PKCE client), LinkedIn is a CONFIDENTIAL client: the token endpoint
 * requires the app `client_secret`, and there is NO PKCE `code_verifier`. The webapp drives
 * the connect flow: backend mints a `state`, redirects the user to LinkedIn's authorize URL,
 * then exchanges the returned `code` for access + refresh tokens at the token endpoint.
 *
 * Endpoints:
 *   GET  https://www.linkedin.com/oauth/v2/authorization   (browser redirect)
 *   POST https://www.linkedin.com/oauth/v2/accessToken      (code exchange + refresh)
 *
 * Token lifetimes: access ~60 days, refresh ~1 year. The refresh-token expiry is ABSOLUTE
 * (it does NOT extend on refresh); once past, the user must reconnect. LinkedIn returns a
 * fresh refresh token on each refresh, so callers MUST persist it.
 */

import type { Env } from '../types';

// `openid profile` resolves the member's person URN (OpenID Connect userinfo `sub`);
// `w_member_social` authorizes posting on the member's behalf.
export const LINKEDIN_OAUTH_SCOPES = 'openid profile w_member_social';
export const LINKEDIN_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
export const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

/**
 * Thrown when the token endpoint definitively rejects the refresh token (the token is dead
 * and unrecoverable — e.g. HTTP 400 `invalid_grant`). Distinct from the generic Error thrown
 * for transient failures (network/5xx/429), so callers clear credentials only on a genuine
 * dead-token signal.
 */
export class LinkedInRefreshInvalidError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LinkedInRefreshInvalidError';
    }
}

export interface LinkedInTokenSet {
    accessToken: string;
    refreshToken: string;
    /** Access-token lifetime in seconds (~60 days). */
    expiresInSec: number;
    /** Refresh-token ABSOLUTE remaining lifetime in seconds (~1 year; does not extend on refresh). */
    refreshExpiresInSec: number;
}

interface LinkedInTokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
}

/**
 * Build the LinkedIn authorize URL the webapp redirects the user to.
 */
export function buildAuthorizeUrl(env: Env, state: string): string {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: env.LINKEDIN_CLIENT_ID ?? '',
        redirect_uri: env.LINKEDIN_REDIRECT_URI ?? '',
        scope: LINKEDIN_OAUTH_SCOPES,
        state,
    });
    return `${LINKEDIN_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization `code` for an access + refresh token (confidential client).
 */
export async function exchangeCode(env: Env, code: string): Promise<LinkedInTokenSet> {
    return requestToken(env, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.LINKEDIN_REDIRECT_URI ?? '',
        client_id: env.LINKEDIN_CLIENT_ID ?? '',
        client_secret: env.LINKEDIN_CLIENT_SECRET ?? '',
    });
}

/**
 * Refresh an access token. LinkedIn rotates the refresh token — the returned `refreshToken`
 * MUST be persisted. The refresh-token expiry is absolute and does not extend.
 */
export async function refreshAccessToken(env: Env, refreshToken: string): Promise<LinkedInTokenSet> {
    return requestToken(env, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: env.LINKEDIN_CLIENT_ID ?? '',
        client_secret: env.LINKEDIN_CLIENT_SECRET ?? '',
    });
}

/**
 * POST to the token endpoint as a confidential client (form-encoded, client_id + client_secret
 * in the body). Parses the token set or throws — `LinkedInRefreshInvalidError` on a definitive
 * dead-token 4xx, a generic Error otherwise (treated as transient).
 */
async function requestToken(env: Env, fields: Record<string, string>): Promise<LinkedInTokenSet> {
    const res = await fetch(LINKEDIN_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
    });

    const body = await res.json().catch(() => ({})) as LinkedInTokenResponse;

    if (!res.ok || !body.access_token) {
        const message = body.error_description || body.error || `LinkedIn token request failed (HTTP ${res.status})`;
        // Definitive dead-token signal: a 4xx whose body indicates an invalid grant/token.
        const isInvalidToken =
            res.status >= 400 && res.status < 500 &&
            (body.error === 'invalid_grant' || body.error === 'invalid_request' ||
                /expired|invalid/i.test(body.error_description || ''));
        if (isInvalidToken) {
            throw new LinkedInRefreshInvalidError(message);
        }
        throw new Error(message);
    }

    return {
        accessToken: body.access_token,
        // On the authorization-code exchange LinkedIn always returns a refresh token (for an app
        // with refresh tokens enabled). Fall back to the supplied one on refresh just in case.
        refreshToken: body.refresh_token ?? fields.refresh_token ?? '',
        expiresInSec: body.expires_in ?? 60 * 24 * 60 * 60, // default ~60 days
        refreshExpiresInSec: body.refresh_token_expires_in ?? 365 * 24 * 60 * 60, // default ~1 year
    };
}

/**
 * Resolve the member's person URN once after connect via OpenID Connect userinfo.
 * Returns `urn:li:person:{sub}` or null if the call fails / has no `sub`.
 */
export async function fetchPersonUrn(accessToken: string): Promise<string | null> {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({})) as { sub?: string };
    return body.sub ? `urn:li:person:${body.sub}` : null;
}
