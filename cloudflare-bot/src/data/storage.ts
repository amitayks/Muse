/**
 * Image Storage Service — generates and persists images to R2
 *
 * Consolidates all image storage logic. Uses gemini.ts for generation,
 * env.IMAGES (R2) for persistence.
 */

import type { Env } from '../types';
import { logInfo, logError, isValidFileSize } from '../infra/security';
import { getFileUrl } from '../integrations/telegram';

/**
 * Download a user-sent photo from Telegram and store in R2
 * @returns R2 key or null if download/storage failed
 */
export async function storeUserMedia(
    env: Env,
    chatId: string,
    messageId: number,
    fileId: string
): Promise<string | null> {
    try {
        const downloadUrl = await getFileUrl(env, fileId);
        if (!downloadUrl) {
            logError('Failed to get file URL from Telegram for fileId:', fileId);
            return null;
        }

        const response = await fetch(downloadUrl);
        if (!response.ok) {
            logError('Failed to download file from Telegram:', response.status);
            return null;
        }

        const buffer = await response.arrayBuffer();

        // Validate file size (max 10MB)
        if (!isValidFileSize(buffer.byteLength)) {
            logError('User media file too large:', buffer.byteLength);
            return null;
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : 'jpg';
        const key = `handwrite/${chatId}/${messageId}.${ext}`;

        await env.IMAGES.put(key, buffer, {
            httpMetadata: { contentType },
        });

        logInfo('Stored user media in R2:', key);
        return key;
    } catch (error) {
        logError('storeUserMedia error:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Download a user-sent document (file) from Telegram and store in R2.
 * Only accepts image MIME types — returns null for non-image documents.
 * @returns R2 key or null if not an image or download/storage failed
 */
export async function storeUserDocument(
    env: Env,
    chatId: string,
    messageId: number,
    fileId: string,
    mimeType?: string,
): Promise<string | null> {
    // Only accept image documents
    if (mimeType && !mimeType.startsWith('image/')) {
        return null;
    }

    try {
        const downloadUrl = await getFileUrl(env, fileId);
        if (!downloadUrl) {
            logError('Failed to get file URL from Telegram for document fileId:', fileId);
            return null;
        }

        const response = await fetch(downloadUrl);
        if (!response.ok) {
            logError('Failed to download document from Telegram:', response.status);
            return null;
        }

        const buffer = await response.arrayBuffer();

        if (!isValidFileSize(buffer.byteLength)) {
            logError('User document file too large:', buffer.byteLength);
            return null;
        }

        const contentType = mimeType || response.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const key = `handwrite/${chatId}/${messageId}.${ext}`;

        await env.IMAGES.put(key, buffer, {
            httpMetadata: { contentType },
        });

        logInfo('Stored user document in R2:', key);
        return key;
    } catch (error) {
        logError('storeUserDocument error:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

// ==================== VIDEO STORAGE ====================

const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

/**
 * Store a video file in R2
 * @returns R2 key path for the stored video, or null if failed
 */
export async function storeVideo(
    env: Env,
    videoDraftId: string,
    data: ArrayBuffer,
    mimeType: string
): Promise<string | null> {
    try {
        if (data.byteLength > MAX_VIDEO_SIZE) {
            logError('Video file too large:', data.byteLength);
            return null;
        }

        const key = `videos/${videoDraftId}/video.mp4`;
        await env.IMAGES.put(key, data, {
            httpMetadata: { contentType: mimeType || 'video/mp4' },
        });

        logInfo('Video stored in R2:', key, `(${Math.round(data.byteLength / 1024 / 1024)}MB)`);
        return key;
    } catch (error) {
        logError('storeVideo error:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

