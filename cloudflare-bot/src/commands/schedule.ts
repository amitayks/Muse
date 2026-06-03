import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { respond } from '../core/respond';
import { renderSchedulePrompt } from '../views';
import { scheduleInput } from '../inputs/schedule';

export async function scheduleCommand(ctx: HandlerContext) {
	const lang = (ctx.lang || 'en') as Lang;
	if (ctx.args) {
		await scheduleInput({ ...ctx, text: ctx.args, context: {} });
	} else {
		await respond(ctx.env, ctx.chatId, renderSchedulePrompt(lang), {
			viewName: 'schedule',
			context: { awaiting_input: 'schedule' },
		});
	}
}
