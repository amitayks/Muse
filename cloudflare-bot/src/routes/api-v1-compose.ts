/**
 * POST /api/v1/compose — Create draft from webapp compose
 * POST /api/v1/generate — Generate tweet from commit
 * POST /api/v1/repost — Create repost draft from URL
 */

import type { DraftContent, Tweet, TweetMedia } from '../types';
import { createDraft } from '../data/db';
import { syncBotMessage } from '../services/webapp-sync';
import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

export async function handleComposeApi(ctx: ApiContext, path: string): Promise<Response> {
    if (ctx.request.method !== 'POST') {
        return errorResponse('Method Not Allowed', 405);
    }

    if (path === '/compose') return handleCompose(ctx);
    if (path === '/generate') return handleGenerate(ctx);
    if (path === '/repost') return handleRepost(ctx);

    return errorResponse('Not Found', 404);
}

async function handleCompose(ctx: ApiContext): Promise<Response> {
    const body = await ctx.request.json() as {
        // `media` carries optional per-item `targets` (TweetMedia) — passed through to stored content.
        tweets: Array<{ text: string; media?: TweetMedia[] }>;
        // `imageGen` is no longer accepted — image generation is a per-tweet action (POST /drafts/:id/tweets/:idx/image).
        options?: { aiRefine?: boolean; analyzeImages?: boolean; instruction?: string; langOverride?: 'en' | 'he' };
    };

    if (!body.tweets?.length) return errorResponse('At least one tweet is required', 400);

    // Build draft content
    const tweets: Tweet[] = body.tweets.map((t, i) => ({
        text: t.text,
        index: i,
        media: t.media,
    }));

    let content: DraftContent = {
        format: tweets.length === 1 ? 'single' : 'thread',
        tweets,
    };

    // Resolve the effective language up-front (independent of AI refine) so it is persisted onto the
    // draft even when AI is off — a later refine reads draft.language instead of defaulting to English.
    const { getUserLanguage } = await import('../data/user-settings-db');
    const userLang = await getUserLanguage(ctx.env, ctx.chatId);
    const effectiveLang = body.options?.langOverride ?? userLang;

    // AI refinement if requested
    if (body.options?.aiRefine) {
        try {
            const { hydrateEnv } = await import('../data/user-keys');
            const userEnv = await hydrateEnv(ctx.env, ctx.chatId);
            const { refineHandwrittenContent } = await import('../ai/gemini');
            const refined = await refineHandwrittenContent(
                userEnv, content,
                { refineText: true, instruction: body.options?.instruction },
                effectiveLang, ctx.chatId,
            );
            if (refined) content = refined;
        } catch (err) {
            console.error('[compose] AI refine failed:', err);
            // Continue with unrefined content
        }
    }

    const title = content.tweets[0]?.text.substring(0, 80) || 'Handwritten post';
    const draftId = await createDraft(ctx.env, ctx.chatId, {
        pr_number: 0,
        pr_title: title,
        commit_sha: '',
        source: 'handwrite',
        content: JSON.stringify(content),
        language: effectiveLang,
    });

    // Drive the existing bot-message sync so the bot reflects the new draft.
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    return jsonResponse({ success: true, draftId });
}

async function handleGenerate(ctx: ApiContext): Promise<Response> {
    // Accept both the v2 shape `{ sha, message?, instruction?, options: { ai?, image?, langOverride? } }`
    // and the legacy shape `{ repoId, commitSha, fastImage?, fastAi?, langOverride? }`.
    const body = await ctx.request.json() as {
        // v2 shape — `image` is no longer accepted (image generation is a per-tweet action).
        sha?: string;
        message?: string;
        instruction?: string;
        options?: { ai?: boolean; langOverride?: 'en' | 'he' };
        // legacy shape
        repoId?: string;
        commitSha?: string;
        fastAi?: boolean;
        langOverride?: 'en' | 'he';
    };

    // Normalize across both shapes.
    const sha = (body.sha ?? body.commitSha ?? '').trim();
    const message = body.message?.trim() || undefined;
    const instruction = body.instruction?.trim() || undefined;
    const langOverride = body.options?.langOverride ?? body.langOverride;

    if (!sha) return errorResponse('sha is required', 400);

    // Validate SHA format (partial SHAs allowed — resolved server-side).
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
        return errorResponse('Invalid commit SHA format', 400);
    }

    // Delegate to existing generation logic
    const { hydrateEnv } = await import('../data/user-keys');
    const userEnv = await hydrateEnv(ctx.env, ctx.chatId);

    const { getContentSource } = await import('../integrations/github');
    const { generateContent } = await import('../ai/gemini');

    // Resolve effective language
    const { getUserLanguage } = await import('../data/user-settings-db');
    const userLang = await getUserLanguage(ctx.env, ctx.chatId);
    const effectiveLang = langOverride ?? userLang;

    // Find repo context if repoId provided (legacy callers).
    let repoId: string | undefined;
    if (body.repoId) {
        const { getRepo } = await import('../data/db');
        const repo = await getRepo(ctx.env, body.repoId, ctx.chatId);
        if (repo) repoId = repo.id;
    }

    let contentResult;
    try {
        // Resolve the (possibly partial) SHA to repo + commit details server-side.
        const source = await getContentSource(userEnv, sha);
        contentResult = await generateContent(userEnv, source, repoId, effectiveLang, ctx.chatId, {
            // Combine the commit with any user message (context) and instruction (steer).
            userTweets: message ? [message] : undefined,
            instruction,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Unresolvable SHA → 404 with an actionable message; other failures → 500.
        if (/not found in any accessible repo/i.test(msg)) {
            return errorResponse(`Could not resolve commit ${sha} in any accessible repo`, 404);
        }
        return errorResponse(`Generation failed: ${msg}`, 500);
    }

    if (!contentResult) {
        return errorResponse('Could not find PR or commit for this SHA', 404);
    }

    const draftId = await createDraft(ctx.env, ctx.chatId, {
        pr_number: 0,
        pr_title: contentResult.content.tweets[0]?.text.substring(0, 80) || 'Generated',
        commit_sha: sha,
        source: 'commit',
        content: JSON.stringify(contentResult.content),
        language: effectiveLang,
    });

    // Drive the existing bot-message sync so the bot reflects the new draft.
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    return jsonResponse({ success: true, draftId });
}

async function handleRepost(ctx: ApiContext): Promise<Response> {
    const body = await ctx.request.json() as {
        url: string;
        tweets?: Array<{ text: string }>;
        options?: { aiRefine?: boolean; instruction?: string; langOverride?: 'en' | 'he' };
    };

    if (!body.url) return errorResponse('url is required', 400);

    // Extract tweet ID from URL
    const tweetIdMatch = body.url.match(/\/status\/(\d+)/);
    if (!tweetIdMatch) return errorResponse('Invalid X/Twitter tweet URL', 400);
    const originalTweetId = tweetIdMatch[1];

    // Check for duplicate
    const { getExistingRepostDraft } = await import('../data/db');
    const existing = await getExistingRepostDraft(ctx.env, ctx.chatId, originalTweetId);
    if (existing) {
        return jsonResponse({ success: false, duplicate: true, existingDraftId: existing.id });
    }

    // Build content from user input or empty
    const tweets: Tweet[] = body.tweets?.length
        ? body.tweets.map((t, i) => ({ text: t.text, index: i }))
        : [{ text: '', index: 0 }];

    const content: DraftContent = {
        format: tweets.length === 1 ? 'single' : 'thread',
        tweets,
    };

    // Persist the effective content language so a later AI refine of this repost draft respects it.
    const { getUserLanguage } = await import('../data/user-settings-db');
    const userLang = await getUserLanguage(ctx.env, ctx.chatId);
    const effectiveLang = body.options?.langOverride ?? userLang;

    const title = `Repost: ${body.url.substring(0, 60)}`;
    const draftId = await createDraft(ctx.env, ctx.chatId, {
        pr_number: 0,
        pr_title: title,
        commit_sha: '',
        source: 'repost',
        content: JSON.stringify(content),
        original_tweet_id: originalTweetId,
        original_tweet_url: body.url,
        language: effectiveLang,
    });

    // Drive the existing bot-message sync so the bot reflects the new draft.
    ctx.ctx.waitUntil(syncBotMessage(ctx.env, ctx.chatId, draftId));

    return jsonResponse({ success: true, draftId });
}
