/**
 * Repost Publish Actions — Re-publish a published draft to additional platforms
 *
 * Handles: plat:repost:show:DRAFTID, plat:repost:toggle:PLATFORM:DRAFTID,
 *          plat:repost:publish:DRAFTID, plat:repost:cancel:DRAFTID
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, PublishTargets, PublishResults } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getDraft, updateDraftPublishResults, getTimezone } from '../data/db';
import { getUser } from '../data/user-db';
import { renderDraftDetail, renderError } from '../views';
import { editMessage } from '../integrations/telegram';
import { renderPlatformBadges } from '../views/platform-toggle';

// Temporary repost selections stored in memory (per message interaction)
// This is fine since Telegram callbacks are sequential per user
const repostSelections = new Map<string, PublishTargets>();

/**
 * Show repost platform picker for a published draft.
 * All platforms start unchecked.
 */
export async function repostShowAction(
    ctx: HandlerContext & { value: string }
): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.value;

    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return renderError('Draft not found.', lang);

    // Initialize with all unchecked
    const selection: PublishTargets = { x: false, instagram_post: false, instagram_story: false, instagram_reel: false };
    repostSelections.set(`${ctx.chatId}:${draftId}`, selection);

    const user = await getUser(ctx.env, ctx.chatId);
    const hasInstagram = user?.has_instagram === 1;
    const hasVideo = draft.has_video === 1;

    return renderRepostPicker(selection, draftId, hasInstagram, hasVideo, lang);
}

/**
 * Toggle a platform in the repost picker.
 */
// Map short callback keys to full platform names
const PLATFORM_KEY_MAP: Record<string, keyof PublishTargets> = {
    x: 'x', ip: 'instagram_post', is: 'instagram_story', ir: 'instagram_reel',
    // Also accept full names for backward compat
    instagram_post: 'instagram_post', instagram_story: 'instagram_story', instagram_reel: 'instagram_reel',
};

export async function repostToggleAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const platform = PLATFORM_KEY_MAP[ctx.value] || ctx.value as keyof PublishTargets;
    const draftId = ctx.extra;
    if (!draftId) return;

    const key = `${ctx.chatId}:${draftId}`;
    const selection = repostSelections.get(key) || { x: false, instagram_post: false, instagram_story: false, instagram_reel: false };

    // Toggle
    selection[platform] = !selection[platform];

    // Mutual exclusivity: post ↔ reel
    if (platform === 'instagram_post' && selection[platform]) selection.instagram_reel = false;
    if (platform === 'instagram_reel' && selection[platform]) selection.instagram_post = false;

    repostSelections.set(key, selection);

    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return;

    const user = await getUser(ctx.env, ctx.chatId);
    const hasInstagram = user?.has_instagram === 1;
    const hasVideo = draft.has_video === 1;

    const view = renderRepostPicker(selection, draftId, hasInstagram, hasVideo, lang);
    if (ctx.messageId) {
        await editMessage(ctx.env, ctx.chatId, ctx.messageId, view.text, view.keyboard);
    }
}

/**
 * Execute re-publish to selected platforms (background).
 */
export async function repostPublishAction(
    ctx: HandlerContext & { value: string }
): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.value;

    const key = `${ctx.chatId}:${draftId}`;
    const selection = repostSelections.get(key);
    if (!selection) return renderError('No platforms selected.', lang);

    const anySelected = selection.x || selection.instagram_post || selection.instagram_story || selection.instagram_reel;
    if (!anySelected) return renderError(t(lang, 'platforms.noTargetSelected'), lang);

    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return renderError('Draft not found.', lang);

    // Parse existing results
    let existingResults: PublishResults = {};
    try {
        existingResults = draft.publish_results ? JSON.parse(draft.publish_results) : {};
    } catch { /* ignore */ }

    // Clean up selection immediately
    repostSelections.delete(key);

    // Capture context for background task
    const env = ctx.env;
    const chatId = ctx.chatId;
    const messageId = ctx.messageId!;

    const { updateDraftPublishTargets } = await import('../data/db');
    await updateDraftPublishTargets(env, draftId, chatId, selection);

    const repostTask = (async () => {
        try {
            const { publishDraft } = await import('../core/publish');
            const result = await publishDraft(env, chatId, { ...draft, publish_targets: JSON.stringify(selection), status: 'approved' });

            // Merge results
            const mergedResults: PublishResults = { ...existingResults };
            if (result.results.x) mergedResults.x = result.results.x;
            if (result.results.instagram_post) mergedResults.instagram_post = result.results.instagram_post;
            if (result.results.instagram_story) mergedResults.instagram_story = result.results.instagram_story;
            if (result.results.instagram_reel) mergedResults.instagram_reel = result.results.instagram_reel;
            if (result.results.errors) {
                mergedResults.errors = { ...(mergedResults.errors || {}), ...result.results.errors };
            }

            await updateDraftPublishResults(env, draftId, chatId, mergedResults);

            // Update the "Publishing..." message with result
            const tz = await getTimezone(env, chatId);
            const view = await renderDraftDetail(env, chatId, draftId, tz, lang);

            const hasErrors = result.results.errors && Object.keys(result.results.errors).length > 0;
            if (hasErrors && !result.success) {
                const { escapeHtml } = await import('../ui/utils');
                const { platformEmoji, platformLabel } = await import('../views/platform-toggle');
                const errorMessages = Object.entries(result.results.errors || {})
                    .map(([p, msg]) => `${platformEmoji(p)} ${platformLabel(p, lang)}: ${escapeHtml(msg)}`)
                    .join('\n');
                await editMessage(env, chatId, messageId,
                    `❌ <b>Repost failed</b>\n\n<code>${errorMessages}</code>`,
                ).catch(() => {});
            } else {
                const { truncateHtml } = await import('../ui/utils');
                view.text = `✅ <b>Reposted!</b>\n\n${view.text}`;
                await editMessage(env, chatId, messageId,
                    truncateHtml(view.text, 4096),
                    view.keyboard,
                ).catch(() => {});
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[repost-bg] Background repost failed:', msg);
            const { escapeHtml } = await import('../ui/utils');
            await editMessage(env, chatId, messageId,
                `❌ <b>Repost failed</b>\n\n<code>${escapeHtml(msg)}</code>`,
            ).catch(() => {});
        }
    })();

    if (ctx.executionCtx) {
        ctx.executionCtx.waitUntil(repostTask);
    } else {
        await repostTask;
    }

    return {
        text: `⏳ <b>Publishing...</b>\n\nYou'll be notified when it's done.`,
        keyboard: [],
    };
}

/**
 * Cancel repost — return to draft detail.
 */
export async function repostCancelAction(
    ctx: HandlerContext & { value: string }
): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.value;

    repostSelections.delete(`${ctx.chatId}:${draftId}`);

    const tz = await getTimezone(ctx.env, ctx.chatId);
    return renderDraftDetail(ctx.env, ctx.chatId, draftId, tz, lang);
}

function renderRepostPicker(
    selection: PublishTargets,
    draftId: string,
    hasInstagram: boolean,
    hasVideo: boolean,
    lang: Lang
): ViewResult {
    const check = (enabled: boolean) => enabled ? '✅' : '⬜';

    const rows: Array<Array<{ text: string; callback_data: string }>> = [];

    // Short platform keys for callback_data (Telegram 64-byte limit)
    rows.push([{
        text: `${check(selection.x)} 🐦 X`,
        callback_data: `plat:repost:toggle:x:${draftId}`,
    }]);

    if (hasInstagram) {
        rows.push([{
            text: `${check(selection.instagram_post)} 📸 ${t(lang, 'platforms.post')}`,
            callback_data: `plat:repost:toggle:ip:${draftId}`,
        }]);
        rows.push([{
            text: `${check(selection.instagram_story)} 📖 ${t(lang, 'platforms.story')}`,
            callback_data: `plat:repost:toggle:is:${draftId}`,
        }]);
        if (hasVideo) {
            rows.push([{
                text: `${check(selection.instagram_reel)} 🎬 ${t(lang, 'platforms.reel')}`,
                callback_data: `plat:repost:toggle:ir:${draftId}`,
            }]);
        }
    }

    rows.push([
        { text: `📤 ${t(lang, 'platforms.btnPublish')}`, callback_data: `plat:repost:pub:${draftId}` },
        { text: t(lang, 'common.cancel'), callback_data: `plat:repost:no:${draftId}` },
    ]);

    const badges = renderPlatformBadges(selection);
    const text = `<b>🔄 ${t(lang, 'platforms.repostTitle')}</b>\n\n${t(lang, 'platforms.selectRepostTargets')}\n${badges ? `\n${t(lang, 'platforms.selected')}: ${badges}` : ''}`;

    return { text, keyboard: rows };
}
