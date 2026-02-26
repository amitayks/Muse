import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { respond } from '../core/respond';
import { renderGeneratePrompt } from '../views';
import { commitShaInput } from '../inputs/commit-sha';

export async function generateCommand(ctx: HandlerContext) {
	const lang = (ctx.lang || 'en') as Lang;
	if (ctx.args) {
		await commitShaInput({ ...ctx, text: ctx.args, context: {} });
	} else {
		await respond(ctx.env, ctx.chatId, renderGeneratePrompt(lang), {
			viewName: 'generate',
			context: { awaiting_input: 'commit_sha' },
		});
	}
}
