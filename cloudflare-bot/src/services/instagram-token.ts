/**
 * Instagram Token Lifecycle — exchange + refresh of long-lived tokens.
 *
 * The Meta dashboard issues a SHORT-LIVED (~1h) Instagram-Login token. We exchange
 * it for a LONG-LIVED (~60-day) token on connect (`ig_exchange_token`, needs the App
 * Secret) and then refresh it before expiry via cron (`ig_refresh_token`, needs only
 * the token). Without this, publishing silently dies ~60 days after every connect.
 *
 * Endpoints (token endpoints are unversioned):
 *   GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=…&access_token=…
 *   GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…
 */

import type { Env } from '../types';
import { encrypt } from '../infra/crypto';
import { storeEncryptedKey, updateUser } from '../data/user-db';
import { logInfo, logError, sanitizeError } from '../infra/security';

const IG_BASE = 'https://graph.instagram.com';

// Conservative fallback expiry when we cannot learn the real one (token too young to refresh).
const ESTIMATED_LONG_LIVED_SEC = 60 * 24 * 60 * 60; // 60 days

export type IgTokenResult =
    | { ok: true; token: string; expiresInSec: number }
    | { ok: false; code?: number; message: string };

interface IgTokenResponse {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string; code?: number; error_subcode?: number };
}

/**
 * Exchange a short-lived token for a long-lived (~60-day) token.
 * Requires the Instagram App Secret.
 */
export async function exchangeForLongLivedToken(shortToken: string, appSecret: string): Promise<IgTokenResult> {
    const url = `${IG_BASE}/access_token?grant_type=ig_exchange_token` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&access_token=${encodeURIComponent(shortToken)}`;
    return requestToken(url, 'exchange');
}

/**
 * Refresh a long-lived token (extends ~60 days). Token must be ≥24h old and not expired.
 * Needs only the token (no App Secret).
 */
export async function refreshLongLivedToken(token: string): Promise<IgTokenResult> {
    const url = `${IG_BASE}/refresh_access_token?grant_type=ig_refresh_token` +
        `&access_token=${encodeURIComponent(token)}`;
    return requestToken(url, 'refresh');
}

async function requestToken(url: string, label: string): Promise<IgTokenResult> {
    try {
        const res = await fetch(url);
        const body = await res.json() as IgTokenResponse;
        if (!res.ok || !body.access_token) {
            const code = body.error?.code;
            const message = body.error?.message || `Instagram token ${label} failed (HTTP ${res.status})`;
            logError(`[ig-token] ${label} failed:`, message);
            return { ok: false, code, message };
        }
        return { ok: true, token: body.access_token, expiresInSec: body.expires_in ?? ESTIMATED_LONG_LIVED_SEC };
    } catch (error) {
        logError(`[ig-token] ${label} error:`, sanitizeError(error));
        return { ok: false, message: `Instagram token ${label} request error` };
    }
}

/**
 * Persist a (long-lived) Instagram token and its computed expiry for a user.
 * Used by both the connect flow and the cron refresh step.
 */
export async function storeInstagramToken(env: Env, chatId: string, token: string, expiresInSec: number): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
    await storeEncryptedKey(env, chatId, 'instagram_token_enc', await encrypt(env, token));
    await updateUser(env, chatId, { instagram_token_expires_at: expiresAt });
}

/**
 * Connect (or reconnect) Instagram: validate is done by the caller; here we run the
 * exchange→refresh→estimate fallback chain and persist token, account id, app secret,
 * and expiry. Returns whether the expiry is authoritative or an estimate.
 */
export async function connectInstagram(
    env: Env,
    chatId: string,
    shortToken: string,
    accountId: string,
    appSecret: string
): Promise<{ ok: true; estimated: boolean; expiresAt: string }> {
    let finalToken = shortToken;
    let expiresInSec = ESTIMATED_LONG_LIVED_SEC;
    let estimated = true;

    const exchanged = await exchangeForLongLivedToken(shortToken, appSecret);
    if (exchanged.ok) {
        finalToken = exchanged.token;
        expiresInSec = exchanged.expiresInSec;
        estimated = false;
    } else {
        // Token may already be long-lived → exchange rejects it; try a refresh instead.
        const refreshed = await refreshLongLivedToken(shortToken);
        if (refreshed.ok) {
            finalToken = refreshed.token;
            expiresInSec = refreshed.expiresInSec;
            estimated = false;
        } else {
            logInfo(`[ig-token] connect: storing token as-is with estimated 60d expiry for chat ${chatId}`);
        }
    }

    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
    await storeEncryptedKey(env, chatId, 'instagram_token_enc', await encrypt(env, finalToken));
    await storeEncryptedKey(env, chatId, 'instagram_account_id_enc', await encrypt(env, accountId));
    await storeEncryptedKey(env, chatId, 'instagram_app_secret_enc', await encrypt(env, appSecret));
    await updateUser(env, chatId, { instagram_token_expires_at: expiresAt });

    return { ok: true, estimated, expiresAt };
}
