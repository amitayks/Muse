/**
 * Twitter Account Actions — follow, unfollow, delete, bootstrap persona
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { updateChatState, getTwitterAccount, updateTwitterAccount, deleteTwitterAccount } from '../data/db';
import { editMessage } from '../integrations/telegram';
import { renderAccountDetail, renderAddAccount, renderDeleteAccountConfirm, renderAccountsList } from '../views/accounts';
import { renderError } from '../views';

export async function accountDetailAction(ctx: HandlerContext & { value: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    await updateChatState(ctx.env, ctx.chatId, {
        current_view: 'account',
        context: { selected_account_id: ctx.value },
    });
    return renderAccountDetail(ctx.env, ctx.chatId, ctx.value, lang);
}

export async function addAccountAction(ctx: HandlerContext): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    await updateChatState(ctx.env, ctx.chatId, {
        current_view: 'add_account',
        context: { awaiting_input: 'add_account' },
    });
    return renderAddAccount(lang);
}

export async function followAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const accountId = ctx.extra!;
    await updateTwitterAccount(ctx.env, accountId, ctx.chatId, { is_watching: 1 });
    return renderAccountDetail(ctx.env, ctx.chatId, accountId, lang);
}

export async function unfollowAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const accountId = ctx.extra!;
    await updateTwitterAccount(ctx.env, accountId, ctx.chatId, { is_watching: 0 });
    return renderAccountDetail(ctx.env, ctx.chatId, accountId, lang);
}

export async function deleteAccountAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const accountId = ctx.extra!;
    return renderDeleteAccountConfirm(ctx.env, ctx.chatId, accountId, lang);
}

export async function confirmDeleteAccountAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const accountId = ctx.extra!;
    const account = await getTwitterAccount(ctx.env, accountId, ctx.chatId);
    if (!account) {
        return renderError('Account not found.', lang);
    }

    await deleteTwitterAccount(ctx.env, accountId, ctx.chatId);
    return {
        text: `${t(lang, 'actions.accountDeleted')}\n\n${t(lang, 'actions.accountDeletedMsg').replace('{username}', account.username)}`,
        keyboard: [[{ text: t(lang, 'actions.btnAccounts'), callback_data: 'view:accounts' }]],
    };
}

export async function bootstrapAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const accountId = ctx.extra!;
    const account = await getTwitterAccount(ctx.env, accountId, ctx.chatId);
    if (!account) {
        return renderError('Account not found.', lang);
    }

    // Show loading state immediately
    await editMessage(
        ctx.env, ctx.chatId, ctx.messageId!,
        `${t(lang, 'actions.analyzingAccount').replace('{username}', account.username)}\n\n${t(lang, 'actions.analyzingAccountDesc')}`,
        [],
    );

    try {
        const { bootstrapPersona } = await import('../ai/persona-bootstrap');
        const success = await bootstrapPersona(ctx.env, accountId, ctx.chatId);

        if (success) {
            return renderAccountDetail(ctx.env, ctx.chatId, accountId, lang);
        } else {
            return renderError('Failed to bootstrap persona. Please try again.', lang);
        }
    } catch (error) {
        console.error('[bootstrap] Error:', error);
        return renderError('Persona bootstrap failed. Please try again later.', lang);
    }
}
