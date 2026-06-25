/**
 * Cloudflare Bot - Main Entry Point
 *
 * Thin routing shell: URL matching, rate limiting, delegation to route handlers.
 */

import type { Env } from './types';
import { cronCoordinator } from './handlers/cron';
import { processPendingXPosts } from './core/x-pending';
import { processPublishJobs } from './core/publish-jobs';
import { processMediaWarms } from './core/media-prewarm';
import {
    addSecurityHeaders,
    secureErrorResponse,
    sanitizeError,
    checkRateLimit,
    rateLimitResponse,
    addRateLimitHeaders,
    RATE_LIMITS,
    logInfo,
    logError,
} from './infra/security';

import { handleTelegramWebhook } from './routes/webhook';
import { handleGitHubWebhookEndpoint } from './routes/github';
import { handleSetup } from './routes/setup';
import { handleMigrate, handleWipeUser } from './routes/migrate';
import { handleTestGenerate } from './routes/test-generate';
import { handleImageRequest } from './routes/image';
import { handleHeyGenWebhook } from './routes/heygen-webhook';
import { handleMediaRequest } from './routes/media';
import { handlePromptApi, handleStaleCountApi, handleAcknowledgeApi, handleAdminPromptApi, handleIdentityApi } from './routes/api-prompt';
import { handleApiV1, withCors } from './routes/api-v1';
import { handleXOAuthCallback } from './routes/x-oauth';
import { handleLinkedInOAuthCallback } from './routes/linkedin-oauth';
import { renderTweetCard } from './services/tweet-card';

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

        try {
            if (url.pathname === '/health') {
                return addSecurityHeaders(new Response('OK', { status: 200 }));
            }

            if (url.pathname === '/webhook' && request.method === 'POST') {
                const rateLimit = checkRateLimit(`webhook:${clientIP}`, RATE_LIMITS.webhook);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.webhook.maxRequests);
                const response = await handleTelegramWebhook(request, env, ctx);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.webhook.maxRequests);
            }

            if (url.pathname === '/github-webhook' && request.method === 'POST') {
                const rateLimit = checkRateLimit(`github:${clientIP}`, RATE_LIMITS.github);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.github.maxRequests);
                const response = await handleGitHubWebhookEndpoint(request, env);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.github.maxRequests);
            }

            if (url.pathname === '/setup') {
                const rateLimit = checkRateLimit(`admin:${clientIP}`, RATE_LIMITS.admin);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.admin.maxRequests);
                const response = await handleSetup(request, url, env);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.admin.maxRequests);
            }

            if (url.pathname === '/migrate') {
                const rateLimit = checkRateLimit(`admin:${clientIP}`, RATE_LIMITS.admin);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.admin.maxRequests);
                const response = await handleMigrate(request, env);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.admin.maxRequests);
            }

            if (url.pathname === '/wipe-user' && request.method === 'POST') {
                const rateLimit = checkRateLimit(`admin:${clientIP}`, RATE_LIMITS.admin);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.admin.maxRequests);
                const response = await handleWipeUser(request, url, env);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.admin.maxRequests);
            }

            if (url.pathname === '/heygen-webhook' && request.method === 'POST') {
                const rateLimit = checkRateLimit(`heygen:${clientIP}`, RATE_LIMITS.github);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.github.maxRequests);
                const response = await handleHeyGenWebhook(request, env);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.github.maxRequests);
            }

            if (url.pathname.startsWith('/media/')) {
                const rateLimit = checkRateLimit(`media:${clientIP}`, RATE_LIMITS.image);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.image.maxRequests);
                const response = await handleMediaRequest(url, env);
                // Add CORS for webapp
                if (env.WEBAPP_URL) {
                    const headers = new Headers(response.headers);
                    headers.set('Access-Control-Allow-Origin', env.WEBAPP_URL);
                    return addRateLimitHeaders(
                        new Response(response.body, { status: response.status, headers }),
                        rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.image.maxRequests,
                    );
                }
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.image.maxRequests);
            }

            if (url.pathname.startsWith('/image/')) {
                const rateLimit = checkRateLimit(`image:${clientIP}`, RATE_LIMITS.image);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.image.maxRequests);
                const response = await handleImageRequest(url, env);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.image.maxRequests);
            }

            if (url.pathname === '/test-card' && request.method === 'GET') {
                const text = url.searchParams.get('text') || 'אני מסרב להאמין לטענות של אבא שלי שלישון עם הטלפון ליד הראש מזיק. אבל אני מתחיל לחשוב שלא לזה הוא התכוון באמת.\n\nזה פשוט נורא לקום כשהטלפון בהשג יד. אני שונא את זה.';
                const name = url.searchParams.get('name') || 'Amitay Keisar';
                const handle = url.searchParams.get('handle') || 'AmKeisar';
                const png = await renderTweetCard(env, {
                    displayName: name,
                    username: handle,
                    text,
                    timestamp: new Date().toLocaleString('en-US', {
                        hour: 'numeric', minute: '2-digit', hour12: true,
                        month: 'short', day: 'numeric', year: 'numeric',
                    }).replace(',', ' ·'),
                });
                return new Response(png, { headers: { 'Content-Type': 'image/png' } });
            }

            if (url.pathname === '/test-generate' && request.method === 'GET') {
                const response = await handleTestGenerate(request, url, env);
                return response;
            }

            // X OAuth 2.0 callback — path must equal X_OAUTH2_REDIRECT_URI's path
            // (falls back to /x/oauth/callback). Top-level so it matches the URI
            // registered with X exactly.
            const xOAuthCallbackPath = env.X_OAUTH2_REDIRECT_URI
                ? new URL(env.X_OAUTH2_REDIRECT_URI).pathname
                : '/x/oauth/callback';
            if (url.pathname === xOAuthCallbackPath && request.method === 'GET') {
                const rateLimit = checkRateLimit(`api:${clientIP}`, RATE_LIMITS.api);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
                const response = await handleXOAuthCallback(request, env);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
            }

            // LinkedIn OAuth 2.0 callback — path must equal LINKEDIN_REDIRECT_URI's path
            // (falls back to /linkedin/oauth/callback). Top-level so it matches the URI
            // registered with LinkedIn exactly.
            const linkedinOAuthCallbackPath = env.LINKEDIN_REDIRECT_URI
                ? new URL(env.LINKEDIN_REDIRECT_URI).pathname
                : '/linkedin/oauth/callback';
            if (url.pathname === linkedinOAuthCallbackPath && request.method === 'GET') {
                const rateLimit = checkRateLimit(`api:${clientIP}`, RATE_LIMITS.api);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
                const response = await handleLinkedInOAuthCallback(request, env);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
            }

            // Webapp API v1 routes
            if (url.pathname.startsWith('/api/v1/')) {
                const rateLimit = checkRateLimit(`api:${clientIP}`, RATE_LIMITS.api);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
                const response = await handleApiV1(request, url, env, ctx);
                return addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
            }

            // CORS preflight for the legacy (non-v1) webapp API routes (prompt + identity).
            // These are now called cross-origin from the Pages webapp, so they need the same CORS
            // treatment as /api/v1/* — the Authorization header forces an OPTIONS preflight.
            if (
                request.method === 'OPTIONS' &&
                (url.pathname === '/api/prompt' ||
                    url.pathname.startsWith('/api/prompt/') ||
                    url.pathname === '/api/identity' ||
                    url.pathname.startsWith('/api/admin/prompt'))
            ) {
                return withCors(new Response(null, { status: 204 }), env);
            }

            // Prompt API routes
            if (url.pathname === '/api/prompt') {
                const rateLimit = checkRateLimit(`api:${clientIP}`, RATE_LIMITS.api);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
                const response = await handlePromptApi(request, env);
                return addRateLimitHeaders(
                    withCors(addSecurityHeaders(response, { skipFrameOptions: true }), env),
                    rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.api.maxRequests,
                );
            }

            // Stale count API
            if (url.pathname === '/api/prompt/stale-count') {
                const rateLimit = checkRateLimit(`api:${clientIP}`, RATE_LIMITS.api);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
                const response = await handleStaleCountApi(request, env);
                return addRateLimitHeaders(
                    withCors(addSecurityHeaders(response, { skipFrameOptions: true }), env),
                    rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.api.maxRequests,
                );
            }

            // Acknowledge stale prompt API
            if (url.pathname === '/api/prompt/acknowledge') {
                const rateLimit = checkRateLimit(`api:${clientIP}`, RATE_LIMITS.api);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
                const response = await handleAcknowledgeApi(request, env);
                return addRateLimitHeaders(
                    withCors(addSecurityHeaders(response, { skipFrameOptions: true }), env),
                    rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.api.maxRequests,
                );
            }

            // Identity document API
            if (url.pathname === '/api/identity') {
                const rateLimit = checkRateLimit(`api:${clientIP}`, RATE_LIMITS.api);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
                const response = await handleIdentityApi(request, env);
                return addRateLimitHeaders(
                    withCors(addSecurityHeaders(response, { skipFrameOptions: true }), env),
                    rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.api.maxRequests,
                );
            }

            // Admin prompt API routes
            if (url.pathname === '/api/admin/prompt/push') {
                const rateLimit = checkRateLimit(`api:${clientIP}`, RATE_LIMITS.api);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
                const response = await handleAdminPromptApi(request, env, true);
                return addRateLimitHeaders(
                    withCors(addSecurityHeaders(response, { skipFrameOptions: true }), env),
                    rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.api.maxRequests,
                );
            }

            if (url.pathname === '/api/admin/prompt') {
                const rateLimit = checkRateLimit(`api:${clientIP}`, RATE_LIMITS.api);
                if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt, RATE_LIMITS.api.maxRequests);
                const response = await handleAdminPromptApi(request, env, false);
                return addRateLimitHeaders(
                    withCors(addSecurityHeaders(response, { skipFrameOptions: true }), env),
                    rateLimit.remaining, rateLimit.resetAt, RATE_LIMITS.api.maxRequests,
                );
            }

            return addSecurityHeaders(new Response('Not Found', { status: 404 }));
        } catch (error) {
            logError('Unhandled error:', error);
            return secureErrorResponse(error);
        }
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
        logInfo('Cron triggered at:', new Date(event.scheduledTime).toISOString(), 'cron:', event.cron);
        try {
            // The frequent "* * * * *" tick runs the fresh-budget queue processors — the
            // deferred-X-video-post processor, the durable publish-job processor, AND the media
            // pre-warm processor — on their own fresh ~30s budget. It must NOT run the heavy 15-min
            // coordinator. All other cron schedules ("*/15 * * * *") run the full coordinator.
            if (event.cron === '* * * * *') {
                await processPendingXPosts(env);
                await processPublishJobs(env);
                await processMediaWarms(env);
                return;
            }
            await cronCoordinator(env, ctx);
        } catch (error) {
            logError('Cron error:', sanitizeError(error));
        }
    },
};
