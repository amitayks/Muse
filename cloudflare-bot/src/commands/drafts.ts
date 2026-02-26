import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { respond } from '../core/respond';
import { renderDraftCategories } from '../views';

export async function draftsCommand(ctx: HandlerContext) {
	const lang = (ctx.lang || 'en') as Lang;
	const view = await renderDraftCategories(ctx.env, ctx.chatId, lang);
	await respond(ctx.env, ctx.chatId, view, { viewName: 'drafts', context: null });
}
