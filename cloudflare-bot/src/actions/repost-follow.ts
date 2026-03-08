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
import { lookupUserByUsername } from '../integrations/x';

/** Follow the account — create twitter account entry */
export const rpFollowAction: ActionHandler = async (ctx) => {
    const lang = (ctx.lang || 'en') as Lang;
    const username = ctx.value;

    try {
        // Look up profile data to store with the account
        let userId: string | undefined;
        let displayName: string | undefined;
        let profileImageUrl: string | undefined;
        try {
            const user = await lookupUserByUsername(ctx.env, username);
            if (user) {
                userId = user.id;
                displayName = user.name;
                profileImageUrl = user.profile_image_url;
            }
        } catch {
            // Continue without profile data — poller will resolve later
        }

        await createTwitterAccount(ctx.env, ctx.chatId, {
            username,
            user_id: userId,
            display_name: displayName,
            profile_image_url: profileImageUrl,
        });

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
