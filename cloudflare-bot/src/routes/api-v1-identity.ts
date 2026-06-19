/**
 * /api/v1/identity/* — Identity Document analysis for Settings → Identity.
 *
 * POST /api/v1/identity/reanalyze
 *   Re-runs the identity analysis (reuses the bot's analyzeIdentity flow): fetch
 *   recent tweets via X, regenerate the Identity Document via the /who-am-i skill,
 *   persist it in user_prompts, and return the new document. Mirrors the bot's
 *   identity_lang:reanalyze / settings reanalyze_identity logic.
 *
 *   Viewing/editing the document itself uses the existing /api/v1/prompts route
 *   (prompt type 'identity'); this endpoint only handles the (re)analysis.
 */

import type { ApiContext } from './api-v1';
import { jsonResponse, errorResponse } from './api-v1';

export async function handleIdentityApi(ctx: ApiContext, path: string): Promise<Response> {
    const { env, chatId, request } = ctx;

    if (path === '/identity/reanalyze' && request.method === 'POST') {
        const { getUser } = await import('../data/user-db');
        const user = await getUser(env, chatId);

        // Identity analysis needs the user's X account connected.
        if (user?.has_x !== 1) {
            return errorResponse('X account required for identity analysis — connect X in Settings', 400);
        }

        const lang = user?.language || 'en';

        const { hydrateEnv } = await import('../data/user-keys');
        const userEnv = await hydrateEnv(env, chatId);

        try {
            const { analyzeIdentity } = await import('../ai/identity');
            const result = await analyzeIdentity(userEnv, chatId, lang);
            if (!result) {
                return errorResponse('Analysis failed — no tweets found or an error occurred', 502);
            }
            return jsonResponse({
                success: true,
                document: result.document,
                tweetCount: result.tweetCount,
            });
        } catch (err) {
            const { XReconnectError } = await import('../integrations/x');
            if (err instanceof XReconnectError) {
                return errorResponse('X connection expired — reconnect your X account in Settings', 400);
            }
            console.error('[identity/reanalyze] failed:', err);
            return errorResponse('Identity re-analysis failed — please try again later', 500);
        }
    }

    return errorResponse('Not Found', 404);
}
