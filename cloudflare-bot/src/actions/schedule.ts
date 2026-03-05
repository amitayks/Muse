import type { HandlerContext } from '../core/router';
import type { ViewResult, InlineButton } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getChatState, updateChatState, getTimezone } from '../data/db';
import { cancelRow } from '../ui/components';
import { applyOffset } from '../infra/timezone';

/**
 * Compute the cancel target callback_data for schedule flow based on origin view.
 * From a draft list → navigate back to that list view.
 * From draft detail → navigate back to the draft.
 */
export function scheduleCancelTarget(returnView: string | undefined, draftId: string): string {
    if (returnView?.startsWith('drafts_')) {
        return `view:${returnView}`;
    }
    return `draft:${draftId}`;
}

export async function scheduleAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.extra!;
    const tz = await getTimezone(ctx.env, ctx.chatId);

    // Capture origin view before overwriting state
    const currentState = await getChatState(ctx.env, ctx.chatId);
    const returnView = currentState?.current_view || 'draft';

    // Set awaiting_input so user can also type a full date+time directly
    await updateChatState(ctx.env, ctx.chatId, {
        context: {
            awaiting_input: 'schedule_time',
            selected_draft_id: draftId,
            schedule_return_view: returnView,
        },
    });

    const cancelTarget = scheduleCancelTarget(returnView, draftId);
    return renderScheduleDayPicker(draftId, tz, lang, cancelTarget);
}

/**
 * Render a day picker with 7 day buttons starting from today in user's timezone
 */
export function renderScheduleDayPicker(draftId: string, tz: string, lang: Lang = 'en', cancelTarget?: string): ViewResult {
    const now = new Date();
    const localNow = applyOffset(now, tz);

    const dayNameKeys = ['schedule.daySun', 'schedule.dayMon', 'schedule.dayTue', 'schedule.dayWed', 'schedule.dayThu', 'schedule.dayFri', 'schedule.daySat'];

    const dayButtons: InlineButton[][] = [];
    let row: InlineButton[] = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(localNow.getTime() + i * 24 * 60 * 60 * 1000);
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(date.getUTCDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const dayName = t(lang, dayNameKeys[date.getUTCDay()]);
        const label = i === 0 ? `${t(lang, 'schedule.today')} ${dd}` : i === 1 ? `${t(lang, 'schedule.tomorrow')} ${dd}` : `${dayName} ${dd}`;

        row.push({
            text: label,
            callback_data: `action:sched_day:${draftId}:${dateStr}`,
        });

        // 3 buttons per row (3, 3, 1)
        if (row.length === 3 || i === 6) {
            dayButtons.push([...row]);
            row = [];
        }
    }

    return {
        text: `${t(lang, 'schedule.dayPickerTitle')}

${t(lang, 'schedule.selectDay').replace('{tz}', tz)}

${t(lang, 'schedule.orSendFullDateTime')}`,
        keyboard: [
            ...dayButtons,
            cancelRow(cancelTarget || `draft:${draftId}`, lang),
        ],
    };
}
