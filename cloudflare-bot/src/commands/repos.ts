import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { respond } from '../core/respond';
import { renderReposList } from '../views';

export async function reposCommand(ctx: HandlerContext) {
	const lang = (ctx.lang || 'en') as Lang;
	const view = await renderReposList(ctx.env, ctx.chatId, 0, lang);
	await respond(ctx.env, ctx.chatId, view, { viewName: 'repos', context: null });
}
