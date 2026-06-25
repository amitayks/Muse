import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { respond } from '../core/respond';
import { getAllDrafts, updateDraftStatus } from '../data/db';
import { enqueuePublishJob } from '../data/publish-jobs-db';
import { processPublishJobOnce, INLINE_DEADLINE_MS } from '../core/publish-jobs';
import { renderError, renderSuccess, renderPublishing } from '../views';
import { sendMessage } from '../integrations/telegram';

export async function approveCommand(ctx: HandlerContext) {
	const { env, chatId } = ctx;
	const lang = (ctx.lang || 'en') as Lang;
	try {
		const drafts = await getAllDrafts(env, chatId, 'approved');

		if (drafts.length === 0) {
			await respond(env, chatId, renderError(t(lang, 'actions.noApprovedDrafts'), lang));
			return;
		}

		const pubView = renderPublishing(drafts.length, lang);
		await sendMessage(env, chatId, pubView.text, pubView.keyboard);

		// Enqueue a durable publish job per draft; the processor (core/publish-jobs.ts) owns the
		// publish, finalization, prior-status restore, and the single per-draft notification — see
		// openspec durable-publish-queue. Kick the first chunk inline when a request context exists.
		for (const draft of drafts) {
			// Mark 'publishing' before handing off (caller-owned transition; also satisfies the
			// deferred-X-video processor's status === 'publishing' idempotency guard so a video
			// draft is finalized rather than dropped).
			await updateDraftStatus(env, draft.id, chatId, 'publishing');
			await enqueuePublishJob(env, { draftId: draft.id, chatId, lang, priorStatus: 'approved' });
			if (ctx.executionCtx) {
				ctx.executionCtx.waitUntil(processPublishJobOnce(env, draft.id, Date.now() + INLINE_DEADLINE_MS));
			}
		}

		await respond(env, chatId, renderSuccess(t(lang, 'actions.publishedCount').replace('{count}', String(drafts.length)).replace('{results}', ''), lang));
	} catch (error) {
		await respond(env, chatId, renderError(t(lang, 'actions.publishFailedGeneric'), lang));
	}
}
