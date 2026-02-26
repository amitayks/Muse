/**
 * Add Twitter Account Input Handler
 *
 * Processes @username input when awaiting_input='add_account'.
 * Validates the username via X API lookup, creates the account record.
 */

import type { HandlerContext, InputHandler } from '../core/router';
import type { ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { cancelRow } from '../ui/components';
import { createTwitterAccount, updateChatState } from '../services/db';
import { renderAccountsList } from '../views/accounts';
import { sendMessage } from '../services/telegram';
import { respond } from '../core/respond';

export const addTwitterAccountInput: InputHandler = async (
    ctx: HandlerContext & { text: string; context: ChatContext }
) => {
    const { env, chatId } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;
    const username = ctx.text.trim().replace(/^@/, '');

    if (!username || username.length < 1 || username.length > 15 || !/^[a-zA-Z0-9_]+$/.test(username)) {
        await sendMessage(env, chatId,
            `${t(lang, 'addAccount.invalidUsername')}\n\n${t(lang, 'addAccount.invalidUsernameMsg').replace('{username}', username)}`,
            [cancelRow('view:accounts', lang)]
        );
        return;
    }

    try {
        // Try to look up the user via X API
        const { lookupUserByUsername } = await import('../services/x');
        let userId: string | undefined;
        let displayName: string | undefined;

        try {
            const user = await lookupUserByUsername(env, username);
            if (user) {
                userId = user.id;
                displayName = user.name;
            }
        } catch (error) {
            console.error('[add-account] X API lookup failed:', error);
            // Continue without user_id — poller will resolve later
        }

        const accountId = await createTwitterAccount(env, chatId, {
            username: username.toLowerCase(),
            user_id: userId,
            display_name: displayName,
        });

        // Clear awaiting_input and show accounts list
        await updateChatState(env, chatId, {
            current_view: 'accounts',
            context: null,
        });

        const view = await renderAccountsList(env, chatId, 0, lang);
        await respond(env, chatId, view, { viewName: 'accounts', context: null });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('UNIQUE constraint')) {
            await sendMessage(env, chatId,
                `${t(lang, 'addAccount.alreadyFollowing')}\n\n${t(lang, 'addAccount.alreadyFollowingMsg').replace('{username}', username)}`,
                [[{ text: t(lang, 'actions.btnAccounts'), callback_data: 'view:accounts' }]]
            );
            return;
        }
        console.error('[add-account] Error:', error);
        await sendMessage(env, chatId,
            t(lang, 'addAccount.failedToAddAccount'),
            [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]]
        );
    }
};
