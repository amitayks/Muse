/**
 * /api/v1/prompts — Prompt CRUD (wraps existing prompts module)
 */

import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

type PromptType = 'work-progress' | 'refine' | 'quote' | 'identity';
const USER_EDITABLE_TYPES: PromptType[] = ['work-progress', 'refine', 'quote', 'identity'];

export async function handlePromptsApi(ctx: ApiContext, path: string): Promise<Response> {
    const { env, chatId, request } = ctx;
    const method = request.method;

    const { getPrompt, saveUserPrompt, deleteUserPrompt, countStalePrompts, getUserPromptStatus } = await import('../ai/prompts');
    const { getUser } = await import('../data/user-db');
    const user = await getUser(env, chatId);
    const lang = (user?.language || 'en') as 'en' | 'he';

    // GET /api/v1/prompts — list all editable prompts with status
    if (path === '/prompts' && method === 'GET') {
        const prompts = await Promise.all(
            USER_EDITABLE_TYPES.map(async type => {
                const status = await getUserPromptStatus(env, chatId, type, lang);
                return { type, ...status };
            })
        );
        const staleCount = await countStalePrompts(env, chatId);
        return jsonResponse({ prompts, staleCount });
    }

    // Extract type: /prompts/:type
    const match = path.match(/^\/prompts\/([^/]+)$/);
    if (!match) return errorResponse('Not Found', 404);
    const promptType = match[1] as PromptType;

    // GET /api/v1/prompts/:type
    if (method === 'GET') {
        const prompt = await getPrompt(env, chatId, promptType, lang);
        return jsonResponse({ type: promptType, content: prompt });
    }

    // PUT /api/v1/prompts/:type
    if (method === 'PUT') {
        const body = await request.json() as { content: string };
        if (!body.content) return errorResponse('content is required', 400);
        await saveUserPrompt(env, chatId, promptType, lang, body.content);
        return jsonResponse({ success: true });
    }

    // DELETE /api/v1/prompts/:type — reset to default
    if (method === 'DELETE') {
        await deleteUserPrompt(env, chatId, promptType, lang);
        const prompt = await getPrompt(env, chatId, promptType, lang);
        return jsonResponse({ success: true, content: prompt });
    }

    return errorResponse('Not Found', 404);
}
