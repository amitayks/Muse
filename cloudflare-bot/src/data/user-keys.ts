/**
 * User Key Resolution - Decrypt per-user keys and hydrate env
 */

import type { Env } from '../types';
import { decrypt, encrypt } from '../infra/crypto';
import { getUserEncryptedKeys, getUser, storeEncryptedKey, setXOAuth2ExpiresAt } from './user-db';
import { refreshAccessToken } from '../services/x-oauth';
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
    const result: Partial<Env> = {
        GOOGLE_API_KEY: undefined,
        X_API_KEY: undefined,
        X_API_SECRET: undefined,
        X_ACCESS_TOKEN: undefined,
        X_ACCESS_SECRET: undefined,
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
    if (keys.x_api_key_enc) {
        result.X_API_KEY = await decrypt(env, keys.x_api_key_enc);
    }
    if (keys.x_api_secret_enc) {
        result.X_API_SECRET = await decrypt(env, keys.x_api_secret_enc);
    }
    if (keys.x_access_token_enc) {
        result.X_ACCESS_TOKEN = await decrypt(env, keys.x_access_token_enc);
    }
    if (keys.x_access_secret_enc) {
        result.X_ACCESS_SECRET = await decrypt(env, keys.x_access_secret_enc);
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
    await storeEncryptedKey(env, chatId, 'x_oauth2_access_enc', await encrypt(env, accessToken));
    await storeEncryptedKey(env, chatId, 'x_oauth2_refresh_enc', await encrypt(env, refreshToken));
    await setXOAuth2ExpiresAt(env, chatId, expiresAt);
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

    if (needsRefresh && keys.x_oauth2_refresh_enc) {
        try {
            const refreshToken = await decrypt(env, keys.x_oauth2_refresh_enc);
            const tokens = await refreshAccessToken(env, refreshToken);
            await storeXOAuth2Tokens(env, chatId, tokens.accessToken, tokens.refreshToken, tokens.expiresInSec);
            return tokens.accessToken;
        } catch (error) {
            logError('[x-oauth] token refresh failed for chat', chatId, error instanceof Error ? error.message : String(error));
            return null;
        }
    }

    return decrypt(env, keys.x_oauth2_access_enc);
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
