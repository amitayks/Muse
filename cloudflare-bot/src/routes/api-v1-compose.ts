/**
 * POST /api/v1/compose — Create draft from webapp compose
 * POST /api/v1/generate — Generate tweet from commit
 * POST /api/v1/repost — Create repost draft from URL
 */

import type { DraftContent, Tweet } from '../types';
import { createDraft } from '../data/db';
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
        tweets: Array<{ text: string; media?: Array<{ key: string; type: 'photo' | 'video' }> }>;
        options?: { aiRefine?: boolean; imageGen?: boolean; instruction?: string };
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

    // AI refinement if requested
    if (body.options?.aiRefine) {
        try {
            const { hydrateEnv } = await import('../data/user-keys');
            const userEnv = await hydrateEnv(ctx.env, ctx.chatId);
            const { refineHandwrittenContent } = await import('../ai/gemini');
            const refined = await refineHandwrittenContent(
                userEnv, content,
                { refineText: true, generateImagePrompt: !!body.options?.imageGen, instruction: body.options?.instruction },
                undefined, ctx.chatId,
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
    });

    return jsonResponse({ success: true, draftId });
}

async function handleGenerate(ctx: ApiContext): Promise<Response> {
    const body = await ctx.request.json() as {
        repoId: string;
        commitSha: string;
        fastImage?: boolean;
        fastAi?: boolean;
    };

    if (!body.commitSha) return errorResponse('commitSha is required', 400);

    // Validate SHA format
    if (!/^[0-9a-f]{7,40}$/i.test(body.commitSha)) {
        return errorResponse('Invalid commit SHA format', 400);
    }

    // Delegate to existing generation logic
    const { hydrateEnv } = await import('../data/user-keys');
    const userEnv = await hydrateEnv(ctx.env, ctx.chatId);

    const { getContentSource } = await import('../integrations/github');
    const { generateContent } = await import('../ai/gemini');

    // Find repo context if repoId provided
    let repoId: string | undefined;
    if (body.repoId) {
        const { getRepo } = await import('../data/db');
        const repo = await getRepo(ctx.env, body.repoId, ctx.chatId);
        if (repo) repoId = repo.id;
    }

    let contentResult;
    try {
        const source = await getContentSource(userEnv, body.commitSha);
        contentResult = await generateContent(userEnv, source, repoId, undefined, ctx.chatId);
    } catch (err) {
        return errorResponse(`Generation failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }

    if (!contentResult) {
        return errorResponse('Could not find PR or commit for this SHA', 404);
    }

    const draftId = await createDraft(ctx.env, ctx.chatId, {
        pr_number: 0,
        pr_title: contentResult.content.tweets[0]?.text.substring(0, 80) || 'Generated',
        commit_sha: body.commitSha,
        source: 'commit',
        content: JSON.stringify(contentResult.content),
    });

    return jsonResponse({ success: true, draftId });
}

async function handleRepost(ctx: ApiContext): Promise<Response> {
    const body = await ctx.request.json() as {
        url: string;
        tweets?: Array<{ text: string }>;
        options?: { aiRefine?: boolean; instruction?: string };
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

    const title = `Repost: ${body.url.substring(0, 60)}`;
    const draftId = await createDraft(ctx.env, ctx.chatId, {
        pr_number: 0,
        pr_title: title,
        commit_sha: '',
        source: 'repost',
        content: JSON.stringify(content),
        original_tweet_id: originalTweetId,
        original_tweet_url: body.url,
    });

    return jsonResponse({ success: true, draftId });
}
