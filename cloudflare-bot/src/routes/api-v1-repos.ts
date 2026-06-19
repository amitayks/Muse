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

    // GET /api/v1/repos/search?q= — inline GitHub repo search scoped to GITHUB_OWNER
    if (path === '/repos/search' && method === 'GET') {
        return searchRepos(ctx);
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

    // POST /api/v1/repos/:id/bootstrap-overview — (re)bootstrap the project overview.
    // Reuses the SAME logic the bot's `config:rebootstrap` callback runs
    // (overviewCommand): fetch README + recent merged PRs, extract via Gemini,
    // upsert into repo_overviews. Returns the freshly persisted overview.
    if (match[3] === 'bootstrap-overview' && method === 'POST') {
        return bootstrapOverview(ctx, repoId);
    }

    // PUT /api/v1/repos/:id/overview — persist an edited overview
    // { summary?, key_features?, visual_theme?, tech_stack?, target_audience?, brand_voice? }
    if (match[3] === 'overview' && method === 'PUT') {
        return saveOverview(ctx, repoId);
    }

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

/**
 * POST /api/v1/repos/:id/bootstrap-overview
 * (Re)bootstrap the project overview — same flow as the bot's overviewCommand
 * (config:rebootstrap callback). Returns the persisted overview.
 */
async function bootstrapOverview(ctx: ApiContext, repoId: string): Promise<Response> {
    const { env, chatId } = ctx;

    const { getRepo, getRepoOverview, upsertRepoOverview } = await import('../data/db');
    const repo = await getRepo(env, repoId, chatId);
    if (!repo) return errorResponse('Repo not found', 404);

    // GitHub + Gemini credentials live on the user's hydrated env.
    const { hydrateEnv } = await import('../data/user-keys');
    const userEnv = await hydrateEnv(env, chatId);

    try {
        const { fetchRepoReadme, fetchRecentMergedPRs } = await import('../integrations/github');
        const { extractRepoOverview } = await import('../ai/gemini');
        const { getUserLanguage } = await import('../data/user-settings-db');

        const lang = await getUserLanguage(env, chatId);
        const [readmeText, prSummaries] = await Promise.all([
            fetchRepoReadme(userEnv, repo.owner, repo.repo),
            fetchRecentMergedPRs(userEnv, repo.owner, repo.repo, 10),
        ]);

        const overview = await extractRepoOverview(userEnv, readmeText, prSummaries, chatId, lang as string);
        await upsertRepoOverview(env, repoId, overview);

        // Return the persisted shape (RepoOverview with metadata) for the UI.
        const saved = await getRepoOverview(env, repoId, chatId);
        return jsonResponse({ success: true, overview: saved });
    } catch (err) {
        console.error('[repos/bootstrap-overview] failed:', err);
        const msg = err instanceof Error ? err.message : 'Failed to bootstrap overview';
        return errorResponse(msg, 500);
    }
}

/**
 * PUT /api/v1/repos/:id/overview — persist an edited overview.
 * Accepts the bot-editable fields (summary, key_features, visual_theme, plus
 * tech_stack/target_audience/brand_voice) and applies them as field patches.
 */
async function saveOverview(ctx: ApiContext, repoId: string): Promise<Response> {
    const { env, chatId, request } = ctx;

    const { getRepo, getRepoOverview, upsertRepoOverview } = await import('../data/db');
    const repo = await getRepo(env, repoId, chatId);
    if (!repo) return errorResponse('Repo not found', 404);

    const existing = await getRepoOverview(env, repoId, chatId);
    if (!existing) return errorResponse('No overview to edit — bootstrap one first', 404);

    const body = await request.json() as {
        summary?: string;
        key_features?: string[];
        visual_theme?: string;
        tech_stack?: string;
        target_audience?: string;
        brand_voice?: string;
    };

    // Full-replace edited fields over the existing overview (an edit, not an
    // incremental patch). Only provided fields are overwritten; others persist.
    await upsertRepoOverview(env, repoId, {
        summary: body.summary !== undefined ? body.summary : existing.summary,
        tech_stack: body.tech_stack !== undefined ? body.tech_stack : existing.tech_stack,
        key_features: body.key_features !== undefined ? body.key_features : existing.key_features,
        target_audience: body.target_audience !== undefined ? body.target_audience : existing.target_audience,
        brand_voice: body.brand_voice !== undefined ? body.brand_voice : existing.brand_voice,
        visual_theme: body.visual_theme !== undefined ? body.visual_theme : existing.visual_theme,
        recent_changes: existing.recent_changes,
    });

    const overview = await getRepoOverview(env, repoId, chatId);
    return jsonResponse({ success: true, overview });
}

/** GET /api/v1/repos/search?q= — search accessible GitHub repos scoped to GITHUB_OWNER */
async function searchRepos(ctx: ApiContext): Promise<Response> {
    const { env, request } = ctx;
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();

    // Empty query → empty results, no GitHub call.
    if (!q) return jsonResponse({ results: [] });

    try {
        const { searchOwnerRepos } = await import('../integrations/github');
        const results = await searchOwnerRepos(env, q);
        return jsonResponse({ results });
    } catch (err) {
        const { GitHubTokenMissingError } = await import('../integrations/github');
        if (err instanceof GitHubTokenMissingError) {
            return errorResponse('GitHub token not configured', 500);
        }
        console.error('[repos/search] failed:', err);
        return jsonResponse({ results: [] });
    }
}
