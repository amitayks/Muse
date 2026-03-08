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
export async function repostToggleAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const platform = ctx.value as keyof PublishTargets;
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
 * Execute re-publish to selected platforms.
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

    // Publish to selected platforms
    const { publishDraft } = await import('../core/publish');

    // Temporarily set the draft's publish targets to the repost selection
    const { updateDraftPublishTargets } = await import('../data/db');
    await updateDraftPublishTargets(ctx.env, draftId, ctx.chatId, selection);

    const result = await publishDraft(ctx.env, ctx.chatId, { ...draft, publish_targets: JSON.stringify(selection), status: 'approved' });

    // Merge results (whether success or failure, publishDraft always returns results)
    const mergedResults: PublishResults = { ...existingResults };
    if (result.results.x) mergedResults.x = result.results.x;
    if (result.results.instagram_post) mergedResults.instagram_post = result.results.instagram_post;
    if (result.results.instagram_story) mergedResults.instagram_story = result.results.instagram_story;
    if (result.results.instagram_reel) mergedResults.instagram_reel = result.results.instagram_reel;
    if (result.results.errors) {
        mergedResults.errors = { ...(mergedResults.errors || {}), ...result.results.errors };
    }

    await updateDraftPublishResults(ctx.env, draftId, ctx.chatId, mergedResults);

    // Clean up
    repostSelections.delete(key);

    // Return to draft detail
    const tz = await getTimezone(ctx.env, ctx.chatId);
    return renderDraftDetail(ctx.env, ctx.chatId, draftId, tz, lang);
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

    rows.push([{
        text: `${check(selection.x)} 🐦 X`,
        callback_data: `plat:repost:toggle:x:${draftId}`,
    }]);

    if (hasInstagram) {
        rows.push([{
            text: `${check(selection.instagram_post)} 📸 ${t(lang, 'platforms.post')}`,
            callback_data: `plat:repost:toggle:instagram_post:${draftId}`,
        }]);
        rows.push([{
            text: `${check(selection.instagram_story)} 📖 ${t(lang, 'platforms.story')}`,
            callback_data: `plat:repost:toggle:instagram_story:${draftId}`,
        }]);
        if (hasVideo) {
            rows.push([{
                text: `${check(selection.instagram_reel)} 🎬 ${t(lang, 'platforms.reel')}`,
                callback_data: `plat:repost:toggle:instagram_reel:${draftId}`,
            }]);
        }
    }

    rows.push([
        { text: `📤 ${t(lang, 'platforms.btnPublish')}`, callback_data: `plat:repost:publish:${draftId}` },
        { text: t(lang, 'common.cancel'), callback_data: `plat:repost:cancel:${draftId}` },
    ]);

    const badges = renderPlatformBadges(selection);
    const text = `<b>🔄 ${t(lang, 'platforms.repostTitle')}</b>\n\n${t(lang, 'platforms.selectRepostTargets')}\n${badges ? `\n${t(lang, 'platforms.selected')}: ${badges}` : ''}`;

    return { text, keyboard: rows };
}
