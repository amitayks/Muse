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

    // Generate R2 key (same format for images and video)
    const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
    const random = crypto.randomUUID().substring(0, 8);
    const key = `webapp/${ctx.chatId}/${Date.now()}-${random}.${ext}`;

    // Stream the body into R2 instead of buffering the whole file in memory
    // (important for video near the Worker memory ceiling). Size was validated above.
    await ctx.env.IMAGES.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
    });

    const workerUrl = ctx.env.WORKER_URL || '';
    return jsonResponse({
        key,
        url: `${workerUrl}/media/${key}`,
    });
}
