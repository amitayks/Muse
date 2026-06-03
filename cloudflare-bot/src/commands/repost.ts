/**
 * /repost command — Enter manual repost URL input mode
 *
 * If a URL is provided inline (e.g. /repost https://x.com/...), process immediately.
 * Otherwise, prompt the user to send a URL.
 */

import type { HandlerContext } from '../core/router';
import type { Lang } from '../ui/strings';
import { respond } from '../core/respond';
import { renderRepostPrompt } from '../views/repost';
import { repostUrlInput } from '../inputs/repost-url';

export async function repostCommand(ctx: HandlerContext) {
    const lang = (ctx.lang || 'en') as Lang;
    if (ctx.args) {
        await repostUrlInput({ ...ctx, text: ctx.args, context: {} });
    } else {
        await respond(ctx.env, ctx.chatId, renderRepostPrompt(lang), {
            viewName: 'repost',
            context: { awaiting_input: 'repost_url' },
        });
    }
}
