/**
 * /handwrite command — enter compose mode (handwrite)
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { enterComposeMode } from '../actions/compose-init';

export async function handwriteCommand(ctx: HandlerContext): Promise<ViewResult | void> {
    const { env, chatId } = ctx;
    const lang = (ctx.lang || 'en') as Lang;

    await enterComposeMode(env, chatId, lang, { mode: 'handwrite' });

    // Return void — message already sent
}
