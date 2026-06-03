import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { respond } from '../core/respond';
import { renderAddRepo } from '../views';
import { addRepoInput } from '../inputs/add-repo';

export async function watchCommand(ctx: HandlerContext) {
	const lang = (ctx.lang || 'en') as Lang;
	if (ctx.args) {
		await addRepoInput({ ...ctx, text: ctx.args, context: {} });
	} else {
		await respond(ctx.env, ctx.chatId, renderAddRepo(lang), {
			viewName: 'add_repo',
			context: { awaiting_input: 'add_repo' },
		});
	}
}
