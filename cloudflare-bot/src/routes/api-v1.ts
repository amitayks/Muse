/**
 * REST API v1 — Webapp endpoints
 *
 * All routes under /api/v1/* authenticated via Telegram WebApp initData.
 * CORS enabled for WEBAPP_URL origin.
 */

import type { Env } from '../types';
import { validateInitData } from '../integrations/telegram-auth';
import { isAdmin } from '../infra/security';
import { handleDashboardApi } from './api-v1-dashboard';
import { handleHomeApi } from './api-v1-home';
import { handleCalendarApi } from './api-v1-calendar';
import { handleDraftsApi } from './api-v1-drafts';
import { handleSettingsApi } from './api-v1-settings';
import { handleReposApi } from './api-v1-repos';
import { handleAccountsApi } from './api-v1-accounts';
import { handleCommitsApi } from './api-v1-commits';
import { handleIdentityApi } from './api-v1-identity';
import { handleMediaUploadApi } from './api-v1-media';
import { handleComposeApi } from './api-v1-compose';
import { handlePromptsApi } from './api-v1-prompts';
import { handleXOAuthStart, handleXOAuthStatus } from './x-oauth';
import { handleLinkedInOAuthStart, handleLinkedInOAuthStatus } from './linkedin-oauth';

/** CORS headers for webapp origin */
function corsHeaders(env: Env): Record<string, string> {
    const origin = env.WEBAPP_URL || '*';
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

/** Add CORS headers to a response */
export function withCors(response: Response, env: Env): Response {
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders(env))) {
        headers.set(k, v);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

/** JSON response helper */
export function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Error response helper */
export function errorResponse(message: string, status: number): Response {
    return jsonResponse({ error: message }, status);
}

/** Authenticated request context */
export interface ApiContext {
    env: Env;
    chatId: string;
    isAdmin: boolean;
    request: Request;
    ctx: ExecutionContext;
}

/**
 * Main handler for /api/v1/* routes.
 */
export async function handleApiV1(
    request: Request,
    url: URL,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }), env);
    }

    // Authenticate
    const authHeader = request.headers.get('Authorization') || '';
    const match = authHeader.match(/^tma\s+(.+)$/i);
    if (!match) {
        return withCors(errorResponse('No auth header', 401), env);
    }

    const result = await validateInitData(match[1], env.TELEGRAM_BOT_TOKEN);
    if (!result.valid || !result.chatId) {
        const msg = result.expired ? 'Session expired' : `Auth failed (valid=${result.valid}, chatId=${result.chatId || 'none'})`;
        return withCors(errorResponse(msg, 401), env);
    }

    const apiCtx: ApiContext = {
        env,
        chatId: result.chatId,
        isAdmin: isAdmin(result.chatId, env),
        request,
        ctx,
    };

    // Route dispatch
    const path = url.pathname.replace('/api/v1', '');
    let response: Response;

    try {
        if (path === '/dashboard') {
            response = await handleDashboardApi(apiCtx);
        } else if (path === '/home') {
            response = await handleHomeApi(apiCtx);
        } else if (path === '/calendar') {
            response = await handleCalendarApi(apiCtx);
        } else if (path.startsWith('/drafts')) {
            response = await handleDraftsApi(apiCtx, path);
        } else if (path.startsWith('/settings')) {
            response = await handleSettingsApi(apiCtx, path);
        } else if (path.startsWith('/repos')) {
            response = await handleReposApi(apiCtx, path);
        } else if (path.startsWith('/accounts')) {
            response = await handleAccountsApi(apiCtx, path);
        } else if (path.startsWith('/commits')) {
            response = await handleCommitsApi(apiCtx, path);
        } else if (path.startsWith('/identity')) {
            response = await handleIdentityApi(apiCtx, path);
        } else if (path === '/media/upload') {
            response = await handleMediaUploadApi(apiCtx);
        } else if (path === '/compose') {
            response = await handleComposeApi(apiCtx, path);
        } else if (path === '/generate') {
            response = await handleComposeApi(apiCtx, path);
        } else if (path === '/repost') {
            response = await handleComposeApi(apiCtx, path);
        } else if (path === '/tweet/fetch') {
            response = await handleTweetFetch(apiCtx);
        } else if (path.startsWith('/prompts')) {
            response = await handlePromptsApi(apiCtx, path);
        } else if (path === '/x/oauth/start') {
            response = await handleXOAuthStart(apiCtx);
        } else if (path === '/x/oauth/status') {
            response = await handleXOAuthStatus(apiCtx);
        } else if (path === '/linkedin/oauth/start') {
            response = await handleLinkedInOAuthStart(apiCtx);
        } else if (path === '/linkedin/oauth/status') {
            response = await handleLinkedInOAuthStatus(apiCtx);
        } else {
            response = errorResponse('Not Found', 404);
        }
    } catch (error) {
        console.error('[api-v1] Unhandled error:', error);
        const msg = error instanceof Error ? error.message : 'Internal Server Error';
        response = errorResponse(msg, 500);
    }

    return withCors(response, env);
}

/** Fetch tweet data for preview (used by repost page) */
async function handleTweetFetch(ctx: ApiContext): Promise<Response> {
    if (ctx.request.method !== 'POST') return errorResponse('Method Not Allowed', 405);
    const body = await ctx.request.json() as { tweetId: string };
    if (!body.tweetId) return errorResponse('tweetId is required', 400);

    try {
        const { hydrateEnv } = await import('../data/user-keys');
        const userEnv = await hydrateEnv(ctx.env, ctx.chatId);
        const { getTweetById } = await import('../integrations/x');
        const result = await getTweetById(userEnv, body.tweetId);
        if (!result) return errorResponse('Tweet not found', 404);
        return jsonResponse({
            text: result.tweet.text,
            author: result.author ? {
                username: result.author.username,
                name: result.author.name,
                profile_image_url: result.author.profile_image_url,
            } : null,
            metrics: result.tweet.public_metrics,
        });
    } catch (err) {
        return errorResponse('Failed to fetch tweet', 500);
    }
}
