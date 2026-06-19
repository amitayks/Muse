import type { Env } from '../types';
import { verifyAdminSecret, secureJsonResponse, logInfo } from '../infra/security';

export async function handleTestGenerate(request: Request, url: URL, env: Env): Promise<Response> {
    if (!verifyAdminSecret(request, env)) {
        return secureJsonResponse({ error: 'Unauthorized' }, 401);
    }
    const sha = url.searchParams.get('sha');
    if (!sha) {
        return secureJsonResponse({ error: 'Missing ?sha= parameter' }, 400);
    }

    const { getContentSource } = await import('../integrations/github');
    const { generateContent } = await import('../ai/gemini');

    const steps: Record<string, unknown> = {};

    try {
        logInfo('Test: Fetching content source for SHA:', sha);
        const source = await getContentSource(env, sha);
        steps.contentSource = {
            type: source.type,
            commitMessages: source.data.commitMessages,
            fileNames: source.data.fileNames,
            title: source.data.title,
        };

        logInfo('Test: Generating content via Gemini...');
        const result = await generateContent(env, source);
        steps.generatedContent = result.content;
        steps.overviewUpdates = result.overviewUpdates;

        // Image generation is now a per-slot action on a saved draft (ai/tweet-image.ts),
        // not derivable from raw content here — content generation is what this route tests.
        return secureJsonResponse({ success: true, sha, steps });
    } catch (error) {
        return secureJsonResponse({
            success: false,
            sha,
            error: error instanceof Error ? error.message : String(error),
            steps,
        }, 500);
    }
}
