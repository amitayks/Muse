/**
 * Repost Follow Actions — Follow/no-follow prompt after manual repost generation
 *
 * Handles: rp_follow:USERNAME, rp_no_follow:MSG_ID
 */

import type { ActionHandler } from '../core/router';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { createTwitterAccount } from '../data/db';
import { editMessage } from '../integrations/telegram';

/** Follow the account — create twitter account entry */
export const rpFollowAction: ActionHandler = async (ctx) => {
    const lang = (ctx.lang || 'en') as Lang;
    const username = ctx.value;

    try {
        await createTwitterAccount(ctx.env, ctx.chatId, { username });

        if (ctx.messageId) {
            await editMessage(ctx.env, ctx.chatId, ctx.messageId,
                t(lang, 'actions.nowFollowing').replace('{username}', username)
            );
        }
    } catch (error) {
        console.error('[rp_follow] Failed to follow:', error);
        if (ctx.messageId) {
            await editMessage(ctx.env, ctx.chatId, ctx.messageId,
                t(lang, 'actions.followFailed').replace('{username}', username)
            );
        }
    }
    return;
};

/** No follow — dismiss the prompt */
export const rpNoFollowAction: ActionHandler = async (ctx) => {
    const lang = (ctx.lang || 'en') as Lang;
    if (ctx.messageId) {
        await editMessage(ctx.env, ctx.chatId, ctx.messageId,
            t(lang, 'actions.noFollowDismiss')
        );
    }
    return;
};
