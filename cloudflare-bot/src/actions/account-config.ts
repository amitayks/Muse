/**
 * Twitter Account Config Toggle Handler
 *
 * Handles tw_config:SETTING:ACCOUNT_ID callbacks for toggling account settings.
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { getTwitterAccount, updateTwitterAccount, parseTwitterAccountConfig } from '../data/db';
import { renderAccountDetail } from '../views/accounts';
import { renderError } from '../views';

export async function accountConfigToggleAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const setting = ctx.value;
    const accountId = ctx.extra!;

    const account = await getTwitterAccount(ctx.env, accountId, ctx.chatId);
    if (!account) {
        return renderError('Account not found.', lang);
    }

    const config = parseTwitterAccountConfig(account);
    let updated = false;

    switch (setting) {
        case 'threshold': {
            config.relevanceThreshold = config.relevanceThreshold >= 10 ? 1 : config.relevanceThreshold + 1;
            updated = true;
            break;
        }

        case 'auto_approve':
            config.autoApprove = !config.autoApprove;
            updated = true;
            break;

        case 'analyze_media':
            config.analyzeMedia = !(config.analyzeMedia !== false);
            updated = true;
            break;
    }

    if (updated) {
        await updateTwitterAccount(ctx.env, accountId, ctx.chatId, { config });
    }

    return renderAccountDetail(ctx.env, ctx.chatId, accountId, lang);
}
