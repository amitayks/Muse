/**
 * /api/v1/commits/* — Commit resolution for the Composer's `[+ commit]` flow.
 *
 * GET /api/v1/commits/resolve?sha=<partial>
 *   Resolves a (possibly partial) commit SHA to its repo + details via the
 *   existing `getContentSource` (search-commits → events feed → repo scan,
 *   scoped by GITHUB_OWNER/GITHUB_TOKEN). Returns the metadata the Composer
 *   needs to preview the source before generating. No draft is created and no
 *   bot sync runs — this is a pure read.
 */

import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

export async function handleCommitsApi(ctx: ApiContext, path: string): Promise<Response> {
    const { env, chatId, request } = ctx;

    // GET /api/v1/commits/resolve?sha=<partial>
    if (path === '/commits/resolve' && request.method === 'GET') {
        const url = new URL(request.url);
        const sha = (url.searchParams.get('sha') || '').trim();

        if (!sha) return errorResponse('sha is required', 400);
        // Partial SHAs allowed — resolved server-side. Reject obvious garbage.
        if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
            return errorResponse('Invalid commit SHA format', 400);
        }

        // X/GitHub credentials live on the user's hydrated env.
        const { hydrateEnv } = await import('../data/user-keys');
        const userEnv = await hydrateEnv(env, chatId);

        try {
            const { getContentSource } = await import('../integrations/github');
            const source = await getContentSource(userEnv, sha);
            // Both PRData and CommitData expose `title` + `body`.
            const data = source.data as { title: string; body?: string; sha?: string };
            return jsonResponse({
                repo: source.repo ?? null,
                sha: data.sha ?? sha,
                title: data.title,
                summary: data.body ?? '',
            });
        } catch (err) {
            const { GitHubTokenMissingError } = await import('../integrations/github');
            if (err instanceof GitHubTokenMissingError) {
                return errorResponse('GitHub token not configured', 500);
            }
            const msg = err instanceof Error ? err.message : String(err);
            if (/not found in any accessible repo/i.test(msg)) {
                return errorResponse(`Could not resolve commit ${sha} in any accessible repo`, 404);
            }
            console.error('[commits/resolve] failed:', err);
            return errorResponse('Failed to resolve commit', 500);
        }
    }

    return errorResponse('Not Found', 404);
}
