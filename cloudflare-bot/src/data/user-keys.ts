/**
 * User Key Resolution - Decrypt per-user keys and hydrate env
 */

import type { Env } from '../types';
import { decrypt } from '../infra/crypto';
import { getUserEncryptedKeys, getUser } from './user-db';

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

    return hydrated;
}
