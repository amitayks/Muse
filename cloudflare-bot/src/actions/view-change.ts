import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import { homeButton } from '../ui/components';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { updateChatState, getTimezone, getPageSize, getVideoDraft } from '../data/db';
import { isAdmin } from '../infra/security';
import { renderHome, renderHelp, renderDraftCategories, renderDraftsList, renderGeneratePrompt, renderSchedulePrompt, renderDeletePrompt, renderReposList, renderCompose, renderSettings, renderPageSizeSelect, renderTimezoneSelect, renderVideoStudioHome, renderVideoRepoHome, renderVideoList, renderVideoDetail, renderAccountsList, renderAddAccount } from '../views';

export async function viewChangeAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const { env, chatId, value, extra } = ctx;
    const lang = (ctx.lang || 'en') as Lang;

    switch (value) {
        case 'home':
            await updateChatState(env, chatId, { current_view: 'home', context: null });
            return renderHome(env, chatId, lang);
        case 'drafts':
            await updateChatState(env, chatId, { current_view: 'drafts', context: null });
            return renderDraftCategories(env, chatId, lang);
        case 'drafts_auto': {
            await updateChatState(env, chatId, { current_view: 'drafts_auto', context: { page: 0 } });
            const ps1 = await getPageSize(env, chatId);
            return renderDraftsList(env, chatId, 0, 'auto', ps1, lang);
        }
        case 'drafts_approved': {
            await updateChatState(env, chatId, { current_view: 'drafts_approved', context: { page: 0 } });
            const ps2 = await getPageSize(env, chatId);
            return renderDraftsList(env, chatId, 0, 'approved', ps2, lang);
        }
        case 'drafts_scheduled': {
            await updateChatState(env, chatId, { current_view: 'drafts_scheduled', context: { page: 0 } });
            const ps3 = await getPageSize(env, chatId);
            return renderDraftsList(env, chatId, 0, 'scheduled', ps3, lang);
        }
        case 'help':
            await updateChatState(env, chatId, { current_view: 'help', context: null });
            return renderHelp(lang);
        case 'generate':
            await updateChatState(env, chatId, { current_view: 'generate', context: { awaiting_input: 'commit_sha' } });
            return renderGeneratePrompt(lang);
        case 'schedule':
            await updateChatState(env, chatId, { current_view: 'schedule', context: { awaiting_input: 'schedule' } });
            return renderSchedulePrompt(lang);
        case 'delete':
            await updateChatState(env, chatId, { current_view: 'delete', context: { awaiting_input: 'delete' } });
            return renderDeletePrompt(lang);
        case 'repos':
            await updateChatState(env, chatId, { current_view: 'repos', context: null });
            return renderReposList(env, chatId, 0, lang);
        case 'handwrite':
            await updateChatState(env, chatId, {
                current_view: 'compose',
                context: {
                    awaiting_input: 'handwrite',
                    compose: {
                        mode: 'handwrite',
                        tweets: [],
                        imageGen: false,
                        aiRefine: false,
                        analyzeImages: false,
                        statusMessageId: ctx.messageId || 0,
                    },
                },
            });
            return renderCompose([], [], false, false, lang);
        case 'drafts_handwrite': {
            await updateChatState(env, chatId, { current_view: 'drafts_handwrite', context: { page: 0 } });
            const ps4 = await getPageSize(env, chatId);
            return renderDraftsList(env, chatId, 0, 'handwrite', ps4, lang);
        }
        case 'drafts_published': {
            await updateChatState(env, chatId, { current_view: 'drafts_published', context: { page: 0 } });
            const ps5 = await getPageSize(env, chatId);
            return renderDraftsList(env, chatId, 0, 'published', ps5, lang);
        }
        case 'settings': {
            await updateChatState(env, chatId, { current_view: 'settings', context: null });
            const tz = await getTimezone(env, chatId);
            const ps = await getPageSize(env, chatId);
            const { countStalePrompts } = await import('../ai/prompts');
            const staleCount = await countStalePrompts(env, chatId);
            const { getUser } = await import('../data/user-db');
            const settingsUser = await getUser(env, chatId);
            const { getRepostDefaults, getCommitDefaults, getRepoDefaults, getAiProvider } = await import('../data/user-settings-db');
            const rpDefaults = await getRepostDefaults(env, chatId);
            const cmDefaults = await getCommitDefaults(env, chatId);
            const repoDefaults = await getRepoDefaults(env, chatId);
            const aiProvider = await getAiProvider(env, chatId);
            return renderSettings(tz, ps, lang, staleCount, rpDefaults, cmDefaults, repoDefaults, settingsUser?.default_publish_targets, aiProvider);
        }
        case 'page_size_select': {
            await updateChatState(env, chatId, { current_view: 'page_size_select', context: null });
            const currentPs = await getPageSize(env, chatId);
            return renderPageSizeSelect(currentPs, lang);
        }
        case 'timezone_select':
            await updateChatState(env, chatId, { current_view: 'timezone_select', context: null });
            return renderTimezoneSelect(lang);

        // ==================== TWITTER ACCOUNTS VIEWS ====================
        case 'accounts':
            await updateChatState(env, chatId, { current_view: 'accounts', context: null });
            return renderAccountsList(env, chatId, 0, lang);
        case 'account_add':
            await updateChatState(env, chatId, { current_view: 'add_account', context: { awaiting_input: 'add_account' } });
            return renderAddAccount(lang);
        case 'drafts_repost': {
            await updateChatState(env, chatId, { current_view: 'drafts_repost', context: { page: 0 } });
            const ps6 = await getPageSize(env, chatId);
            return renderDraftsList(env, chatId, 0, 'repost', ps6, lang);
        }

        // ==================== REPOST VIEW ====================
        case 'repost': {
            const { renderRepostPrompt } = await import('../views/repost');
            await updateChatState(env, chatId, { current_view: 'repost', context: { awaiting_input: 'repost_url' } });
            return renderRepostPrompt(lang);
        }

        // ==================== VIDEO STUDIO VIEWS ====================
        case 'video_studio':
            if (!isAdmin(chatId, env)) {
                return { text: t(lang, 'error.videoAdminOnly'), keyboard: [[homeButton(lang)]] };
            }
            await updateChatState(env, chatId, { current_view: 'video_studio', context: null });
            return renderVideoStudioHome(env, chatId, lang);
        case 'video_repo': {
            const repoId = extra || '';
            await updateChatState(env, chatId, { current_view: 'video_repo', context: { selected_repo_id: repoId } });
            return renderVideoRepoHome(env, chatId, repoId, lang);
        }
        case 'video_list': {
            // extra = "REPO_ID:STATUS_CODE" or "REPO_ID:STATUS_CODE:PAGE"
            // Status may be short code (d,g,c,a,s,p,f) — renderVideoList handles expansion
            const listParts = (extra || '').split(':');
            const listRepoId = listParts[0] || '';
            const listStatus = listParts[1] || 'd';
            const listPage = parseInt(listParts[2] || '0', 10);
            return renderVideoList(env, chatId, listRepoId, listStatus, listPage, lang);
        }
        case 'video_detail': {
            const videoDraftId = extra || '';
            return renderVideoDetail(env, chatId, videoDraftId, lang);
        }
        case 'video_settings': {
            const { getVideoSettings } = await import('../data/db');
            const { renderVideoSettingsHome } = await import('../views/video-settings');
            const vSettings = await getVideoSettings(env, chatId);
            await updateChatState(env, chatId, { current_view: 'video_settings', context: null });
            return renderVideoSettingsHome(vSettings, lang);
        }
        default:
            return renderHome(env, chatId, lang);
    }
}
