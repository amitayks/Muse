import type { HandlerContext } from '../core/router';
import type { ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { respond } from '../core/respond';
import { updateChatState, createDraft, scheduleDraft, getDraft, getTimezone, getPageSize } from '../data/db';
import { getUser } from '../data/user-db';
import { getContentSource } from '../integrations/github';
import { generateContent } from '../ai/gemini';
import { renderError, renderSuccess } from '../views';
import { renderDraftDetail, renderDraftsList } from '../views/drafts';
import type { DraftListType } from '../views/drafts';
import { cancelRow } from '../ui/components';
import { sendMessage } from '../integrations/telegram';
import { toUTC, formatLocalTime } from '../infra/timezone';
import { scheduleCancelTarget } from '../actions/schedule';

export async function scheduleInput(ctx: HandlerContext & { text: string; context: ChatContext }) {
    const { env, chatId, text: input, context } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;
    const tz = await getTimezone(env, chatId);

    // Flow 1: Schedule an existing draft (came from Schedule button on draft detail)
    if (context.selected_draft_id) {
        const returnView = context.schedule_return_view;
        const cancelTarget = scheduleCancelTarget(returnView, context.selected_draft_id);
        const datetime = input.trim();
        const localDate = new Date(datetime);

        if (isNaN(localDate.getTime())) {
            await sendMessage(env, chatId,
                `${t(lang, 'schedule.invalidDatetimeFormat')}\n\n${t(lang, 'schedule.useFormat')}\n\n${t(lang, 'schedule.dateExample')}`,
                [cancelRow(cancelTarget, lang)]
            );
            return;
        }

        // Convert user's local time to UTC for storage
        const scheduledAtUTC = toUTC(localDate, tz);

        // Past-time validation in user's local time
        const nowLocal = new Date(Date.now() + (localDate.getTime() - scheduledAtUTC.getTime()));
        if (localDate.getTime() <= nowLocal.getTime()) {
            await sendMessage(env, chatId,
                `${t(lang, 'schedule.timeInPast')}\n\n${t(lang, 'schedule.provideFutureDatetime')}\n\n${t(lang, 'schedule.formatFull')}`,
                [cancelRow(cancelTarget, lang)]
            );
            return;
        }

        try {
            await scheduleDraft(env, context.selected_draft_id, chatId, scheduledAtUTC.toISOString());

            // Navigate back to origin: draft list or draft detail
            if (returnView?.startsWith('drafts_')) {
                const listType = returnView.replace('drafts_', '') as DraftListType;
                const ps = await getPageSize(env, chatId);
                const view = await renderDraftsList(env, chatId, 0, listType, ps, lang);
                await respond(env, chatId, view, {
                    viewName: returnView,
                    context: { page: 0 },
                });
            } else {
                const view = await renderDraftDetail(env, chatId, context.selected_draft_id, tz, lang);
                await respond(env, chatId, view, {
                    viewName: 'draft_detail',
                    context: { selected_draft_id: context.selected_draft_id },
                });
            }
        } catch (error) {
            await sendMessage(env, chatId,
                `${t(lang, 'schedule.failedToSchedule')}\n\n${t(lang, 'schedule.formatFull')}`,
                [cancelRow(cancelTarget, lang)]
            );
        }
        return;
    }

    // Flow 2: /schedule command — create new draft + schedule (SHA DATETIME)
    const parts = input.split(' ');
    const sha = parts[0];
    const datetime = parts.slice(1).join(' ');

    if (!sha || !datetime) {
        await sendMessage(env, chatId,
            `${t(lang, 'schedule.provideBothShaAndDatetime')}\n\n${t(lang, 'schedule.shaDatetimeFormat')}\n${t(lang, 'schedule.shaDatetimeExample')}`,
            [cancelRow('view:home', lang)]
        );
        return;
    }

    try {
        const localDate = new Date(datetime);
        if (isNaN(localDate.getTime())) {
            await sendMessage(env, chatId,
                `${t(lang, 'schedule.invalidDatetimeFormat')}\n\n${t(lang, 'schedule.shaDatetimeFormat')}\n${t(lang, 'schedule.shaDatetimeExample')}`,
                [cancelRow('view:home', lang)]
            );
            return;
        }

        // Convert user's local time to UTC
        const scheduledAtUTC = toUTC(localDate, tz);

        const source = await getContentSource(env, sha);
        const prNumber = source.type === 'pr' ? source.data.number : 0;
        const prTitle = source.type === 'pr' ? source.data.title : source.data.title;

        const result = await generateContent(env, source, undefined, lang, chatId);
        const content = result.content;

        const user = await getUser(env, chatId);
        await createDraft(env, chatId, {
            pr_number: prNumber,
            pr_title: prTitle,
            commit_sha: sha,
            content: JSON.stringify(content),
            publish_targets: user?.default_publish_targets || undefined,
            language: lang,
        });

        await updateChatState(env, chatId, { context: null });
        const sourceLabel = source.type === 'pr' ? `PR #${prNumber}` : `commit ${sha.substring(0, 7)}`;
        const timeDisplay = formatLocalTime(scheduledAtUTC.toISOString(), tz);
        await respond(env, chatId, renderSuccess(
            t(lang, 'schedule.scheduledPost').replace('{source}', sourceLabel).replace('{time}', timeDisplay),
            lang
        ));
    } catch (error) {
        await sendMessage(env, chatId,
            `${t(lang, 'schedule.scheduleFailed')}\n\n${t(lang, 'schedule.scheduleFailedMsg').replace('{sha}', sha.substring(0, 7))}\n\n${t(lang, 'schedule.shaDatetimeFormat')}`,
            [cancelRow('view:home', lang)]
        );
    }
}
