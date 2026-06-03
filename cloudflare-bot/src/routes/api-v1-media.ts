/**
 * POST /api/v1/media/upload — Upload image to R2
 */

import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

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

    // Validate type
    if (!ALLOWED_TYPES.has(file.type)) {
        return errorResponse('Invalid file type. Allowed: jpg, png, gif, webp', 400);
    }

    // Validate size
    if (file.size > MAX_SIZE) {
        return errorResponse('File too large (max 10MB)', 413);
    }

    // Generate R2 key
    const ext = file.name.split('.').pop() || 'jpg';
    const random = crypto.randomUUID().substring(0, 8);
    const key = `webapp/${ctx.chatId}/${Date.now()}-${random}.${ext}`;

    // Store in R2
    const buffer = await file.arrayBuffer();
    await ctx.env.IMAGES.put(key, buffer, {
        httpMetadata: { contentType: file.type },
    });

    const workerUrl = ctx.env.WORKER_URL || '';
    return jsonResponse({
        key,
        url: `${workerUrl}/media/${key}`,
    });
}
