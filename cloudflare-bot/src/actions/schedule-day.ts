/**
 * Schedule Day Picker Action — stores selected date and prompts for time
 *
 * Callback format: action:sched_day:DRAFT_ID:YYYY-MM-DD
 * Since callback_data only gives us value=DRAFT_ID, extra=YYYY-MM-DD
 * through the action dispatch, we parse extra to get the date.
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import { cancelRow } from '../ui/components';
import { homeButton } from '../ui/components';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getChatState, parseContext, updateChatState } from '../data/db';
import { scheduleCancelTarget } from './schedule';

export async function schedDayAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    // Callback: action:sched_day:DRAFT_ID:YYYY-MM-DD
    // Router gives us: value="sched_day", extra="DRAFT_ID:YYYY-MM-DD"
    // Parse extra to split draft ID and date
    const extraParts = (ctx.extra || '').split(':');
    const draftId = extraParts[0];
    const date = extraParts.slice(1).join(':');

    if (!draftId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return {
            text: t(lang, 'actions.invalidDateFormat'),
            keyboard: [[homeButton(lang)]],
        };
    }

    // Preserve schedule_return_view from previous context
    const currentState = await getChatState(ctx.env, ctx.chatId);
    const currentContext = parseContext(currentState);
    const returnView = currentContext.schedule_return_view;

    await updateChatState(ctx.env, ctx.chatId, {
        context: {
            awaiting_input: 'schedule_time',
            selected_draft_id: draftId,
            schedule_date: date,
            schedule_return_view: returnView,
        },
    });

    const cancelTarget = scheduleCancelTarget(returnView, draftId);
    return {
        text: `${t(lang, 'actions.scheduleForDate').replace('{date}', date)}

${t(lang, 'actions.sendTimeHHMM')}

${t(lang, 'actions.orFullDateTime')}`,
        keyboard: [cancelRow(cancelTarget, lang)],
    };
}
