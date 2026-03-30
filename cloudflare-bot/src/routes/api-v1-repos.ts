/**
 * /api/v1/repos/* — Repository management
 */

import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

export async function handleReposApi(ctx: ApiContext, path: string): Promise<Response> {
    const { env, chatId, request } = ctx;
    const method = request.method;

    // GET /api/v1/repos
    if (path === '/repos' && method === 'GET') {
        const { getRepos } = await import('../data/db');
        const repos = await getRepos(env, chatId);
        return jsonResponse({ repos });
    }

    // Extract repo ID: /repos/:id
    const match = path.match(/^\/repos\/([^/]+)(\/(.+))?$/);
    if (!match) {
        // POST /api/v1/repos (add new)
        if (path === '/repos' && method === 'POST') {
            const body = await request.json() as { owner: string; repo: string };
            if (!body.owner || !body.repo) return errorResponse('owner and repo are required', 400);

            const { createRepo } = await import('../data/db');
            const id = await createRepo(env, chatId, { owner: body.owner, repo: body.repo });
            return jsonResponse({ success: true, id });
        }
        return errorResponse('Not Found', 404);
    }

    const repoId = match[1];

    // GET /api/v1/repos/:id/recent-prs
    if (match[3] === 'recent-prs' && method === 'GET') {
        const { getRepo } = await import('../data/db');
        const repo = await getRepo(env, repoId, chatId);
        if (!repo) return errorResponse('Repo not found', 404);
        try {
            const { hydrateEnv } = await import('../data/user-keys');
            const userEnv = await hydrateEnv(env, chatId);
            const { fetchRecentMergedPRs } = await import('../integrations/github');
            const prs = await fetchRecentMergedPRs(userEnv, repo.owner, repo.repo, 10);
            return jsonResponse({ prs });
        } catch (err) {
            return jsonResponse({ prs: [], error: err instanceof Error ? err.message : 'Failed to fetch PRs' });
        }
    }

    // GET /api/v1/repos/:id
    if (!match[3] && method === 'GET') {
        const { getRepo, getRepoOverview } = await import('../data/db');
        const [repo, overview] = await Promise.all([
            getRepo(env, repoId, chatId),
            getRepoOverview(env, repoId),
        ]);
        if (!repo) return errorResponse('Repo not found', 404);
        return jsonResponse({ ...repo, overview });
    }

    // PUT /api/v1/repos/:id
    if (!match[3] && method === 'PUT') {
        const body = await request.json() as Record<string, unknown>;
        const { updateRepo } = await import('../data/db');
        await updateRepo(env, repoId, chatId, body as any);
        return jsonResponse({ success: true });
    }

    // DELETE /api/v1/repos/:id
    if (!match[3] && method === 'DELETE') {
        const { deleteRepo } = await import('../data/db');
        await deleteRepo(env, repoId, chatId);
        return jsonResponse({ success: true });
    }

    return errorResponse('Not Found', 404);
}
