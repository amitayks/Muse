import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getDraft, getTimezone, updateDraftStatus } from '../data/db';
import { publishDraft } from '../core/publish';
import { renderDraftDetail, renderError } from '../views';
import { platformEmoji, platformLabel, formatPlatformSummary } from '../views/platform-toggle';
import { escapeHtml } from '../ui/utils';
import { editMessage } from '../integrations/telegram';
import { truncateHtml } from '../ui/utils';

export async function publishAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.extra!;
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) {
        return renderError('Draft not found.', lang);
    }

    // Guard: prevent duplicate publishes (Telegram webhook retries)
    if (draft.status === 'publishing' || draft.status === 'published') {
        return { text: `⏳ ${draft.status === 'publishing' ? 'Already publishing...' : 'Already published.'}`, keyboard: [] };
    }

    // Mark as publishing immediately to prevent duplicates
    await updateDraftStatus(ctx.env, draft.id, ctx.chatId, 'publishing');

    // Capture context for background task
    const env = ctx.env;
    const chatId = ctx.chatId;
    const messageId = ctx.messageId!;

    const publishTask = (async () => {
        try {
            const result = await publishDraft(env, chatId, draft);

            if (!result.success) {
                const errorMessages = Object.entries(result.results.errors || {})
                    .map(([p, msg]) => `${platformEmoji(p)} ${platformLabel(p, lang)}: ${escapeHtml(msg)}`)
                    .join('\n');
                await editMessage(env, chatId, messageId,
                    `❌ <b>Publishing failed</b>\n\n<code>${errorMessages}</code>`,
                ).catch(() => {});
                // Revert to approved so user can retry
                await updateDraftStatus(env, draft.id, chatId, 'approved');
                return;
            }

            // Update the "Publishing..." message with the result
            try {
                const tz = await getTimezone(env, chatId);
                const view = await renderDraftDetail(env, chatId, draftId, tz, lang);

                const hasErrors = result.results.errors && Object.keys(result.results.errors).length > 0;
                if (hasErrors) {
                    const summary = formatPlatformSummary(result.results, lang);
                    view.text = `⚠️ <b>${t(lang, 'notifications.scheduledPostPartial')}</b>\n${summary}\n\n${view.text}`;
                } else {
                    view.text = `✅ <b>Published!</b>\n\n${view.text}`;
                }

                await editMessage(env, chatId, messageId,
                    truncateHtml(view.text, 4096),
                    view.keyboard,
                );
            } catch {
                await editMessage(env, chatId, messageId,
                    `✅ <b>Published!</b>\n\n${result.url ? `<a href="${result.url}">View post</a>` : 'Post is live.'}`,
                ).catch(() => {});
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[publish-bg] Background publish failed:', msg);
            await editMessage(env, chatId, messageId,
                `❌ <b>Publishing failed</b>\n\n<code>${escapeHtml(msg)}</code>`,
            ).catch(() => {});
            // Revert status so user can retry
            await updateDraftStatus(env, draft.id, chatId, 'approved').catch(() => {});
        }
    })();

    // Run in background if executionCtx available, otherwise await
    if (ctx.executionCtx) {
        ctx.executionCtx.waitUntil(publishTask);
    } else {
        await publishTask;
    }

    // Immediate response — edits the current message to "Publishing..."
    return {
        text: `⏳ <b>Publishing...</b>\n\nYou'll be notified when it's done.`,
        keyboard: [],
    };
}
