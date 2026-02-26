import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { respond } from '../core/respond';
import { renderHelp } from '../views';

export async function helpCommand(ctx: HandlerContext) {
	const lang = (ctx.lang || 'en') as Lang;
	await respond(ctx.env, ctx.chatId, renderHelp(lang), { viewName: 'help', context: null });
}
