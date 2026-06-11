import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { respond } from '../core/respond';
import { getAllDrafts, updateDraftStatus } from '../data/db';
import { publishDraft } from '../core/publish';
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

		const results: string[] = [];

		for (const draft of drafts) {
			// Mark 'publishing' before handing off (caller-owned transition; also satisfies the
			// deferred-X-video processor's status === 'publishing' idempotency guard so a video
			// draft is finalized by core/x-pending.ts rather than dropped).
			await updateDraftStatus(env, draft.id, chatId, 'publishing');
			const result = await publishDraft(env, chatId, draft);
			if (result.deferredX) {
				// Video: media uploaded, tweet-creation deferred to the every-minute cron processor,
				// which sends the final notification. Draft stays 'publishing'.
				results.push(t(lang, 'actions.publishedDraft').replace('{number}', String(draft.pr_number)).replace('{url}', result.url || '…'));
			} else if (result.success) {
				results.push(t(lang, 'actions.publishedDraft').replace('{number}', String(draft.pr_number)).replace('{url}', result.url));
			} else {
				// Full failure → restore 'approved' so the user can retry (we forced 'publishing').
				await updateDraftStatus(env, draft.id, chatId, 'approved');
				results.push(t(lang, 'actions.publishFailed').replace('{number}', String(draft.pr_number)));
			}
		}

		await respond(env, chatId, renderSuccess(t(lang, 'actions.publishedCount').replace('{count}', String(drafts.length)).replace('{results}', results.join('\n')), lang));
	} catch (error) {
		await respond(env, chatId, renderError(t(lang, 'actions.publishFailedGeneric'), lang));
	}
}
