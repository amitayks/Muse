/**
 * POST /api/v1/media/upload — Upload image to R2
 */

import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

const IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const VIDEO_TYPE = 'video/mp4';

export async function handleMediaUploadApi(ctx: ApiContext): Promise<Response> {
    if (ctx.request.method !== 'POST') {
        return errorResponse('Method Not Allowed', 405);
    }

    const contentType = ctx.request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
        return errorResponse('Expected multipart/form-data', 400);
    }

    const formData = await ctx.request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorResponse('No file provided', 400);

    // Validate type — images (jpg/png/gif/webp) or video (mp4)
    const isVideo = file.type === VIDEO_TYPE;
    const isImage = ALLOWED_IMAGE_TYPES.has(file.type);
    if (!isImage && !isVideo) {
        return errorResponse('Invalid file type. Allowed: jpg, png, gif, webp, mp4', 400);
    }

    // Validate size — 50MB for video, 10MB for images
    const maxSize = isVideo ? VIDEO_MAX_SIZE : IMAGE_MAX_SIZE;
    if (file.size > maxSize) {
        const limitMb = isVideo ? 50 : 10;
        return errorResponse(`File too large (max ${limitMb}MB)`, 413);
    }

    // Generate R2 key. Video always lands as .mp4 (the browser normalizes to H.264/AAC MP4).
    const ext = isVideo ? 'mp4' : (file.name.split('.').pop() || 'jpg');
    const random = crypto.randomUUID().substring(0, 8);
    const key = `webapp/${ctx.chatId}/${Date.now()}-${random}.${ext}`;

    if (isVideo) {
        // The webapp transcodes to X tweet-video spec client-side (ffmpeg.wasm) before upload,
        // so the Worker just stores the already-normalized MP4. Stream the body into R2 as-is —
        // streaming avoids buffering the ~50 MB file in memory; size was validated above.
        await ctx.env.IMAGES.put(key, file.stream(), {
            httpMetadata: { contentType: 'video/mp4' },
        });
    } else {
        // Image branch: stream the body into R2 as-is (no transcode). Streaming avoids
        // buffering the whole file in memory; size was validated above.
        await ctx.env.IMAGES.put(key, file.stream(), {
            httpMetadata: { contentType: file.type },
        });
    }

    // NOTE: media pre-warm is NOT kicked here. This endpoint only stores bytes to R2 and returns a
    // key — the media isn't attached to a draft yet (no draftId in scope), and the warm set is
    // computed from a draft's content ∩ publish-targets. The webapp attaches the returned key via a
    // subsequent PUT /api/v1/drafts/:id (updateDraftContent), which is where warmDraftMedia +
    // warmDraftMediaInline fire (see routes/api-v1-drafts.ts). See openspec prewarm-media-uploads.
    const workerUrl = ctx.env.WORKER_URL || '';
    return jsonResponse({
        key,
        url: `${workerUrl}/media/${key}`,
    });
}
