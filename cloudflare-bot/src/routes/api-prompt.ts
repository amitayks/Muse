/**
 * API route for prompt CRUD — authenticated via Telegram initData.
 *
 * GET    /api/prompt?type=content&lang=en  → read prompt
 * POST   /api/prompt  { type, lang, content }  → save custom prompt
 * DELETE /api/prompt?type=content&lang=en  → reset to default
 */

import type { Env } from '../types';
import { validateInitData } from '../services/telegram-auth';
import {
    getPrompt,
    getUserPromptStatus,
    saveUserPrompt,
    deleteUserPrompt,
    getDefaultPromptVersion,
    getDefaultPromptText,
    countStalePrompts,
    acknowledgeStalePrompt,
    pushDefaultPrompt,
    USER_EDITABLE_PROMPTS,
    ADMIN_EDITABLE_PROMPTS,
    ALL_PROMPTS,
    type PromptType,
} from '../services/prompts';
import { isAdmin } from '../services/security';

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        },
    });
}

/**
 * Authenticate the request via initData in the Authorization header.
 * Returns chatId on success, or an error Response.
 */
async function authenticate(request: Request, env: Env): Promise<string | Response> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('tma ')) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const initData = authHeader.slice(4);
    const result = await validateInitData(initData, env.TELEGRAM_BOT_TOKEN);

    if (!result.valid || !result.chatId) {
        const error = result.expired ? 'Session expired' : 'Unauthorized';
        return jsonResponse({ error }, 401);
    }

    return result.chatId;
}

function isUserEditableType(type: string): type is PromptType {
    return USER_EDITABLE_PROMPTS.includes(type as PromptType);
}

function isAdminEditableType(type: string): type is PromptType {
    return ADMIN_EDITABLE_PROMPTS.includes(type as PromptType);
}

function isAnyPromptType(type: string): type is PromptType {
    return ALL_PROMPTS.includes(type as PromptType);
}

export async function handlePromptApi(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return jsonResponse(null, 204);
    }

    const authResult = await authenticate(request, env);
    if (authResult instanceof Response) return authResult;
    const chatId = authResult;

    const url = new URL(request.url);

    if (request.method === 'GET') {
        const type = url.searchParams.get('type');
        const lang = url.searchParams.get('lang') || 'en';
        const wantDefault = url.searchParams.get('default') === 'true';

        if (!type) {
            return jsonResponse({ error: 'Missing type parameter' }, 400);
        }
        if (!isUserEditableType(type)) {
            return jsonResponse({ error: 'Invalid prompt type' }, 400);
        }

        // If ?default=true, return only the default prompt text
        if (wantDefault) {
            const defaultContent = await getDefaultPromptText(env, type, lang);
            return jsonResponse({ content: defaultContent });
        }

        const [content, status, defaultVersion] = await Promise.all([
            getPrompt(env, chatId, type, lang),
            getUserPromptStatus(env, chatId, type, lang),
            getDefaultPromptVersion(env, type, lang),
        ]);

        return jsonResponse({
            content,
            isCustom: status.isCustom,
            isStale: status.isStale,
            defaultVersion,
        });
    }

    if (request.method === 'POST') {
        let body: { type?: string; lang?: string; content?: string };
        try {
            body = await request.json() as typeof body;
        } catch {
            return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }

        const { type, lang = 'en', content } = body;

        if (!type) {
            return jsonResponse({ error: 'Missing type parameter' }, 400);
        }
        if (!isUserEditableType(type)) {
            return jsonResponse({ error: 'This prompt type is not user-editable' }, 403);
        }
        if (!content || content.trim().length === 0) {
            return jsonResponse({ error: 'Content cannot be empty' }, 400);
        }

        await saveUserPrompt(env, chatId, type, lang, content);
        return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
        const type = url.searchParams.get('type');
        const lang = url.searchParams.get('lang') || 'en';

        if (!type) {
            return jsonResponse({ error: 'Missing type parameter' }, 400);
        }
        if (!isUserEditableType(type)) {
            return jsonResponse({ error: 'Invalid prompt type' }, 400);
        }

        await deleteUserPrompt(env, chatId, type, lang);

        // Return the default prompt text
        const content = await getPrompt(env, chatId, type, lang);
        return jsonResponse({ success: true, content });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
}

/**
 * GET /api/prompt/stale-count — returns count of stale prompts for the user.
 */
export async function handleStaleCountApi(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return jsonResponse(null, 204);

    const authResult = await authenticate(request, env);
    if (authResult instanceof Response) return authResult;
    const chatId = authResult;

    if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const count = await countStalePrompts(env, chatId);
    return jsonResponse({ count });
}

/**
 * POST /api/prompt/acknowledge — update based_on_version without changing content.
 */
export async function handleAcknowledgeApi(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return jsonResponse(null, 204);

    const authResult = await authenticate(request, env);
    if (authResult instanceof Response) return authResult;
    const chatId = authResult;

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    let body: { type?: string; lang?: string };
    try {
        body = await request.json() as typeof body;
    } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { type, lang = 'en' } = body;
    if (!type || !isUserEditableType(type)) {
        return jsonResponse({ error: 'Invalid prompt type' }, 400);
    }

    await acknowledgeStalePrompt(env, chatId, type, lang);
    return jsonResponse({ success: true });
}

/**
 * Admin prompt API — handles GET, POST, and POST /push for admin prompt management.
 * All routes require isAdmin(chatId, env).
 */
export async function handleAdminPromptApi(request: Request, env: Env, isPush: boolean): Promise<Response> {
    if (request.method === 'OPTIONS') return jsonResponse(null, 204);

    const authResult = await authenticate(request, env);
    if (authResult instanceof Response) return authResult;
    const chatId = authResult;

    // Admin check
    if (!isAdmin(chatId, env)) {
        return jsonResponse({ error: 'Admin access required' }, 403);
    }

    const url = new URL(request.url);

    // POST /api/admin/prompt/push — push as new default
    if (isPush) {
        if (request.method !== 'POST') {
            return jsonResponse({ error: 'Method not allowed' }, 405);
        }

        let body: { type?: string; lang?: string; content?: string };
        try {
            body = await request.json() as typeof body;
        } catch {
            return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }

        const { type, lang = 'en', content } = body;
        if (!type || !isAdminEditableType(type)) {
            return jsonResponse({ error: 'Invalid prompt type' }, 400);
        }
        if (!content || content.trim().length === 0) {
            return jsonResponse({ error: 'Content cannot be empty' }, 400);
        }

        const newVersion = await pushDefaultPrompt(env, chatId, type, lang, content);
        return jsonResponse({ success: true, newVersion });
    }

    // GET /api/admin/prompt — read any prompt type
    if (request.method === 'GET') {
        const type = url.searchParams.get('type');
        const lang = url.searchParams.get('lang') || 'en';

        if (!type || !isAdminEditableType(type)) {
            return jsonResponse({ error: 'Invalid prompt type' }, 400);
        }

        const [content, status, defaultVersion] = await Promise.all([
            getPrompt(env, chatId, type, lang),
            getUserPromptStatus(env, chatId, type, lang),
            getDefaultPromptVersion(env, type, lang),
        ]);

        return jsonResponse({
            content,
            isCustom: status.isCustom,
            isStale: status.isStale,
            defaultVersion,
        });
    }

    // POST /api/admin/prompt — save admin personal prompt for any type
    if (request.method === 'POST') {
        let body: { type?: string; lang?: string; content?: string };
        try {
            body = await request.json() as typeof body;
        } catch {
            return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }

        const { type, lang = 'en', content } = body;
        if (!type || !isAdminEditableType(type)) {
            return jsonResponse({ error: 'Invalid prompt type' }, 400);
        }
        if (!content || content.trim().length === 0) {
            return jsonResponse({ error: 'Content cannot be empty' }, 400);
        }

        await saveUserPrompt(env, chatId, type, lang, content);
        return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
}
