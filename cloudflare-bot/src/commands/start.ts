import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { respond } from '../core/respond';
import { renderHome } from '../views';

export async function startCommand(ctx: HandlerContext) {
	const lang = (ctx.lang || 'en') as Lang;
	await respond(ctx.env, ctx.chatId, await renderHome(ctx.env, ctx.chatId, lang), { viewName: 'home', context: null });
}
