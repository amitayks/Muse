/**
 * Multi-Platform Publish Pipeline
 *
 * Orchestrates publishing to X (Twitter) and Instagram platforms.
 * Each platform is independently tried — partial failures don't block others.
 * Results are stored per-platform on the draft's publish_results column.
 */

import type { Env, Draft, DraftContent, PublishTargets, PublishResults } from '../types';
import { postThread, postQuoteTweet, uploadMediaFromBuffer, uploadMedia } from '../integrations/x';
import { updateDraftStatus, updateDraftPublishResults, createPublished } from '../data/db';
import { publishToInstagramPost, publishToInstagramCarousel, publishToInstagramStory, formatInstagramCaption } from '../services/instagram-publish';
import { publishVideoToInstagram } from '../services/video-publish';
// Lazy-imported to avoid loading satori/yoga wasm at module evaluation time (breaks CF Workers)
// import { renderTweetCard, renderThreadCards, renderQuoteTweetCard, createStoryImage, storeTweetCard, storeStoryImage, getTweetCard } from '../services/tweet-card';

async function getTweetCardModule() {
    return import('../services/tweet-card');
}
import { parsePublishTargets } from '../views/platform-toggle';
import { getUser } from '../data/user-db';

export interface PublishResult {
    success: boolean;
    results: PublishResults;
    /** Primary URL for backward compat (X URL or first successful platform URL) */
    url: string;
}

/**
 * Publish a draft to all targeted platforms.
 * Each platform is independently tried — partial failures don't block others.
 * Returns success=true if at least one platform succeeded.
 */
export async function publishDraft(
    env: Env,
    chatId: string,
    draft: Draft
): Promise<PublishResult> {
    const content = JSON.parse(draft.content) as DraftContent;
    const targets = parsePublishTargets(draft.publish_targets);
    const results: PublishResults = {};
    let primaryUrl = '';

    // ==================== X (Twitter) Publishing ====================

    if (targets.x) {
        try {
            const xResult = await publishToX(env, chatId, draft, content);
            results.x = xResult;
            primaryUrl = xResult.url;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[publish] X publishing failed:', msg);
            results.errors = { ...results.errors, x: msg };
        }
    }

    // ==================== Instagram Post Publishing ====================

    if (targets.instagram_post) {
        try {
            const igResult = await publishToIGPost(env, chatId, draft, content);
            if (igResult) {
                results.instagram_post = igResult;
                if (!primaryUrl && igResult.url) primaryUrl = igResult.url;
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[publish] Instagram Post publishing failed:', msg);
            results.errors = { ...results.errors, instagram_post: msg };
        }
    }

    // ==================== Instagram Story Publishing ====================

    if (targets.instagram_story) {
        try {
            const storyResult = await publishToIGStory(env, chatId, draft, content);
            if (storyResult) {
                results.instagram_story = storyResult;
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[publish] Instagram Story publishing failed:', msg);
            results.errors = { ...results.errors, instagram_story: msg };
        }
    }

    // ==================== Instagram Reel Publishing ====================

    if (targets.instagram_reel && draft.has_video) {
        try {
            const reelResult = await publishToIGReel(env, draft);
            if (reelResult) {
                results.instagram_reel = reelResult;
                if (!primaryUrl && reelResult.url) primaryUrl = reelResult.url;
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[publish] Instagram Reel publishing failed:', msg);
            results.errors = { ...results.errors, instagram_reel: msg };
        }
    }

    // ==================== Status Transition ====================

    const anySuccess = !!(results.x || results.instagram_post || results.instagram_story || results.instagram_reel);

    // Store publish results on draft
    await updateDraftPublishResults(env, draft.id, chatId, results);

    if (anySuccess) {
        // Extract platform results for published record
        const igResult = results.instagram_post || results.instagram_story || results.instagram_reel;
        // Create published record FIRST — if this fails, draft stays in current status
        await createPublished(env, chatId, {
            draft_id: draft.id,
            pr_number: draft.pr_number,
            tweet_ids: results.x?.tweet_ids?.join(',') ?? null,
            tweet_url: results.x?.url ?? null,
            instagram_post_id: igResult?.post_id ?? null,
            instagram_url: (results.instagram_post?.url || results.instagram_reel?.url) ?? null,
        });
        await updateDraftStatus(env, draft.id, chatId, 'published');
    } else {
        // All failed — move back to approved (or stay approved if was scheduled)
        if (draft.status === 'scheduled') {
            await updateDraftStatus(env, draft.id, chatId, 'approved');
        }
    }

    return { success: anySuccess, results, url: primaryUrl };
}

// ==================== X (Twitter) Branch ====================

async function publishToX(
    env: Env,
    chatId: string,
    draft: Draft,
    content: DraftContent
): Promise<{ tweet_ids: string[]; url: string }> {
    // Handle media upload
    const hasPerTweetMedia = content.tweets.some(t => t.media?.length);
    let mediaId: string | undefined;
    let perTweetMediaIds: (string[] | null)[] | undefined;

    try {
        if (hasPerTweetMedia) {
            // Upload ALL media per tweet (up to 4 for X)
            perTweetMediaIds = await Promise.all(
                content.tweets.map(async (tweet) => {
                    const mediaItems = tweet.media?.filter(m => m.type === 'photo') || [];
                    if (mediaItems.length === 0) return null;
                    // X supports max 4 images per tweet — silently truncate
                    const toUpload = mediaItems.slice(0, 4);
                    const ids: string[] = [];
                    for (const media of toUpload) {
                        try {
                            const r2Object = await env.IMAGES.get(media.key);
                            if (!r2Object) continue;
                            const buffer = await r2Object.arrayBuffer();
                            const id = await uploadMediaFromBuffer(env, buffer);
                            ids.push(id);
                        } catch {
                            // Skip failed uploads, continue with others
                        }
                    }
                    return ids.length > 0 ? ids : null;
                })
            );
        } else {
            // Draft-level image for auto-generated drafts
            if (draft.image_url && draft.image_url.startsWith('drafts/')) {
                const r2Object = await env.IMAGES.get(draft.image_url);
                if (r2Object) {
                    const imageBuffer = await r2Object.arrayBuffer();
                    mediaId = await uploadMediaFromBuffer(env, imageBuffer);
                }
            } else if (draft.image_url) {
                mediaId = await uploadMedia(env, draft.image_url);
            }

            // No forced image generation at publish time — if compose didn't
            // generate an image, we publish without one.
        }
    } catch {
        // Continue without image
        mediaId = undefined;
        perTweetMediaIds = undefined;
    }

    // Quote tweet for reposts
    if (draft.source === 'repost' && draft.original_tweet_id) {
        const firstTweetText = content.tweets[0]?.text || '';
        const mediaIds = mediaId ? [mediaId] : undefined;
        const quoteTweetId = await postQuoteTweet(env, firstTweetText, draft.original_tweet_id, { mediaIds, originalTweetUrl: draft.original_tweet_url || undefined });
        const url = `https://x.com/i/status/${quoteTweetId}`;
        return { tweet_ids: [quoteTweetId], url };
    }

    // Regular thread post
    const { tweetIds, url } = await postThread(env, content, mediaId, perTweetMediaIds);
    return { tweet_ids: tweetIds, url };
}

// ==================== Instagram Post Branch ====================

async function publishToIGPost(
    env: Env,
    chatId: string,
    draft: Draft,
    content: DraftContent
): Promise<{ post_id: string; url: string } | null> {
    const workerUrl = env.WORKER_URL;
    if (!workerUrl) throw new Error('WORKER_URL not configured');

    // Prepare caption from tweet texts
    const caption = formatInstagramCaption(content.tweets.map(t => t.text));

    // Check for existing images
    const imageUrls: string[] = [];

    // Check per-tweet media first
    const hasPerTweetMedia = content.tweets.some(t => t.media?.some(m => m.type === 'photo'));
    if (hasPerTweetMedia) {
        for (const tweet of content.tweets) {
            for (const media of tweet.media || []) {
                if (media.type === 'photo') {
                    imageUrls.push(`${workerUrl}/media/${media.key}`);
                }
            }
        }
    }

    // Check draft-level image
    if (imageUrls.length === 0 && draft.image_url) {
        imageUrls.push(`${workerUrl}/media/${draft.image_url}`);
    }

    // No images — generate tweet cards
    if (imageUrls.length === 0) {
        const cardUrls = await generateTweetCardImages(env, chatId, draft, content);
        imageUrls.push(...cardUrls);
    }

    if (imageUrls.length === 0) {
        throw new Error('No images available for Instagram post');
    }

    // Single or carousel
    if (imageUrls.length === 1) {
        const result = await publishToInstagramPost(env, imageUrls[0], caption);
        if (!result) throw new Error('Instagram post publish failed');
        return { post_id: result.post_id, url: result.url || '' };
    } else {
        const result = await publishToInstagramCarousel(env, imageUrls, caption);
        if (!result) throw new Error('Instagram carousel publish failed');
        return { post_id: result.post_id, url: result.url || '' };
    }
}

// ==================== Instagram Story Branch ====================

async function publishToIGStory(
    env: Env,
    chatId: string,
    draft: Draft,
    content: DraftContent
): Promise<{ post_id: string; url: null } | null> {
    const workerUrl = env.WORKER_URL;
    if (!workerUrl) throw new Error('WORKER_URL not configured');

    // Prepare a 9:16 story image
    const { createStoryImage, storeStoryImage, getTweetCard } = await getTweetCardModule();
    let storyImageKey: string;

    // Check for existing tweet card or image
    const existingCard = await getTweetCard(env, draft.id, 0);
    if (existingCard) {
        // Create story from existing card
        const storyPng = await createStoryImage(env, existingCard);
        storyImageKey = await storeStoryImage(env, draft.id, storyPng);
    } else if (draft.image_url) {
        // Use draft image — create story version
        const imgObj = await env.IMAGES.get(draft.image_url);
        if (imgObj) {
            const imgBuffer = new Uint8Array(await imgObj.arrayBuffer());
            const storyPng = await createStoryImage(env, imgBuffer);
            storyImageKey = await storeStoryImage(env, draft.id, storyPng);
        } else {
            // Generate a card and use it
            const cardUrls = await generateTweetCardImages(env, chatId, draft, content);
            if (cardUrls.length === 0) throw new Error('No image available for story');
            // Re-fetch the first card from R2
            const card = await getTweetCard(env, draft.id, 0);
            if (!card) throw new Error('Failed to retrieve generated card');
            const storyPng = await createStoryImage(env, card);
            storyImageKey = await storeStoryImage(env, draft.id, storyPng);
        }
    } else {
        // No image — generate a tweet card first
        const cardUrls = await generateTweetCardImages(env, chatId, draft, content);
        if (cardUrls.length === 0) throw new Error('No image available for story');
        const card = await getTweetCard(env, draft.id, 0);
        if (!card) throw new Error('Failed to retrieve generated card');
        const storyPng = await createStoryImage(env, card);
        storyImageKey = await storeStoryImage(env, draft.id, storyPng);
    }

    const storyUrl = `${workerUrl}/media/${storyImageKey}`;
    const result = await publishToInstagramStory(env, storyUrl);
    if (!result) throw new Error('Instagram story publish failed');
    return { post_id: result.post_id, url: null };
}

// ==================== Instagram Reel Branch ====================

async function publishToIGReel(
    env: Env,
    draft: Draft
): Promise<{ post_id: string; url: string } | null> {
    const content = JSON.parse(draft.content) as DraftContent;

    // Find video media
    let videoKey: string | null = null;
    for (const tweet of content.tweets) {
        for (const media of tweet.media || []) {
            if (media.type === 'video') {
                videoKey = media.key;
                break;
            }
        }
        if (videoKey) break;
    }

    if (!videoKey) {
        throw new Error('No video found in draft for Reel');
    }

    // Use existing video-publish service
    const caption = formatInstagramCaption(content.tweets.map(t => t.text));
    const videoPublicUrl = `${env.WORKER_URL}/media/${videoKey}`;

    // Create container, poll, publish
    const { publishToInstagramPost: igPost } = await import('../services/instagram-publish');

    // For reels, we need to use the REELS media type directly
    if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        throw new Error('Instagram not configured');
    }

    const containerUrl = `https://graph.instagram.com/v25.0/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
    const containerResponse = await fetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            video_url: videoPublicUrl,
            caption: caption.substring(0, 2200),
            media_type: 'REELS',
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!containerResponse.ok) {
        throw new Error(`Reel container creation failed: ${await containerResponse.text()}`);
    }

    const containerResult = await containerResponse.json() as { id: string };
    const containerId = containerResult.id;

    // Poll for processing (max 5 minutes)
    const maxWait = 5 * 60 * 1000;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, 10000));
        const statusUrl = `https://graph.instagram.com/v25.0/${containerId}?fields=status_code&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`;
        const statusResponse = await fetch(statusUrl);
        const statusResult = await statusResponse.json() as { status_code: string };
        if (statusResult.status_code === 'FINISHED') break;
        if (statusResult.status_code === 'ERROR') throw new Error('Reel processing failed');
    }

    // Publish
    const publishUrl = `https://graph.instagram.com/v25.0/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`;
    const publishResponse = await fetch(publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: env.INSTAGRAM_ACCESS_TOKEN,
        }),
    });

    if (!publishResponse.ok) {
        throw new Error(`Reel publish failed: ${await publishResponse.text()}`);
    }

    const publishResult = await publishResponse.json() as { id: string };
    return {
        post_id: publishResult.id,
        url: `https://www.instagram.com/reel/${publishResult.id}`,
    };
}

// ==================== Tweet Card Generation Helper ====================

/**
 * Generate tweet card images for Instagram when no media exists.
 * Returns array of public URLs for the generated images.
 */
async function generateTweetCardImages(
    env: Env,
    chatId: string,
    draft: Draft,
    content: DraftContent
): Promise<string[]> {
    const workerUrl = env.WORKER_URL;
    if (!workerUrl) return [];

    const { renderTweetCard, renderThreadCards, renderQuoteTweetCard, storeTweetCard, getTweetCard } = await getTweetCardModule();
    const user = await getUser(env, chatId);
    const urls: string[] = [];

    if (draft.source === 'repost' && draft.original_tweet_id) {
        // Quote-tweet card: user's commentary + original tweet
        const repostPreviewStr = draft.content;
        let originalUsername = '';
        let originalDisplayName = '';
        let originalText = '';
        let originalProfileImageUrl: string | null = null;

        // Try to get original tweet data from twitter_tweets table
        try {
            const { getTwitterTweet } = await import('../data/db');
            const originalTweet = await getTwitterTweet(env, chatId, draft.original_tweet_id);
            if (originalTweet) {
                originalUsername = originalTweet.author_username;
                originalDisplayName = originalTweet.author_display_name || originalTweet.author_username;
                originalText = originalTweet.text;
                originalProfileImageUrl = originalTweet.author_profile_image_url;
            }
        } catch {
            // Continue with defaults
        }

        const cardPng = await renderQuoteTweetCard(env, {
            commentText: content.tweets[0]?.text || '',
            commentDisplayName: user?.own_display_name_x || user?.display_name || 'You',
            commentUsername: user?.own_username_x || user?.username || 'user',
            commentProfileImageUrl: user?.own_profile_image_url,
            originalText: originalText || 'Original tweet',
            originalDisplayName: originalDisplayName || originalUsername,
            originalUsername,
            originalProfileImageUrl,
        });

        const key = await storeTweetCard(env, draft.id, 0, cardPng);
        urls.push(`${workerUrl}/media/${key}`);
    } else if (content.tweets.length > 1) {
        // Multi-tweet thread — render individual cards with connecting lines for carousel
        const threadCardData = content.tweets.map(tweet => ({
            displayName: user?.own_display_name_x || user?.display_name || 'User',
            username: user?.own_username_x || user?.username || 'user',
            text: tweet.text,
            profileImageUrl: user?.own_profile_image_url,
        }));

        // Check if first card already exists (implies all were rendered)
        const existingFirst = await getTweetCard(env, draft.id, 0);
        if (existingFirst) {
            for (let i = 0; i < content.tweets.length; i++) {
                urls.push(`${workerUrl}/media/tweet-cards/${draft.id}/${i}.png`);
            }
        } else {
            const threadPngs = await renderThreadCards(env, threadCardData);
            for (let i = 0; i < threadPngs.length; i++) {
                const key = await storeTweetCard(env, draft.id, i, threadPngs[i]);
                urls.push(`${workerUrl}/media/${key}`);
            }
        }
    } else {
        // Single tweet card
        const existing = await getTweetCard(env, draft.id, 0);
        if (existing) {
            urls.push(`${workerUrl}/media/tweet-cards/${draft.id}/0.png`);
        } else {
            const tweet = content.tweets[0];
            const cardPng = await renderTweetCard(env, {
                displayName: user?.own_display_name_x || user?.display_name || 'User',
                username: user?.own_username_x || user?.username || 'user',
                text: tweet.text,
                profileImageUrl: user?.own_profile_image_url,
            });

            const key = await storeTweetCard(env, draft.id, 0, cardPng);
            urls.push(`${workerUrl}/media/${key}`);
        }
    }

    return urls;
}
