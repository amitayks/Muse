/**
 * LinkedIn Publishing — member shares via the UGC Posts API.
 *
 * Uses the self-serve "Share on LinkedIn" flow (granted by the `w_member_social` scope):
 *   - POST /v2/ugcPosts                        create a member share (text / image / video)
 *   - POST /v2/assets?action=registerUpload    register an image/video upload, then PUT bytes
 *
 * Requires env.LINKEDIN_ACCESS_TOKEN (the per-request bearer, hydrated + proactively refreshed
 * by hydrateEnv) and env.LINKEDIN_PERSON_URN (the author URN, resolved once at connect).
 */

import type { Env } from '../types';

const LINKEDIN_API = 'https://api.linkedin.com/v2';
/** LinkedIn's commentary (post body) hard limit. */
export const LINKEDIN_MAX_COMMENTARY = 3000;

export type LinkedInMediaCategory = 'NONE' | 'IMAGE' | 'VIDEO';

export interface LinkedInMedia {
    category: LinkedInMediaCategory;
    /** Registered asset URNs (urn:li:digitalmediaAsset:...). Empty for NONE. */
    assetUrns: string[];
}

/**
 * Structured LinkedIn publish failure. Carries the real reason so the pipeline can show an
 * actionable message (and a reconnect button for auth errors) instead of a generic failure.
 */
export class LinkedInPublishError extends Error {
    readonly status?: number;
    readonly isAuthError: boolean;
    constructor(message: string, opts: { status?: number; isAuthError?: boolean } = {}) {
        super(message);
        this.name = 'LinkedInPublishError';
        this.status = opts.status;
        this.isAuthError = opts.isAuthError ?? false;
    }
}

/** A 401 (or 403) is an auth/permission failure → drives the "Reconnect LinkedIn" affordance. */
function isLinkedInAuthStatus(status: number): boolean {
    return status === 401 || status === 403;
}

/** Build a LinkedInPublishError from a non-OK Response (reads its body once). */
async function linkedInErrorFromResponse(response: Response, fallback: string): Promise<LinkedInPublishError> {
    const text = await response.text().catch(() => '');
    console.error(`[linkedin] ${fallback}:`, response.status, text);
    let message = fallback;
    try {
        const body = JSON.parse(text) as { message?: string };
        if (body.message) message = body.message;
    } catch { /* keep fallback */ }
    return new LinkedInPublishError(message, { status: response.status, isAuthError: isLinkedInAuthStatus(response.status) });
}

/** Throw an auth-flagged error if the LinkedIn bearer / person URN is not hydrated. */
function requireLinkedInConfig(env: Env): { token: string; author: string } {
    if (!env.LINKEDIN_ACCESS_TOKEN || !env.LINKEDIN_PERSON_URN) {
        throw new LinkedInPublishError('LinkedIn is not connected', { isAuthError: true });
    }
    return { token: env.LINKEDIN_ACCESS_TOKEN, author: env.LINKEDIN_PERSON_URN };
}

// ==================== Media register + upload ====================

interface RegisterUploadResponse {
    value: {
        uploadMechanism: {
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
                uploadUrl: string;
            };
        };
        asset: string;
    };
}

/**
 * Register an upload, PUT the binary, and return the resulting `asset` URN.
 * `recipe` is `feedshare-image` or `feedshare-video`.
 */
async function registerAndUpload(env: Env, bytes: ArrayBuffer, recipe: 'feedshare-image' | 'feedshare-video'): Promise<string> {
    const { token, author } = requireLinkedInConfig(env);

    // 1) Register the upload.
    const registerRes = await fetch(`${LINKEDIN_API}/assets?action=registerUpload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
            registerUploadRequest: {
                recipes: [`urn:li:digitalmediaRecipe:${recipe}`],
                owner: author,
                serviceRelationships: [
                    { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
                ],
            },
        }),
    });

    if (!registerRes.ok) {
        throw await linkedInErrorFromResponse(registerRes, 'registerUpload failed');
    }

    const registered = await registerRes.json() as RegisterUploadResponse;
    const uploadUrl = registered.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    const asset = registered.value?.asset;
    if (!uploadUrl || !asset) {
        throw new LinkedInPublishError('registerUpload returned no uploadUrl/asset');
    }
    console.log(`[linkedin] registered ${recipe} upload, asset=${asset}, bytes=${bytes.byteLength}`);

    // 2) Upload the binary to the returned uploadUrl (authenticated).
    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: bytes,
    });
    if (!uploadRes.ok) {
        throw await linkedInErrorFromResponse(uploadRes, 'media binary upload failed');
    }
    console.log(`[linkedin] uploaded ${recipe} binary ok (status ${uploadRes.status}), asset=${asset}`);

    return asset;
}

/** Register + upload an image; returns the digitalmediaAsset URN to attach to a post. */
export async function uploadImageToLinkedIn(env: Env, bytes: ArrayBuffer): Promise<string> {
    return registerAndUpload(env, bytes, 'feedshare-image');
}

/** Register + upload a video; returns the digitalmediaAsset URN to attach to a post. */
export async function uploadVideoToLinkedIn(env: Env, bytes: ArrayBuffer): Promise<string> {
    return registerAndUpload(env, bytes, 'feedshare-video');
}

/**
 * Upload ONE media item (by R2 key) to LinkedIn and return its asset URN. The single source of truth
 * for the LinkedIn upload encoding, shared by BOTH the publish path (resolveLinkedInMedia in
 * core/publish.ts) and the warm engine (core/media-prewarm.ts). Reads the R2 object first, then
 * registers+uploads via the photo/video helper. Throws if the R2 object is missing or any upload step
 * fails. The returned URN is durable (no short expiry), reusable across posts.
 */
export async function uploadLinkedInMediaItem(env: Env, mediaKey: string, mediaKind: 'photo' | 'video'): Promise<string> {
    const r2 = await env.IMAGES.get(mediaKey);
    if (!r2) throw new LinkedInPublishError(`Media missing from storage: ${mediaKey}`);
    const bytes = await r2.arrayBuffer();
    return mediaKind === 'video'
        ? uploadVideoToLinkedIn(env, bytes)
        : uploadImageToLinkedIn(env, bytes);
}

// ==================== Post creation ====================

/**
 * Create a member share via the UGC Posts API and return the post URN + a viewable URL.
 * `commentary` is the post body (trimmed to LINKEDIN_MAX_COMMENTARY by the caller); `media`
 * carries the share-media category and any already-registered asset URNs.
 */
export async function postToLinkedIn(
    env: Env,
    commentary: string,
    media: LinkedInMedia
): Promise<{ post_urn: string; url: string }> {
    const { token, author } = requireLinkedInConfig(env);

    const shareContent: Record<string, unknown> = {
        shareCommentary: { text: commentary.slice(0, LINKEDIN_MAX_COMMENTARY) },
        shareMediaCategory: media.category,
    };
    if (media.category !== 'NONE' && media.assetUrns.length > 0) {
        shareContent.media = media.assetUrns.map(urn => ({ status: 'READY', media: urn }));
    }

    const body = {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    console.log(`[linkedin] creating ugcPost author=${author} category=${media.category} mediaCount=${media.assetUrns.length} commentaryLen=${commentary.length}`);

    const response = await fetch(`${LINKEDIN_API}/ugcPosts`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw await linkedInErrorFromResponse(response, 'ugcPosts create failed');
    }

    // The new post URN is returned in the X-RestLi-Id header; fall back to the body `id`.
    let postUrn = response.headers.get('X-RestLi-Id') || response.headers.get('x-restli-id') || '';
    if (!postUrn) {
        const data = await response.json().catch(() => ({})) as { id?: string };
        postUrn = data.id || '';
    }
    if (!postUrn) {
        throw new LinkedInPublishError('ugcPosts succeeded but returned no post URN');
    }

    console.log(`[linkedin] ugcPost created: ${postUrn}`);
    return { post_urn: postUrn, url: `https://www.linkedin.com/feed/update/${postUrn}` };
}
