import type { HandlerContext } from '../core/router';
import type { ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { setTimezone, getTimezone, getPageSize, updateChatState } from '../data/db';
import { respond } from '../core/respond';
import { renderSettingsGeneral } from '../views/settings';
import { isValidTimezone } from '../infra/timezone';
import { cancelRow } from '../ui/components';
import { sendMessage } from '../integrations/telegram';

export async function timezoneInput(ctx: HandlerContext & { text: string; context: ChatContext }) {
    const { env, chatId, text: input } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;

    const tz = input.trim().toUpperCase();

    if (!isValidTimezone(tz)) {
        await sendMessage(env, chatId,
            `${t(lang, 'schedule.invalidFormat')}\n\n${t(lang, 'settings.timezoneInputDesc')}\n${t(lang, 'settings.timezoneInputExamples')}`,
            [cancelRow('settings:sub:general', lang)]
        );
        return;
    }

    await setTimezone(env, chatId, tz);
    await updateChatState(env, chatId, { current_view: 'settings', context: null });

    const savedTz = await getTimezone(env, chatId);
    const ps = await getPageSize(env, chatId);
    const view = renderSettingsGeneral(savedTz, ps, lang);
    await respond(env, chatId, view, { viewName: 'settings', context: null });
}
