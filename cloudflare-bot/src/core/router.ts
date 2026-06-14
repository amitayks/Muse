/**
 * Router — dispatch tables for commands, actions, and input handlers
 */

import type { Env, ViewResult, ChatContext } from '../types';
import type { Lang } from '../ui/strings';

// ==================== TYPES ====================

export interface HandlerContext {
    env: Env;
    chatId: string;
    messageId?: number;
    args?: string;
    executionCtx?: ExecutionContext;
    lang?: Lang;
    callbackId?: string;
}

export type CommandHandler = (ctx: HandlerContext) => Promise<ViewResult | void>;

export type ActionHandler = (
    ctx: HandlerContext & { value: string; extra?: string }
) => Promise<ViewResult | void>;

export type InputHandler = (
    ctx: HandlerContext & { text: string; context: ChatContext }
) => Promise<ViewResult | void>;

// ==================== COMMAND DISPATCH ====================

import { startCommand } from '../commands/start';
import { generateCommand } from '../commands/generate';
import { approveCommand } from '../commands/approve';
import { draftsCommand } from '../commands/drafts';
import { helpCommand } from '../commands/help';
import { scheduleCommand } from '../commands/schedule';
import { deleteCommand } from '../commands/delete';
import { reposCommand } from '../commands/repos';
import { watchCommand } from '../commands/watch';
import { handwriteCommand } from '../commands/handwrite';
import { overviewCommand } from '../commands/overview';
import { repostCommand } from '../commands/repost';

// Dev-only: test tweet card rendering via /testcard <text>
const testCardCommand: CommandHandler = async (ctx) => {
    const text = ctx.args || 'אני מסרב להאמין לטענות של אבא שלי שלישון עם הטלפון ליד הראש מזיק.';
    const { renderTweetCard, storeTweetCard } = await import('../services/tweet-card');
    const { getUser, updateOwnProfileData } = await import('../data/user-db');
    let user = await getUser(ctx.env, ctx.chatId);

    // Lazy refresh X profile if missing
    if (user && !user.own_display_name_x) {
        try {
            const { getMyProfile } = await import('../integrations/x');
            const profile = await getMyProfile(ctx.env);
            if (profile?.username) {
                await updateOwnProfileData(ctx.env, ctx.chatId, {
                    profileImageUrl: profile.profile_image_url || '',
                    username: profile.username,
                    displayName: profile.name,
                });
                user = await getUser(ctx.env, ctx.chatId);
            }
        } catch { /* continue with fallback */ }
    }

    const png = await renderTweetCard(ctx.env, {
        displayName: user?.own_display_name_x || user?.display_name || 'User',
        username: user?.own_username_x || user?.username || 'user',
        text,
        profileImageUrl: user?.own_profile_image_url,
        timestamp: new Date().toLocaleString('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true,
            month: 'short', day: 'numeric', year: 'numeric',
        }).replace(',', ' ·'),
    });
    const draftId = `test-${Date.now()}`;
    const key = await storeTweetCard(ctx.env, draftId, 0, png);
    const { sendPhoto } = await import('../integrations/telegram');
    await sendPhoto(ctx.env, ctx.chatId, `${ctx.env.WORKER_URL}/media/${key}`, '🖼 Test card');
};

export const commandHandlers: Record<string, CommandHandler> = {
    '/start': startCommand,
    '/generate': generateCommand,
    '/approve': approveCommand,
    '/drafts': draftsCommand,
    '/help': helpCommand,
    '/schedule': scheduleCommand,
    '/delete': deleteCommand,
    '/repos': reposCommand,
    '/watch': watchCommand,
    '/handwrite': handwriteCommand,
    '/overview': overviewCommand,
    '/repost': repostCommand,
    '/testcard': testCardCommand,
};

// ==================== ACTION DISPATCH ====================

import { viewChangeAction } from '../actions/view-change';
import { draftDetailAction } from '../actions/draft-detail';
import { approveAction } from '../actions/approve';
import { publishAction } from '../actions/publish';
import { publishAllAction } from '../actions/publish-all';
import { scheduleAction } from '../actions/schedule';
import { unscheduleAction } from '../actions/unschedule';
import { editAction } from '../actions/edit';
import { addRepoAction, watchAction, unwatchAction, deleteRepoAction, confirmDeleteRepoAction } from '../actions/repo-actions';
import { configToggleAction } from '../actions/config-toggle';
import { accountDetailAction, addAccountAction, followAction, unfollowAction, deleteAccountAction, confirmDeleteAccountAction, bootstrapAction } from '../actions/account-actions';
import { accountConfigToggleAction } from '../actions/account-config';
import { tweetGenerateAction } from '../actions/tweet-generate';
import { fastGenerateAction } from '../actions/fast-generate';
import { editRepostAction } from '../actions/edit-repost';
import { schedDayAction } from '../actions/schedule-day';
import { composeAction } from '../actions/compose';
import { deleteDraftAction, confirmDeleteDraftAction, cancelDeleteDraftAction } from '../actions/delete-draft';
import { listApproveAction, listPublishAction, listDeleteAction, listConfirmDeleteAction, listCancelDeleteAction } from '../actions/list-actions';
import { paginationAction } from '../actions/pagination';
import { videoConfigAction, videoCreateAction, videoGenerateAction, videoApproveAction, videoRegenAction, videoDeleteAction, videoPublishAction, videoScheduleAction, videoPubTwitterAction, videoPubInstagramAction, videoPubBothAction, videoPubNaAction } from '../actions/video-actions';
import { videoSettingsAction } from '../actions/video-settings';
import { batchPageAction } from '../actions/batch-page';
import { tweetViewDraftAction } from '../actions/tweet-view-draft';
import { rpFollowAction, rpNoFollowAction } from '../actions/repost-follow';
import { settingsKeysAction } from '../actions/settings-keys';
import { platformToggleAction, platformShowAction, platformDoneAction } from '../actions/platform-toggle';
import { editComposeAction } from '../actions/edit-compose';
import { fastCommitAction } from '../actions/fast-commit';
import { thumbAction } from '../actions/thumb';
import { imageCreateAction } from '../actions/image-create';

/** Action handlers keyed by the `action` part of `action:ACTION:ID` */
const actionSubHandlers: Record<string, ActionHandler> = {
    approve: approveAction,
    publish: publishAction,
    publish_approved: publishAllAction,
    schedule: scheduleAction,
    unschedule: unscheduleAction,
    edit: editAction,
    add_repo: addRepoAction as ActionHandler,
    watch: watchAction as ActionHandler,
    unwatch: unwatchAction as ActionHandler,
    delete_repo: deleteRepoAction as ActionHandler,
    confirm_delete_repo: confirmDeleteRepoAction as ActionHandler,
    delete_draft: deleteDraftAction,
    confirm_delete: confirmDeleteDraftAction,
    cancel_delete: cancelDeleteDraftAction,
    la: listApproveAction,
    lp: listPublishAction,
    ld: listDeleteAction,
    lyd: listConfirmDeleteAction,
    lnd: listCancelDeleteAction,
    // Twitter account actions
    add_account: addAccountAction as ActionHandler,
    tw_gen: tweetGenerateAction as ActionHandler,
    fast_gen: fastGenerateAction as ActionHandler,
    edit_rp: editRepostAction as ActionHandler,
    edit_compose: editComposeAction as ActionHandler,
    fast_commit: fastCommitAction as ActionHandler,
    tw_follow: followAction as ActionHandler,
    tw_unfollow: unfollowAction as ActionHandler,
    tw_delete: deleteAccountAction as ActionHandler,
    tw_delete_yes: confirmDeleteAccountAction as ActionHandler,
    tw_bootstrap: bootstrapAction as ActionHandler,
    sched_day: schedDayAction as ActionHandler,
    // Video actions
    video_create: videoCreateAction,
    video_generate: videoGenerateAction,
    video_approve_script: videoApproveAction,
    video_regen_script: videoRegenAction,
    video_delete: videoDeleteAction,
    video_publish: videoPublishAction,
    video_pub_twitter: videoPubTwitterAction,
    video_pub_instagram: videoPubInstagramAction,
    video_pub_both: videoPubBothAction,
    video_pub_na: videoPubNaAction,
    video_schedule: videoScheduleAction,
};

/**
 * Top-level callback dispatch by prefix.
 * Callback data format: `prefix:value` or `prefix:value:extra`
 */
export const callbackHandlers: Record<string, ActionHandler> = {
    view: viewChangeAction,
    draft: draftDetailAction as ActionHandler,
    action: async (ctx) => {
        const handler = actionSubHandlers[ctx.value];
        if (handler) {
            return handler(ctx);
        }
        const { renderHome } = await import('../views');
        return renderHome(ctx.env, ctx.chatId, (ctx.lang || 'en') as Lang);
    },
    page: paginationAction,
    repo: async (ctx) => {
        // View repo detail — reuse the same pattern as draft detail
        const { updateChatState } = await import('../data/db');
        const { renderRepoDetail } = await import('../views');
        await updateChatState(ctx.env, ctx.chatId, {
            current_view: 'repo',
            context: { selected_repo_id: ctx.value },
        });
        return renderRepoDetail(ctx.env, ctx.chatId, ctx.value, (ctx.lang || 'en') as Lang);
    },
    config: configToggleAction,
    account: accountDetailAction as ActionHandler,
    tw_config: accountConfigToggleAction,
    compose: composeAction,
    thumb: thumbAction,
    imgcreate: imageCreateAction,
    tw_batch: batchPageAction,
    tw_view: tweetViewDraftAction,
    vconfig: videoConfigAction,
    vsettings: videoSettingsAction,
    vs: videoSettingsAction,
    // Settings key management
    settings: settingsKeysAction,
    // Repost actions
    rp_follow: rpFollowAction,
    rp_no_follow: rpNoFollowAction,
    // Identity language notification actions
    identity_lang: async (ctx) => {
        const { env, chatId, value } = ctx;
        const lang = (ctx.lang || 'en') as Lang;

        if (value === 'reanalyze') {
            const { getUser } = await import('../data/user-db');
            const { analyzeIdentity } = await import('../ai/identity');
            const { XReconnectError } = await import('../integrations/x');
            const { hydrateEnv } = await import('../data/user-keys');
            const { t } = await import('../ui/strings');
            const user = await getUser(env, chatId);
            if (user?.has_x !== 1) {
                return {
                    text: t(lang, 'settings.identityNoX'),
                    keyboard: [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]],
                };
            }
            try {
                const userEnv = await hydrateEnv(env, chatId);
                const result = await analyzeIdentity(userEnv, chatId, lang);
                if (result) {
                    return {
                        text: t(lang, 'settings.identityReanalyzed'),
                        keyboard: [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]],
                    };
                }
                return {
                    text: t(lang, 'settings.identityAnalyzeFailed'),
                    keyboard: [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]],
                };
            } catch (error) {
                if (error instanceof XReconnectError) {
                    const keyboard: ViewResult['keyboard'] = [];
                    if (env.WEBAPP_URL) {
                        keyboard.push([{ text: t(lang, 'notifications.btnReconnectX'), web_app: { url: `${env.WEBAPP_URL}/#/settings` } }]);
                    }
                    keyboard.push([{ text: t(lang, 'common.home'), callback_data: 'view:home' }]);
                    return {
                        text: t(lang, 'settings.identityReconnectX'),
                        keyboard,
                    };
                }
                return {
                    text: t(lang, 'settings.identityAnalyzeFailedRetry'),
                    keyboard: [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]],
                };
            }
        }

        if (value === 'keep_default') {
            const { renderHome } = await import('../views');
            return renderHome(env, chatId, lang);
        }
    },
    // Platform toggle actions
    plat: async (ctx) => {
        // plat:show:DRAFTID → value=show, extra=DRAFTID
        // plat:toggle:PLATFORM:DRAFTID → value=toggle, extra=PLATFORM:DRAFTID
        // plat:done:DRAFTID → value=done, extra=DRAFTID
        const { value, extra } = ctx;
        if (value === 'show') {
            return platformShowAction({ ...ctx, value: extra || '' });
        }
        if (value === 'done') {
            return platformDoneAction({ ...ctx, value: extra || '' });
        }
        if (value === 'toggle' && extra) {
            // extra = PLATFORM:DRAFTID
            const colonIdx = extra.indexOf(':');
            if (colonIdx === -1) return;
            const platform = extra.substring(0, colonIdx);
            const draftId = extra.substring(colonIdx + 1);
            return platformToggleAction({ ...ctx, value: platform, extra: draftId });
        }
        if (value === 'repost') {
            // Lazy-import repost handler to avoid circular deps
            const { repostShowAction, repostToggleAction, repostPublishAction, repostCancelAction } = await import('../actions/repost-publish');
            // plat:repost:show:DRAFTID → extra=show:DRAFTID
            if (extra?.startsWith('show:')) {
                return repostShowAction({ ...ctx, value: extra.substring(5) });
            }
            if (extra?.startsWith('toggle:')) {
                // extra=toggle:PLATFORM:DRAFTID
                const rest = extra.substring(7);
                const colonIdx = rest.indexOf(':');
                if (colonIdx === -1) return;
                return repostToggleAction({ ...ctx, value: rest.substring(0, colonIdx), extra: rest.substring(colonIdx + 1) });
            }
            if (extra?.startsWith('publish:') || extra?.startsWith('pub:')) {
                const idx = extra.indexOf(':');
                return repostPublishAction({ ...ctx, value: extra.substring(idx + 1) });
            }
            if (extra?.startsWith('cancel:') || extra?.startsWith('no:')) {
                const idx = extra.indexOf(':');
                return repostCancelAction({ ...ctx, value: extra.substring(idx + 1) });
            }
        }
    },
};

// ==================== INPUT DISPATCH ====================

import { commitShaInput } from '../inputs/commit-sha';
import { scheduleInput } from '../inputs/schedule';
import { deleteInput } from '../inputs/delete';
import { addRepoInput } from '../inputs/add-repo';
import { editDraftInput } from '../inputs/edit-draft';
import { handwriteInput } from '../inputs/handwrite';
import { timezoneInput } from '../inputs/timezone';
import { editOverviewInput } from '../inputs/edit-overview';
import { videoPresetNameInput } from '../inputs/video-preset';
import { editCharacterInput } from '../inputs/edit-character';
import { addTwitterAccountInput } from '../inputs/add-twitter-account';
import { scheduleTimeInput } from '../inputs/schedule-time';
import { repostUrlInput } from '../inputs/repost-url';
import { settingsKeyInput } from '../inputs/settings-key';

export const inputHandlers: Record<string, InputHandler> = {
    commit_sha: commitShaInput,
    schedule: scheduleInput,
    delete: deleteInput,
    add_repo: addRepoInput,
    edit_draft: editDraftInput,
    handwrite: handwriteInput as InputHandler,
    timezone: timezoneInput,
    edit_overview: editOverviewInput,
    video_preset_name: videoPresetNameInput,
    edit_character: editCharacterInput as InputHandler,
    add_account: addTwitterAccountInput,
    schedule_time: scheduleTimeInput,
    repost_url: repostUrlInput,
    update_key: settingsKeyInput,
};
