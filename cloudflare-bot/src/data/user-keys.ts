/**
 * User Key Resolution - Decrypt per-user keys and hydrate env
 */

import type { Env } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { decrypt, encrypt } from '../infra/crypto';
import { getUserEncryptedKeys, getUser, clearXOAuth2Tokens, tryClaimXRefreshLock, releaseXRefreshLock, clearLinkedInOAuth2Tokens } from './user-db';
import { refreshAccessToken, XRefreshInvalidError } from '../services/x-oauth';
import { refreshAccessToken as refreshLinkedInToken, LinkedInRefreshInvalidError } from '../services/linkedin-oauth';
import { logError } from '../infra/security';

// Refresh the OAuth 2.0 access token when it is at/within this buffer of expiring.
const X_TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // 60 seconds
// LinkedIn access tokens last ~60 days; refresh when at/within this buffer of expiry.
const LINKEDIN_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve a user's decrypted API keys from D1.
 * Returns an object that can be spread over env.
 * NEVER falls back to Worker secrets.
 */
export async function getUserKeys(env: Env, chatId: string): Promise<Partial<Env>> {
    const keys = await getUserEncryptedKeys(env, chatId);
    if (!keys) {
        throw new Error(`User ${chatId} not found`);
    }

    // Explicitly set ALL per-user API fields to prevent fallback to Worker secrets.
    // Fields stay undefined unless the user has an encrypted key stored.
    // NOTE: the legacy X OAuth 1.0a creds (X_API_KEY/SECRET, X_ACCESS_TOKEN/SECRET) are no longer
    // hydrated — all X calls use the OAuth 2.0 bearer (X_OAUTH2_ACCESS_TOKEN, set below). The
    // `x_*_enc` columns remain in the schema but are unused.
    const result: Partial<Env> = {
        GOOGLE_API_KEY: undefined,
        GITHUB_TOKEN: undefined,
        HEYGEN_API_KEY: undefined,
        INSTAGRAM_ACCESS_TOKEN: undefined,
        INSTAGRAM_BUSINESS_ACCOUNT_ID: undefined,
        INSTAGRAM_APP_SECRET: undefined,
        CLAUDE_API_KEY: undefined,
        // LinkedIn bearer is resolved (proactively refreshed) during env hydration, not here;
        // set undefined so it never falls back to a Worker secret.
        LINKEDIN_ACCESS_TOKEN: undefined,
    };

    if (keys.gemini_key_enc) {
        result.GOOGLE_API_KEY = await decrypt(env, keys.gemini_key_enc);
    }
    if (keys.github_token_enc) {
        result.GITHUB_TOKEN = await decrypt(env, keys.github_token_enc);
    }
    if (keys.heygen_api_key_enc) {
        result.HEYGEN_API_KEY = await decrypt(env, keys.heygen_api_key_enc);
    }
    if (keys.instagram_token_enc) {
        result.INSTAGRAM_ACCESS_TOKEN = await decrypt(env, keys.instagram_token_enc);
    }
    if (keys.instagram_account_id_enc) {
        result.INSTAGRAM_BUSINESS_ACCOUNT_ID = await decrypt(env, keys.instagram_account_id_enc);
    }
    if (keys.instagram_app_secret_enc) {
        result.INSTAGRAM_APP_SECRET = await decrypt(env, keys.instagram_app_secret_enc);
    }
    if (keys.claude_key_enc) {
        result.CLAUDE_API_KEY = await decrypt(env, keys.claude_key_enc);
    }

    return result;
}

/**
 * Persist a freshly-obtained (or refreshed) X OAuth 2.0 token set for a user.
 * Encrypts the access + refresh tokens and records the ISO expiry (now + expiresInSec).
 * Used by both the connect flow and the rotation-aware refresh path — X rotates the
 * refresh token on every refresh, so the new refresh token MUST be persisted here.
 */
export async function storeXOAuth2Tokens(
    env: Env,
    chatId: string,
    accessToken: string,
    refreshToken: string,
    expiresInSec: number
): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
    const accessEnc = await encrypt(env, accessToken);
    const refreshEnc = await encrypt(env, refreshToken);
    // Single atomic write: X retires the previous refresh token the instant a new one is
    // issued, so the rotated refresh token MUST NEVER be persisted apart from its matching
    // access token (a partial write would strand a dead refresh token → permanent lockout).
    await env.DB.prepare(
        "UPDATE users SET x_oauth2_access_enc = ?, x_oauth2_refresh_enc = ?, x_oauth2_expires_at = ?, updated_at = datetime('now') WHERE chat_id = ?"
    ).bind(accessEnc, refreshEnc, expiresAt, chatId).run();
}

/**
 * Invalidate a user's X connection after a confirmed dead refresh token: clear the stored
 * OAuth 2.0 credentials (so the failing refresh loop stops and `needs_x_reconnect` derives
 * true) and notify the user once with a reconnect path. `has_x` is preserved.
 *
 * The notification is fire-and-forget (`.catch(() => {})`) so it can never block or fail
 * token resolution. A LOCAL import of `integrations/telegram` avoids an import cycle.
 */
export async function invalidateXConnection(env: Env, chatId: string): Promise<void> {
    await clearXOAuth2Tokens(env, chatId);

    const { sendMessage } = await import('../integrations/telegram');
    const user = await getUser(env, chatId);
    const lang = (user?.language as Lang) || 'en';
    const keyboard = env.WEBAPP_URL
        ? [[{ text: t(lang, 'notifications.btnReconnectX'), web_app: { url: `${env.WEBAPP_URL}/#/settings` } }]]
        : undefined;
    await sendMessage(env, chatId, t(lang, 'notifications.xReconnectNeeded'), keyboard).catch(() => {});
}

/**
 * Resolve a usable X OAuth 2.0 bearer access token for a user, refreshing proactively.
 *
 * Returns the decrypted access token; if `x_oauth2_expires_at` is at/within 60s of now
 * (or already past), refreshes via `refreshAccessToken`, persists the rotated access +
 * refresh token + new expiry, and returns the fresh token. Returns null when no token is
 * stored or the refresh fails (caller should surface a reconnect prompt).
 */
export async function getValidXAccessToken(env: Env, chatId: string): Promise<string | null> {
    const keys = await getUserEncryptedKeys(env, chatId);
    if (!keys || !keys.x_oauth2_access_enc) {
        return null;
    }

    const expiresAtMs = keys.x_oauth2_expires_at ? Date.parse(keys.x_oauth2_expires_at) : NaN;
    const needsRefresh =
        Number.isNaN(expiresAtMs) || expiresAtMs - Date.now() <= X_TOKEN_REFRESH_BUFFER_MS;

    // Fast path: token is still comfortably valid → no refresh, no lock.
    if (!needsRefresh || !keys.x_oauth2_refresh_enc) {
        return decrypt(env, keys.x_oauth2_access_enc);
    }

    // Single-flight: serialize refreshes per user so concurrent callers can't race on rotation
    // (a losing racer would otherwise see X reject the just-rotated token and wrongly tear down a
    // healthy connection). Exactly one caller claims the lock and refreshes; the rest reuse the
    // current token. The lock is BEST-EFFORT — if claiming errors (e.g. the column is missing
    // pre-migration), proceed without it rather than ever blocking auth.
    let claimed = false;
    try {
        claimed = await tryClaimXRefreshLock(env, chatId);
    } catch (lockError) {
        logError('[x-oauth] refresh-lock claim failed (continuing unlocked) for chat', chatId, lockError instanceof Error ? lockError.message : String(lockError));
        claimed = true;
    }

    if (!claimed) {
        // Another refresher holds the lock. Within the 60s pre-expiry buffer the stored access token
        // is still valid, so return it; the in-flight refresher will have persisted a fresh one by the
        // next call. Only if it is already past hard expiry do we return null (caller retries / surfaces
        // reconnect on the next tick).
        const notYetExpired = !Number.isNaN(expiresAtMs) && expiresAtMs > Date.now();
        return notYetExpired ? await decrypt(env, keys.x_oauth2_access_enc) : null;
    }

    try {
        // Re-read under the lock — a refresher that just released may have rotated the token already.
        const latest = await getUserEncryptedKeys(env, chatId);
        if (!latest?.x_oauth2_access_enc) return null;
        const latestExpiresMs = latest.x_oauth2_expires_at ? Date.parse(latest.x_oauth2_expires_at) : NaN;
        const stillNeedsRefresh =
            Number.isNaN(latestExpiresMs) || latestExpiresMs - Date.now() <= X_TOKEN_REFRESH_BUFFER_MS;
        if (!stillNeedsRefresh || !latest.x_oauth2_refresh_enc) {
            return decrypt(env, latest.x_oauth2_access_enc);
        }

        const usedRefreshEnc = latest.x_oauth2_refresh_enc;
        try {
            const refreshToken = await decrypt(env, usedRefreshEnc);
            const tokens = await refreshAccessToken(env, refreshToken);
            await storeXOAuth2Tokens(env, chatId, tokens.accessToken, tokens.refreshToken, tokens.expiresInSec);
            return tokens.accessToken;
        } catch (error) {
            if (error instanceof XRefreshInvalidError) {
                // We hold the single-flight lock, so a concurrent rotation should be impossible.
                // Defense-in-depth for the rare stale-lock-reclaim case: if the stored refresh token
                // changed since we read it, another refresher rotated it — treat as healthy, don't clear.
                const after = await getUserEncryptedKeys(env, chatId);
                if (after?.x_oauth2_refresh_enc && after.x_oauth2_refresh_enc !== usedRefreshEnc) {
                    return after.x_oauth2_access_enc ? await decrypt(env, after.x_oauth2_access_enc) : null;
                }
                logError('[x-oauth] refresh token dead for chat', chatId, error.message);
                await invalidateXConnection(env, chatId);
                return null;
            }
            // Transient failure (network/5xx/429): leave tokens intact and retry next tick.
            logError('[x-oauth] token refresh failed for chat', chatId, error instanceof Error ? error.message : String(error));
            return null;
        }
    } finally {
        try { await releaseXRefreshLock(env, chatId); } catch { /* best-effort */ }
    }
}

// ==================== LINKEDIN OAUTH 2.0 TOKEN LIFECYCLE ====================

/**
 * Persist a freshly-obtained (or refreshed) LinkedIn OAuth 2.0 token set for a user.
 * Encrypts the access + refresh tokens and records BOTH the access-token expiry
 * (now + expiresInSec) and the ABSOLUTE refresh-token expiry (now + refreshExpiresInSec).
 * LinkedIn rotates the refresh token on every refresh, so the new refresh token MUST be
 * persisted here. The two tokens are written together so a rotated refresh token is never
 * stranded without its matching access token.
 */
export async function storeLinkedInTokens(
    env: Env,
    chatId: string,
    accessToken: string,
    refreshToken: string,
    expiresInSec: number,
    refreshExpiresInSec: number
): Promise<void> {
    const now = Date.now();
    const expiresAt = new Date(now + expiresInSec * 1000).toISOString();
    const refreshExpiresAt = new Date(now + refreshExpiresInSec * 1000).toISOString();
    const accessEnc = await encrypt(env, accessToken);
    const refreshEnc = await encrypt(env, refreshToken);
    await env.DB.prepare(
        "UPDATE users SET linkedin_oauth2_access_enc = ?, linkedin_oauth2_refresh_enc = ?, linkedin_oauth2_expires_at = ?, linkedin_refresh_expires_at = ?, updated_at = datetime('now') WHERE chat_id = ?"
    ).bind(accessEnc, refreshEnc, expiresAt, refreshExpiresAt, chatId).run();
}

/**
 * Invalidate a user's LinkedIn connection after a confirmed dead/expired refresh token: clear
 * the stored OAuth 2.0 credentials (so the failing refresh loop stops and
 * `needs_linkedin_reconnect` derives true) and notify the user once with a reconnect path.
 * `has_linkedin` and `linkedin_person_urn` are preserved. Fire-and-forget notification.
 */
export async function invalidateLinkedInConnection(env: Env, chatId: string): Promise<void> {
    await clearLinkedInOAuth2Tokens(env, chatId);

    const { sendMessage } = await import('../integrations/telegram');
    const user = await getUser(env, chatId);
    const lang = (user?.language as Lang) || 'en';
    const keyboard = env.WEBAPP_URL
        ? [[{ text: t(lang, 'notifications.btnReconnectLinkedIn'), web_app: { url: `${env.WEBAPP_URL}/#/settings` } }]]
        : undefined;
    await sendMessage(env, chatId, t(lang, 'notifications.linkedinReconnectNeeded'), keyboard).catch(() => {});
}

/**
 * Resolve a usable LinkedIn OAuth 2.0 bearer access token for a user, refreshing proactively.
 *
 * Returns the decrypted access token; if `linkedin_oauth2_expires_at` is at/within the buffer
 * of now (or already past), refreshes via the LinkedIn token endpoint, persists the rotated
 * access + refresh token + new expiries, and returns the fresh token. Returns null when no
 * token is stored, the refresh token is past its ABSOLUTE expiry, or the refresh fails (caller
 * surfaces a reconnect prompt). A re-read CAS guard avoids tearing down a healthy connection
 * when a concurrent refresher rotated the refresh token first.
 */
export async function getValidLinkedInAccessToken(env: Env, chatId: string): Promise<string | null> {
    const keys = await getUserEncryptedKeys(env, chatId);
    if (!keys || !keys.linkedin_oauth2_access_enc) {
        return null;
    }

    const expiresAtMs = keys.linkedin_oauth2_expires_at ? Date.parse(keys.linkedin_oauth2_expires_at) : NaN;
    const needsRefresh =
        Number.isNaN(expiresAtMs) || expiresAtMs - Date.now() <= LINKEDIN_TOKEN_REFRESH_BUFFER_MS;

    if (!needsRefresh || !keys.linkedin_oauth2_refresh_enc) {
        // Still comfortably valid, or no refresh token to use. If there's no refresh token and the
        // access token is already past expiry, treat as unusable.
        if (needsRefresh && !keys.linkedin_oauth2_refresh_enc) {
            const notYetExpired = !Number.isNaN(expiresAtMs) && expiresAtMs > Date.now();
            return notYetExpired ? await decrypt(env, keys.linkedin_oauth2_access_enc) : null;
        }
        return decrypt(env, keys.linkedin_oauth2_access_enc);
    }

    // The refresh token's 1-year expiry is ABSOLUTE — it does not extend on refresh. Once past,
    // no refresh is possible: the connection is dead and needs a full reconnect.
    const refreshExpiresMs = keys.linkedin_refresh_expires_at ? Date.parse(keys.linkedin_refresh_expires_at) : NaN;
    if (!Number.isNaN(refreshExpiresMs) && refreshExpiresMs <= Date.now()) {
        logError('[linkedin-oauth] refresh token past absolute expiry for chat', chatId);
        await invalidateLinkedInConnection(env, chatId);
        return null;
    }

    const usedRefreshEnc = keys.linkedin_oauth2_refresh_enc;
    try {
        const refreshToken = await decrypt(env, usedRefreshEnc);
        const tokens = await refreshLinkedInToken(env, refreshToken);
        await storeLinkedInTokens(env, chatId, tokens.accessToken, tokens.refreshToken, tokens.expiresInSec, tokens.refreshExpiresInSec);
        return tokens.accessToken;
    } catch (error) {
        if (error instanceof LinkedInRefreshInvalidError) {
            // Re-read: if the stored refresh token changed, a concurrent refresher rotated it first —
            // the connection is healthy; return its fresh access token and do NOT clear or notify.
            const after = await getUserEncryptedKeys(env, chatId);
            if (after?.linkedin_oauth2_refresh_enc && after.linkedin_oauth2_refresh_enc !== usedRefreshEnc) {
                return after.linkedin_oauth2_access_enc ? await decrypt(env, after.linkedin_oauth2_access_enc) : null;
            }
            logError('[linkedin-oauth] refresh token dead for chat', chatId, error.message);
            await invalidateLinkedInConnection(env, chatId);
            return null;
        }
        // Transient failure (network/5xx/429): leave tokens intact and retry next tick.
        logError('[linkedin-oauth] token refresh failed for chat', chatId, error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Create a hydrated env object with per-user keys overlaid.
 * Shared infra (DB, IMAGES, TELEGRAM_BOT_TOKEN, etc.) is preserved from original env.
 */
export async function hydrateEnv(env: Env, chatId: string): Promise<Env> {
    const userKeys = await getUserKeys(env, chatId);
    const hydrated = { ...env, ...userKeys, ADMIN_CHAT_ID: env.TELEGRAM_CHAT_ID, TELEGRAM_CHAT_ID: chatId } as Env;

    // Populate GITHUB_OWNER and AI_PROVIDER from user record
    const user = await getUser(env, chatId);
    if (user?.github_username) {
        hydrated.GITHUB_OWNER = user.github_username;
    }
    hydrated.AI_PROVIDER = (user as any)?.ai_provider || 'gemini';
    // Long-lived Instagram token expiry (plaintext) — used by the cron refresh step
    hydrated.INSTAGRAM_TOKEN_EXPIRES_AT = user?.instagram_token_expires_at || undefined;

    // Resolve the per-request X OAuth 2.0 bearer (proactively refreshed); undefined if not connected
    hydrated.X_OAUTH2_ACCESS_TOKEN = (await getValidXAccessToken(env, chatId)) ?? undefined;

    // Resolve the per-request LinkedIn bearer (proactively refreshed) + the member's person URN;
    // both undefined if not connected (or refresh failed → publish fails fast with a reconnect error)
    hydrated.LINKEDIN_ACCESS_TOKEN = (await getValidLinkedInAccessToken(env, chatId)) ?? undefined;
    hydrated.LINKEDIN_PERSON_URN = user?.linkedin_person_urn || undefined;

    return hydrated;
}
