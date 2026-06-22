/**
 * Multi-Platform Publish Pipeline
 *
 * Orchestrates publishing to X (Twitter) and Instagram platforms.
 * Each platform is independently tried — partial failures don't block others.
 * Results are stored per-platform on the draft's publish_results column.
 */

import type { Env, Draft, DraftContent, PublishTargets, PublishResults } from '../types';
import { postThread, postQuoteTweet, uploadMediaFromBuffer, uploadMedia, uploadVideoToX, XReconnectError } from '../integrations/x';
import { updateDraftStatus, updateDraftPublishResults, createPublished } from '../data/db';
import { enqueuePendingXPost, type PendingXPayload } from '../data/x-pending-db';
import { publishToInstagramPost, publishToInstagramCarousel, publishToInstagramReel, publishToInstagramStory, formatInstagramCaption, InstagramPublishError, parseGraphError, type InstagramMediaItem } from '../services/instagram-publish';
import { publishVideoToInstagram } from '../services/video-publish';
import { postToLinkedIn, uploadImageToLinkedIn, uploadVideoToLinkedIn, LinkedInPublishError, LINKEDIN_MAX_COMMENTARY, type LinkedInMedia } from '../integrations/linkedin';
// Lazy-imported to avoid loading satori/yoga wasm at module evaluation time (breaks CF Workers)
// import { renderTweetCard, renderThreadCards, renderQuoteTweetCard, createStoryImage, storeTweetCard, storeStoryImage, getTweetCard } from '../services/tweet-card';

async function getTweetCardModule() {
    return import('../services/tweet-card');
}
import { parsePublishTargets } from '../views/platform-toggle';
import { getUser } from '../data/user-db';
import { isMediaTargeted, collectTargetedMedia } from './media-targets';

export interface PublishResult {
    success: boolean;
    results: PublishResults;
    /** Primary URL for backward compat (X URL or first successful platform URL) */
    url: string;
    /**
     * Set when the X target is a video and its tweet-creation was deferred to the every-minute
     * cron processor (core/x-pending.ts). The draft is left in 'publishing' with a row in
     * x_pending_posts; the processor finalizes status, creates the published record, and sends
     * the success/failure notification when the freshly-uploaded video media becomes attachable.
     * Inline callers should treat this as "X posting…" (not a failure) and MUST NOT revert the
     * draft status.
     */
    deferredX?: boolean;
}

/** True iff any tweet in the draft carries media of type 'video' (X-video target). */
export function hasVideoTarget(content: DraftContent): boolean {
    return content.tweets.some(t => t.media?.some(m => m.type === 'video'));
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

    // X video posts are deferred: X video media needs ~10–60s after upload before
    // POST /2/tweets accepts it (see add-x-oauth2-media/design-deferred-video-post.md).
    // We upload the media inline (fits the budget) but DEFER the tweet-creation to the
    // every-minute cron processor (core/x-pending.ts). Text/image-only X posts and ALL
    // Instagram stay inline.
    const xIsVideo = targets.x && hasVideoTarget(content);
    let xMedia: ResolvedXMedia | undefined;

    // ==================== X (Twitter) Publishing ====================

    if (targets.x) {
        try {
            // Upload all media up-front (video chunked upload + photos). Always inline —
            // this fits the ~25s budget; only the tweet-creation step is ever deferred.
            xMedia = await resolveXMedia(env, draft, content);
            if (!xIsVideo) {
                // Text/image X: post inline exactly as before.
                const xResult = await postResolvedX(env, content, draft, xMedia);
                results.x = xResult;
                primaryUrl = xResult.url;
            }
            // xIsVideo: media is uploaded; the deferred post is enqueued AFTER the Instagram
            // branches below so the IG results are available to carry into its payload.
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[publish] X publishing failed:', msg);
            if (error instanceof XReconnectError) {
                results.errors = { ...results.errors, x: 'needs_x_reconnect' };
                results.needsXReconnect = true;
            } else {
                results.errors = { ...results.errors, x: msg };
            }
            // Upload failed → nothing to defer.
            xMedia = undefined;
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
            if (error instanceof InstagramPublishError && error.isAuthError) results.needsInstagramReconnect = true;
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
            if (error instanceof InstagramPublishError && error.isAuthError) results.needsInstagramReconnect = true;
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
            if (error instanceof InstagramPublishError && error.isAuthError) results.needsInstagramReconnect = true;
        }
    }

    // ==================== LinkedIn Publishing ====================

    // Reshape the draft into ONE native LinkedIn member post: thread text merged into a single
    // commentary, photos combined (or one video) as the post media. Independent of X/Instagram —
    // its failure is isolated and never blocks the other platforms. Runs before the deferred-X
    // early-return below so a LinkedIn result is captured even when X video is deferred.
    if (targets.linkedin) {
        try {
            console.log(`[publish] LinkedIn: starting for draft ${draft.id} (connected=${!!env.LINKEDIN_ACCESS_TOKEN}, urn=${env.LINKEDIN_PERSON_URN ? 'set' : 'missing'})`);
            const linkedinResult = await publishToLinkedIn(env, draft, content);
            results.linkedin = linkedinResult;
            if (!primaryUrl && linkedinResult.url) primaryUrl = linkedinResult.url;
            console.log(`[publish] LinkedIn: published draft ${draft.id} → ${linkedinResult.url}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[publish] LinkedIn publishing failed:', msg);
            results.errors = { ...results.errors, linkedin: msg };
            if (error instanceof LinkedInPublishError && error.isAuthError) results.needsLinkedInReconnect = true;
        }
    }

    // ==================== Deferred X video post ====================

    // X target is a video and its media uploaded successfully → enqueue a pending row so the
    // every-minute cron processor (core/x-pending.ts) posts the tweet once the media becomes
    // attachable. Instagram (if any) has already published inline above; its results are carried
    // into the payload so the processor can build the final published record. The draft stays in
    // 'publishing' until the processor resolves it.
    if (xIsVideo && xMedia) {
        results.x_pending = true; // UI badge: "X posting…" while the cron processor retries
        await updateDraftPublishResults(env, draft.id, chatId, results);
        await enqueueDeferredXPost(env, chatId, draft, content, xMedia, results);
        // Leave the draft in 'publishing' (already set by callers); success=true so inline callers
        // render "X posting…" rather than a failure. The cron processor sends the final
        // notification and creates the published record on X success.
        return { success: true, results, url: primaryUrl, deferredX: true };
    }

    // ==================== Status Transition ====================

    const anySuccess = !!(results.x || results.instagram_post || results.instagram_story || results.instagram_reel || results.linkedin);

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

/**
 * Resolved X media ready to attach to POST /2/tweets — the output of the upload step,
 * separated from the post step so the post can be deferred (for video) while the upload
 * always runs inline within the publish budget.
 */
export interface ResolvedXMedia {
    /** Per-tweet media id arrays (handwritten drafts). null entries = no media for that tweet. */
    perTweetMediaIds?: (string[] | null)[];
    /** Single draft-level media id (legacy auto-generated drafts). */
    mediaId?: string;
}

/**
 * Upload all X media for a draft and return the resolved media ids.
 * Photo uploads are best-effort (skip failures); a VIDEO upload failure throws.
 * This is the slow step (video chunked upload + processing poll, ~25s) but it fits the
 * publish budget — only the subsequent tweet-creation is deferred for video posts.
 */
export async function resolveXMedia(
    env: Env,
    draft: Draft,
    content: DraftContent
): Promise<ResolvedXMedia> {
    // Handle media upload
    const hasPerTweetMedia = content.tweets.some(t => t.media?.length);
    let mediaId: string | undefined;
    let perTweetMediaIds: (string[] | null)[] | undefined;

    if (hasPerTweetMedia) {
        // Per-tweet media: a tweet has EITHER exactly 1 video OR up to 4 photos
        // (X's exclusivity rule; the editor enforces it, we enforce it defensively here).
        // Photo uploads are best-effort (skip failures); a VIDEO upload failure throws and
        // fails X publishing — caught by publishDraft's per-platform try/catch (→ errors.x).
        perTweetMediaIds = await Promise.all(
            content.tweets.map(async (tweet) => {
                // Only media targeted to X is attached; a tweet with no X-targeted media → text-only.
                const items = (tweet.media || []).filter(m => isMediaTargeted(m, 'x'));
                const video = items.find(m => m.type === 'video');
                if (video) {
                    // Video wins: upload exactly one video, ignore any photos on this tweet.
                    const videoMediaId = await uploadVideoToX(env, video.key);
                    return [videoMediaId];
                }
                // Photos: up to 4 for X — silently truncate the rest, skip individual failures.
                const photos = items.filter(m => m.type === 'photo').slice(0, 4);
                if (photos.length === 0) return null;
                const ids: string[] = [];
                for (const media of photos) {
                    try {
                        const r2Object = await env.IMAGES.get(media.key);
                        if (!r2Object) continue;
                        const buffer = await r2Object.arrayBuffer();
                        const id = await uploadMediaFromBuffer(env, buffer);
                        ids.push(id);
                    } catch {
                        // Skip failed photo uploads, continue with others
                    }
                }
                return ids.length > 0 ? ids : null;
            })
        );
    } else {
        // Draft-level image for auto-generated drafts (best-effort — publish without on failure).
        try {
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
        } catch {
            // Continue without image
            mediaId = undefined;
        }
    }

    return { perTweetMediaIds, mediaId };
}

/**
 * Post the X thread / quote-tweet using ALREADY-RESOLVED media ids.
 * Pure tweet-creation — no uploads. Used inline for text/image X posts and by the every-minute
 * cron processor (core/x-pending.ts) for deferred video posts (the media ids stay valid for hours).
 */
export async function postResolvedX(
    env: Env,
    content: DraftContent,
    draft: Pick<Draft, 'source' | 'original_tweet_id' | 'original_tweet_url'>,
    media: ResolvedXMedia
): Promise<{ tweet_ids: string[]; url: string }> {
    const { perTweetMediaIds, mediaId } = media;

    // Quote tweet for reposts
    if (draft.source === 'repost' && draft.original_tweet_id) {
        const firstTweetText = content.tweets[0]?.text || '';
        // Prefer media attached to the commentary tweet in the webapp (photos or a video);
        // fall back to the draft-level image for legacy auto-generated reposts.
        const mediaIds = perTweetMediaIds?.[0] ?? (mediaId ? [mediaId] : undefined);
        const quoteTweetId = await postQuoteTweet(env, firstTweetText, draft.original_tweet_id, { mediaIds, originalTweetUrl: draft.original_tweet_url || undefined });
        const url = `https://x.com/i/status/${quoteTweetId}`;
        return { tweet_ids: [quoteTweetId], url };
    }

    // Regular thread post
    const { tweetIds, url } = await postThread(env, content, mediaId, perTweetMediaIds);
    return { tweet_ids: tweetIds, url };
}

/**
 * Enqueue a pending row so the every-minute cron processor (core/x-pending.ts) posts a deferred
 * X video tweet once the uploaded media becomes attachable. Carries the resolved media ids +
 * content + quote info + any already-published Instagram results so the processor can build the
 * final published record. INSERT OR REPLACE on draft_id makes the enqueue idempotent.
 */
async function enqueueDeferredXPost(
    env: Env,
    chatId: string,
    draft: Draft,
    content: DraftContent,
    media: ResolvedXMedia,
    igResults: PublishResults
): Promise<void> {
    const payload: PendingXPayload = {
        draftId: draft.id,
        chatId,
        prNumber: draft.pr_number,
        prTitle: draft.pr_title,
        source: draft.source,
        originalTweetId: draft.original_tweet_id,
        originalTweetUrl: draft.original_tweet_url,
        content,
        media,
        // The non-X portions already produced inline (Instagram + LinkedIn); X is not yet posted.
        igResults: {
            instagram_post: igResults.instagram_post,
            instagram_story: igResults.instagram_story,
            instagram_reel: igResults.instagram_reel,
            linkedin: igResults.linkedin,
            errors: igResults.errors,
            needsInstagramReconnect: igResults.needsInstagramReconnect,
            needsLinkedInReconnect: igResults.needsLinkedInReconnect,
        },
    };

    await enqueuePendingXPost(env, payload);
    console.log(`[publish] Deferred X video post enqueued for draft ${draft.id}`);
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

    // Collect ALL media targeted to Instagram Post across the thread, in order, keeping type.
    // Photos AND videos — Instagram carousels can mix them. (Previously this filtered to photos,
    // silently dropping videos.)
    const items: InstagramMediaItem[] = collectTargetedMedia(content.tweets, 'instagram_post')
        .map(media => ({ url: `${workerUrl}/media/${media.key}`, type: media.type }));

    // Fallbacks (images only): draft-level image, then generated tweet cards.
    if (items.length === 0 && draft.image_url) {
        items.push({ url: `${workerUrl}/media/${draft.image_url}`, type: 'photo' });
    }
    if (items.length === 0) {
        const cardUrls = await generateTweetCardImages(env, chatId, draft, content);
        for (const u of cardUrls) items.push({ url: u, type: 'photo' });
    }

    if (items.length === 0) {
        throw new Error('No media available for Instagram post');
    }

    // A lone video → Reel; a lone photo → image post; otherwise a mixed carousel.
    if (items.length === 1) {
        const single = items[0];
        const result = single.type === 'video'
            ? await publishToInstagramReel(env, single.url, caption)
            : await publishToInstagramPost(env, single.url, caption);
        return { post_id: result.post_id, url: result.url || '' };
    }
    const result = await publishToInstagramCarousel(env, items, caption);
    return { post_id: result.post_id, url: result.url || '' };
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

    // Per-media targeting (video wins): a video targeted to Story is published directly as a video
    // story; otherwise prefer a targeted photo; otherwise fall back to card/draft-image.
    const storyCandidates = collectTargetedMedia(content.tweets, 'instagram_story');
    const storyVideo = storyCandidates.find(m => m.type === 'video');
    if (storyVideo) {
        try {
            const result = await publishToInstagramStory(env, { url: `${workerUrl}/media/${storyVideo.key}`, type: 'video' });
            return { post_id: result.post_id, url: null };
        } catch (err) {
            console.error('[publish] IG video story failed; falling back to image story:', err instanceof Error ? err.message : String(err));
        }
    }
    const storyPhoto = storyCandidates.find(m => m.type === 'photo');

    // Prepare a 9:16 story image
    const { createStoryImage, storeStoryImage, getTweetCard } = await getTweetCardModule();
    let storyImageKey: string;

    // Check for a targeted photo first, then existing tweet card or draft image
    const targetedPhotoObj = storyPhoto ? await env.IMAGES.get(storyPhoto.key) : null;
    const existingCard = await getTweetCard(env, draft.id, 0);
    if (targetedPhotoObj) {
        const storyPng = await createStoryImage(env, new Uint8Array(await targetedPhotoObj.arrayBuffer()));
        storyImageKey = await storeStoryImage(env, draft.id, storyPng);
    } else if (existingCard) {
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
    return { post_id: result.post_id, url: null };
}

// ==================== Instagram Reel Branch ====================

async function publishToIGReel(
    env: Env,
    draft: Draft
): Promise<{ post_id: string; url: string } | null> {
    const content = JSON.parse(draft.content) as DraftContent;

    // Find the first video targeted to Reel
    let videoKey: string | null = null;
    for (const tweet of content.tweets) {
        for (const media of tweet.media || []) {
            if (media.type === 'video' && isMediaTargeted(media, 'instagram_reel')) {
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
        throw new InstagramPublishError('Instagram is not configured', { isAuthError: true });
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
        throw parseGraphError(await containerResponse.text(), 'Reel container creation failed');
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
        throw parseGraphError(await publishResponse.text(), 'Reel publish failed');
    }

    const publishResult = await publishResponse.json() as { id: string };
    return {
        post_id: publishResult.id,
        url: `https://www.instagram.com/reel/${publishResult.id}`,
    };
}

// ==================== LinkedIn Branch ====================

/**
 * Publish a draft as ONE native LinkedIn member post.
 *
 * Text: every tweet's text merged with blank lines (trimmed to LinkedIn's 3000-char limit).
 * Media: image/video exclusivity like X — if any tweet has a video, exactly one video is
 * uploaded and attached; otherwise all photos across the thread are uploaded as a multi-image
 * post; with no per-tweet media the draft-level image is used; with no media at all the post is
 * text-only. (No tweet-card rendering — LinkedIn keeps the real text, unlike Instagram.)
 */
async function publishToLinkedIn(
    env: Env,
    draft: Draft,
    content: DraftContent
): Promise<{ post_urn: string; url: string }> {
    const commentary = content.tweets
        .map(t => t.text)
        .filter(Boolean)
        .join('\n\n')
        .slice(0, LINKEDIN_MAX_COMMENTARY);

    const media = await resolveLinkedInMedia(env, draft, content);
    return postToLinkedIn(env, commentary, media);
}

/**
 * Collect and upload a draft's media for LinkedIn, returning the share-media category + asset URNs.
 * Video wins over photos (LinkedIn, like X, attaches EITHER images OR one video). Photo upload
 * failures are skipped (best-effort); a video upload failure throws (fails the LinkedIn branch).
 */
async function resolveLinkedInMedia(
    env: Env,
    draft: Draft,
    content: DraftContent
): Promise<LinkedInMedia> {
    // Only media targeted to LinkedIn is considered; LinkedIn carries EITHER one video OR images.
    const candidates = collectTargetedMedia(content.tweets, 'linkedin');

    // 1) A targeted video takes precedence — upload exactly one; skipped photos are logged.
    const video = candidates.find(m => m.type === 'video');
    if (video) {
        const skipped = candidates.filter(m => m.type === 'photo').length;
        if (skipped > 0) console.log(`[publish] LinkedIn: video wins — skipping ${skipped} targeted photo(s)`);
        console.log(`[publish] LinkedIn: video media detected (key=${video.key}) — uploading`);
        const r2 = await env.IMAGES.get(video.key);
        if (!r2) throw new LinkedInPublishError('Video media missing from storage');
        const asset = await uploadVideoToLinkedIn(env, await r2.arrayBuffer());
        return { category: 'VIDEO', assetUrns: [asset] };
    }

    // 2) Targeted photos → multi-image post (best-effort per photo).
    const photoKeys: string[] = candidates.filter(m => m.type === 'photo').map(m => m.key);
    if (photoKeys.length > 0) {
        const assetUrns: string[] = [];
        for (const key of photoKeys) {
            try {
                const r2 = await env.IMAGES.get(key);
                if (!r2) continue;
                assetUrns.push(await uploadImageToLinkedIn(env, await r2.arrayBuffer()));
            } catch (err) {
                console.error('[publish] LinkedIn photo upload skipped:', err instanceof Error ? err.message : String(err));
            }
        }
        if (assetUrns.length > 0) return { category: 'IMAGE', assetUrns };
    }

    // 3) Draft-level image fallback (auto-generated drafts). R2 key or absolute URL.
    if (draft.image_url) {
        try {
            const bytes = await loadImageBytes(env, draft.image_url);
            if (bytes) {
                const asset = await uploadImageToLinkedIn(env, bytes);
                return { category: 'IMAGE', assetUrns: [asset] };
            }
        } catch (err) {
            console.error('[publish] LinkedIn draft-image upload skipped:', err instanceof Error ? err.message : String(err));
        }
    }

    // 4) No usable media → text-only.
    return { category: 'NONE', assetUrns: [] };
}

/** Load image bytes from an R2 key (e.g. `drafts/...`) or an absolute URL. */
async function loadImageBytes(env: Env, imageUrl: string): Promise<ArrayBuffer | null> {
    if (/^https?:\/\//i.test(imageUrl)) {
        const res = await fetch(imageUrl);
        return res.ok ? await res.arrayBuffer() : null;
    }
    const r2 = await env.IMAGES.get(imageUrl);
    return r2 ? await r2.arrayBuffer() : null;
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
    let user = await getUser(env, chatId);
    const urls: string[] = [];

    // Lazy refresh: if X profile data is missing, fetch it now (one-time, cached in DB)
    if (user && !user.own_display_name_x) {
        try {
            const { getMyProfile } = await import('../integrations/x');
            const { updateOwnProfileData } = await import('../data/user-db');
            const profile = await getMyProfile(env);
            if (profile?.username) {
                await updateOwnProfileData(env, chatId, {
                    profileImageUrl: profile.profile_image_url || '',
                    username: profile.username,
                    displayName: profile.name,
                });
                user = await getUser(env, chatId);
            }
        } catch {
            // Non-fatal — continue with whatever name we have
        }
    }

    // Format timestamp for card display
    const ts = draft.created_at ? new Date(draft.created_at) : new Date();
    const timestamp = ts.toLocaleString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
        month: 'short', day: 'numeric', year: 'numeric',
    }).replace(',', ' ·');

    if (draft.source === 'repost' && draft.original_tweet_id) {
        // Quote-tweet card: user's commentary + original tweet
        let originalUsername = '';
        let originalDisplayName = '';
        let originalText = '';
        let originalProfileImageUrl: string | null = null;
        let originalVerifiedType: string | undefined;

        // Try DB first, then fall back to X API
        try {
            const { getTwitterTweet } = await import('../data/db');
            const originalTweet = await getTwitterTweet(env, chatId, draft.original_tweet_id);
            if (originalTweet) {
                originalUsername = originalTweet.author_username;
                originalDisplayName = originalTweet.author_display_name || originalTweet.author_username;
                originalText = originalTweet.text;
                originalProfileImageUrl = originalTweet.author_profile_image_url;
            }
        } catch { /* continue */ }

        // Fallback: fetch from X API if DB didn't have the data
        if (!originalText) {
            try {
                const { getTweetById } = await import('../integrations/x');
                const fetched = await getTweetById(env, draft.original_tweet_id);
                if (fetched) {
                    originalText = fetched.tweet.text;
                    originalUsername = fetched.author?.username || '';
                    originalDisplayName = fetched.author?.name || fetched.author?.username || '';
                    originalProfileImageUrl = fetched.author?.profile_image_url || null;
                    originalVerifiedType = fetched.author?.verified_type;
                }
            } catch { /* continue with defaults */ }
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
            originalVerifiedType,
            timestamp,
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
            timestamp,
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
                timestamp,
            });

            const key = await storeTweetCard(env, draft.id, 0, cardPng);
            urls.push(`${workerUrl}/media/${key}`);
        }
    }

    return urls;
}
