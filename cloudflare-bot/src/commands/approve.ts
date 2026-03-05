import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { respond } from '../core/respond';
import { getAllDrafts } from '../data/db';
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
			try {
				const result = await publishDraft(env, chatId, draft);
				results.push(t(lang, 'actions.publishedDraft').replace('{number}', String(draft.pr_number)).replace('{url}', result.url));
			} catch (error) {
				results.push(t(lang, 'actions.publishFailed').replace('{number}', String(draft.pr_number)));
			}
		}

		await respond(env, chatId, renderSuccess(t(lang, 'actions.publishedCount').replace('{count}', String(drafts.length)).replace('{results}', results.join('\n')), lang));
	} catch (error) {
		await respond(env, chatId, renderError(t(lang, 'actions.publishFailedGeneric'), lang));
	}
}
