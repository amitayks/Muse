/**
 * Video Publishing — Twitter chunked media upload and Instagram Reels publishing
 */

import type { Env, VideoDraft } from '../types';
import { generateOAuthHeader, uploadVideoToX } from '../integrations/x';
import { logInfo, logError } from '../infra/security';
import { InstagramPublishError, parseGraphError } from './instagram-publish';

// ==================== TWITTER VIDEO PUBLISH ====================

/**
 * Publish a video to Twitter/X via chunked media upload
 * @returns Tweet URL or null on failure
 */
export async function publishVideoToTwitter(
    env: Env,
    videoDraft: VideoDraft
): Promise<string | null> {
    if (!videoDraft.video_url) {
        logError('No video_url on draft for Twitter publish');
        return null;
    }

    try {
        // Upload the video to X via the shared chunked uploader (INIT/APPEND/FINALIZE/STATUS)
        let mediaId: string;
        try {
            mediaId = await uploadVideoToX(env, videoDraft.video_url);
        } catch (uploadError) {
            logError('Twitter video upload failed:', uploadError instanceof Error ? uploadError.message : String(uploadError));
            return null;
        }

        // Create tweet with media
        const caption = videoDraft.twitter_caption || videoDraft.title || 'New video!';
        const tweetUrl = 'https://api.twitter.com/2/tweets';
        const tweetAuth = await generateOAuthHeader(env, 'POST', tweetUrl, {});

        const tweetResponse = await fetch(tweetUrl, {
            method: 'POST',
            headers: {
                'Authorization': tweetAuth,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: caption,
                media: { media_ids: [mediaId] },
            }),
        });

        if (!tweetResponse.ok) {
            logError('Twitter tweet creation failed:', await tweetResponse.text());
            return null;
        }

        const tweetResult = await tweetResponse.json() as { data: { id: string } };
        const tweetId = tweetResult.data.id;
        const url = `https://twitter.com/i/status/${tweetId}`;
        logInfo('Published video to Twitter:', url);
        return url;
    } catch (error) {
        logError('publishVideoToTwitter error:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

// ==================== INSTAGRAM REELS PUBLISH ====================

/**
 * Publish a video to Instagram Reels via Meta Content Publishing API
 * @returns Instagram URL or null on failure
 */
export async function publishVideoToInstagram(
    env: Env,
    videoDraft: VideoDraft
): Promise<string> {
    if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        throw new InstagramPublishError('Instagram is not configured', { isAuthError: true });
    }

    if (!videoDraft.video_url) {
        throw new InstagramPublishError('No video available for Instagram publish');
    }

    try {
        // Build public video URL for Meta to fetch
        const videoPublicUrl = `${env.WORKER_URL}/media/${videoDraft.video_url}`;

        // Step 1: Create media container
        const containerUrl = `https://graph.instagram.com/v25.0/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
        const containerResponse = await fetch(containerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_url: videoPublicUrl,
                caption: (videoDraft.caption || '').substring(0, 2200),
                media_type: 'REELS',
                access_token: env.INSTAGRAM_ACCESS_TOKEN,
            }),
        });

        if (!containerResponse.ok) {
            throw parseGraphError(await containerResponse.text(), 'Instagram container creation failed');
        }

        const containerResult = await containerResponse.json() as { id: string };
        const containerId = containerResult.id;

        // Step 2: Poll for processing completion (max 5 minutes)
        const maxWait = 5 * 60 * 1000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            await new Promise(r => setTimeout(r, 10000)); // Check every 10s

            const statusUrl = `https://graph.instagram.com/v25.0/${containerId}?fields=status_code&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`;
            const statusResponse = await fetch(statusUrl);
            const statusResult = await statusResponse.json() as { status_code: string };

            if (statusResult.status_code === 'FINISHED') break;
            if (statusResult.status_code === 'ERROR') {
                throw new InstagramPublishError('Instagram video processing failed');
            }
        }

        // Step 3: Publish
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
            throw parseGraphError(await publishResponse.text(), 'Instagram publish failed');
        }

        const publishResult = await publishResponse.json() as { id: string };
        const igUrl = `https://www.instagram.com/reel/${publishResult.id}`;
        logInfo('Published video to Instagram:', igUrl);
        return igUrl;
    } catch (error) {
        logError('publishVideoToInstagram error:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}
