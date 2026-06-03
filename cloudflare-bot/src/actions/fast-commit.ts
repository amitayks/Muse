/**
 * Fast Commit Action — Handler for action:fast_commit:EVENT_ID
 *
 * Called when user clicks [⚡ Fast] on a commit event notification.
 * Updates the notification in-place with progress indicators,
 * generates content, creates draft, and shows draft detail directly.
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, ContentSource } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { createDraft, getTimezone, updateChatState, applyOverviewPatches } from '../data/db';
import { getUser } from '../data/user-db';
import { getCommitDefaults } from '../data/user-settings-db';
import { getCommitEvent, updateCommitEvent } from '../data/commit-events-db';
import { generateContent } from '../ai/gemini';
import { sendMessage, editMessage, sendPhoto, deleteMessage } from '../integrations/telegram';
import { ensureImage } from '../data/storage';
import { renderError, renderDraftDetail } from '../views';
import { truncateHtml } from '../ui/utils';
import { sanitizeError } from '../infra/security';

export async function fastCommitAction(ctx: HandlerContext & { extra?: string }): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const eventId = ctx.extra!;

    // Load commit event
    const event = await getCommitEvent(ctx.env, ctx.chatId, eventId);
    if (!event) return renderError(t(lang, 'error.commitEventNotFound'), lang);

    // Check if already drafted
    if (event.draft_id) {
        return renderError(t(lang, 'error.commitAlreadyGenerated'), lang);
    }

    // Show "generating" status in-place on the notification
    const msgId = event.message_id;
    if (msgId) {
        try {
            await editMessage(ctx.env, ctx.chatId, msgId, t(lang, 'compose.refiningAi'));
        } catch { /* ignore edit failure */ }
    }

    // Read user defaults
    const commitDefaults = await getCommitDefaults(ctx.env, ctx.chatId);

    // Parse source data and generate content
    const contentSource: ContentSource = JSON.parse(event.source_data);
    const result = await generateContent(
        ctx.env, contentSource, event.repo_id, lang, ctx.chatId,
        { generateImagePrompt: commitDefaults.commitFastImage ? undefined : false },
    );
    const content = result.content;

    // Apply overview patches (non-blocking)
    if (result.overviewUpdates) {
        try {
            await applyOverviewPatches(ctx.env, event.repo_id, result.overviewUpdates);
        } catch (patchError) {
            console.error('Overview patch failed (non-blocking):', patchError);
        }
    }

    // Create draft
    const repoShort = contentSource.repo ? contentSource.repo.split('/')[1] || contentSource.repo : '';
    const user = await getUser(ctx.env, ctx.chatId);
    const draftId = await createDraft(ctx.env, ctx.chatId, {
        pr_number: event.pr_number || 0,
        pr_title: `${repoShort} | ${event.title}`,
        commit_sha: event.commit_sha,
        content: JSON.stringify(content),
        publish_targets: user?.default_publish_targets || undefined,
        event_id: eventId,
    });

    // Update event status
    await updateCommitEvent(ctx.env, eventId, { status: 'drafted', draftId });

    // Image generation (update progress in-place)
    let imageUrl: string | null = null;
    if (commitDefaults.commitFastImage && content.imagePrompt) {
        if (msgId) {
            try {
                await editMessage(ctx.env, ctx.chatId, msgId, t(lang, 'compose.generatingImage'));
            } catch { /* ignore */ }
        }
        try {
            const ensuredUrl = await ensureImage(ctx.env, ctx.chatId, { id: draftId, content: JSON.stringify(content) });
            if (ensuredUrl && ctx.env.WORKER_URL) {
                imageUrl = `${ctx.env.WORKER_URL}${ensuredUrl}`;
            }
        } catch (imgError) {
            console.error('[fast_commit] Image generation failed:', sanitizeError(imgError));
        }
    }

    // Show draft detail directly on the notification message
    const tz = await getTimezone(ctx.env, ctx.chatId);
    const view = await renderDraftDetail(ctx.env, ctx.chatId, draftId, tz, lang);

    let finalMessageId: number;
    if (imageUrl && msgId) {
        // Photo messages can't be edited from text — delete old, send photo
        try { await deleteMessage(ctx.env, ctx.chatId, msgId); } catch { /* ignore */ }
        const caption = truncateHtml(view.text, 1024);
        finalMessageId = await sendPhoto(ctx.env, ctx.chatId, imageUrl, caption, view.keyboard);
    } else if (msgId) {
        // Edit the notification directly into draft detail
        try {
            await editMessage(ctx.env, ctx.chatId, msgId, view.text, view.keyboard);
            finalMessageId = msgId;
        } catch {
            // Fallback: send new message if edit fails
            finalMessageId = await sendMessage(ctx.env, ctx.chatId, view.text, view.keyboard);
        }
    } else {
        // No message to edit — send new
        finalMessageId = await sendMessage(ctx.env, ctx.chatId, view.text, view.keyboard);
    }

    // Update chat state to draft view
    await updateChatState(ctx.env, ctx.chatId, {
        message_id: finalMessageId,
        current_view: 'draft',
        context: { selected_draft_id: draftId },
    });
}
