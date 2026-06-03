/**
 * Platform Toggle Action Handler
 *
 * Handles platform selection for drafts — toggles are rendered inline
 * within the draft detail view (no separate screen).
 * Callbacks: plat:toggle:{platform}:{draftId}, plat:show:{draftId}, plat:done:{draftId}
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, PublishTargets } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getDraft, updateDraftPublishTargets, getTimezone } from '../data/db';
import { renderDraftDetail, renderError } from '../views';
import { parsePublishTargets } from '../views/platform-toggle';
import { answerCallback } from '../integrations/telegram';

/**
 * Toggle a platform on a draft's publish targets.
 * Enforces: post ↔ reel mutual exclusivity, at-least-one target.
 * Re-renders draft detail with toggles still visible.
 */
export async function platformToggleAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;

    // Parse: value = platform, extra = draftId
    const platform = ctx.value as keyof PublishTargets;
    const draftId = ctx.extra;
    if (!draftId) return renderError('Missing draft ID.', lang);

    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return renderError('Draft not found.', lang);

    const targets = parsePublishTargets(draft.publish_targets);

    // Toggle the platform
    const newValue = !targets[platform];

    // Enforce mutual exclusivity: post ↔ reel
    if (platform === 'instagram_post' && newValue) {
        targets.instagram_reel = false;
    }
    if (platform === 'instagram_reel' && newValue) {
        targets.instagram_post = false;
    }

    targets[platform] = newValue;

    // Enforce at-least-one target
    const anyEnabled = targets.x || targets.instagram_post || targets.instagram_story || targets.instagram_reel;
    if (!anyEnabled) {
        // Don't allow disabling the last target — revert and show toast
        targets[platform] = true;
        if (ctx.callbackId) {
            await answerCallback(ctx.env, ctx.callbackId, t(lang, 'platforms.noTargetSelected'));
        }
    }

    // Save
    await updateDraftPublishTargets(ctx.env, draft.id, ctx.chatId, targets);

    // Re-render draft detail with toggles still open
    const tz = await getTimezone(ctx.env, ctx.chatId);
    return renderDraftDetail(ctx.env, ctx.chatId, draftId, tz, lang, true);
}

/**
 * Show platform toggles — re-renders draft detail with inline toggles visible.
 */
export async function platformShowAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.value;

    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return renderError('Draft not found.', lang);

    const tz = await getTimezone(ctx.env, ctx.chatId);
    return renderDraftDetail(ctx.env, ctx.chatId, draftId, tz, lang, true);
}

/**
 * Done button — re-renders draft detail with toggles hidden.
 */
export async function platformDoneAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.value;

    const tz = await getTimezone(ctx.env, ctx.chatId);
    return renderDraftDetail(ctx.env, ctx.chatId, draftId, tz, lang);
}
