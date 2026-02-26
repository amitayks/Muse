/**
 * Schedule Time Input Handler
 *
 * Processes HH:MM input when awaiting_input='schedule_time'.
 * Combines with stored date, converts to UTC using user timezone, schedules draft.
 */

import type { HandlerContext } from '../core/router';
import type { ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { cancelRow } from '../ui/components';
import { t } from '../ui/strings';
import { respond } from '../core/respond';
import { updateChatState, scheduleDraft, getTimezone, getPageSize } from '../services/db';
import { renderDraftDetail, renderDraftsList } from '../views/drafts';
import type { DraftListType } from '../views/drafts';
import { sendMessage } from '../services/telegram';
import { toUTC, formatLocalTime } from '../services/timezone';
import { scheduleCancelTarget } from '../actions/schedule';

export async function scheduleTimeInput(ctx: HandlerContext & { text: string; context: ChatContext }) {
    const { env, chatId, text: input, context } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;

    const draftId = context.selected_draft_id;
    const date = context.schedule_date; // May be undefined if user is on day picker screen
    const returnView = context.schedule_return_view;
    const cancelTarget = scheduleCancelTarget(returnView, draftId || '');

    if (!draftId) {
        await sendMessage(env, chatId,
            t(lang, 'schedule.contextLost'),
            [[{ text: t(lang, 'common.home'), callback_data: 'view:home' }]]
        );
        return;
    }

    const timeStr = input.trim();

    // Accept full date+time (YYYY-MM-DD HH:MM) or just time (HH:MM) if day was pre-selected
    const fullMatch = timeStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);

    if (!fullMatch && !timeMatch) {
        const hint = date
            ? `${t(lang, 'schedule.sendTime')}\n${t(lang, 'schedule.orFullDate')}`
            : t(lang, 'schedule.sendFullDateTime');
        await sendMessage(env, chatId,
            `${t(lang, 'schedule.invalidFormat')}\n\n${hint}`,
            [cancelRow(cancelTarget, lang)]
        );
        return;
    }

    // If only time provided but no pre-selected date, require full format
    if (timeMatch && !date) {
        await sendMessage(env, chatId,
            `${t(lang, 'schedule.noDateSelected')}\n\n${t(lang, 'schedule.sendFullDateTime')}\n\n${t(lang, 'schedule.dateExample')}`,
            [cancelRow(cancelTarget, lang)]
        );
        return;
    }

    let effectiveDate: string;
    let hours: number;
    let minutes: number;

    if (fullMatch) {
        effectiveDate = fullMatch[1];
        hours = parseInt(fullMatch[2], 10);
        minutes = parseInt(fullMatch[3], 10);
    } else {
        effectiveDate = date!;
        hours = parseInt(timeMatch![1], 10);
        minutes = parseInt(timeMatch![2], 10);
    }

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        await sendMessage(env, chatId,
            `${t(lang, 'schedule.invalidTime')}\n\n${t(lang, 'schedule.timeExample')}`,
            [cancelRow(cancelTarget, lang)]
        );
        return;
    }

    const tz = await getTimezone(env, chatId);

    // Combine date + time
    const localDateStr = `${effectiveDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    const localDate = new Date(localDateStr);

    if (isNaN(localDate.getTime())) {
        await sendMessage(env, chatId,
            t(lang, 'schedule.invalidDateTimeCombination'),
            [cancelRow(cancelTarget, lang)]
        );
        return;
    }

    // Convert to UTC
    const scheduledAtUTC = toUTC(localDate, tz);

    // Validate not in the past
    if (scheduledAtUTC.getTime() <= Date.now()) {
        await sendMessage(env, chatId,
            `${t(lang, 'schedule.timeInPast')}\n\n${t(lang, 'schedule.provideFutureTime')}\n\n${t(lang, 'schedule.formatHHMM')}`,
            [cancelRow(cancelTarget, lang)]
        );
        return;
    }

    try {
        await scheduleDraft(env, draftId, chatId, scheduledAtUTC.toISOString());

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
            const view = await renderDraftDetail(env, chatId, draftId, tz, lang);
            await respond(env, chatId, view, {
                viewName: 'draft_detail',
                context: { selected_draft_id: draftId },
            });
        }
    } catch (error) {
        console.error('[schedule-time] Error:', error);
        await sendMessage(env, chatId,
            t(lang, 'schedule.failedToSchedule'),
            [cancelRow(cancelTarget, lang)]
        );
    }
}
