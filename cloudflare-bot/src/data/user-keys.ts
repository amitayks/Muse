/**
 * User Key Resolution - Decrypt per-user keys and hydrate env
 */

import type { Env } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { decrypt, encrypt } from '../infra/crypto';
import { getUserEncryptedKeys, getUser, clearXOAuth2Tokens, tryClaimXRefreshLock, releaseXRefreshLock } from './user-db';
import { refreshAccessToken, XRefreshInvalidError } from '../services/x-oauth';
import { logError } from '../infra/security';

// Refresh the OAuth 2.0 access token when it is at/within this buffer of expiring.
const X_TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // 60 seconds

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

    return hydrated;
}
