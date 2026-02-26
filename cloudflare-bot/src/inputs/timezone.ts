import type { HandlerContext } from '../core/router';
import type { ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { setTimezone, getTimezone, getPageSize, updateChatState } from '../services/db';
import { respond } from '../core/respond';
import { renderSettings } from '../views/settings';
import { isValidTimezone } from '../services/timezone';
import { cancelRow } from '../ui/components';
import { sendMessage } from '../services/telegram';
import { countStalePrompts } from '../services/prompts';
import { isAdmin } from '../services/security';

export async function timezoneInput(ctx: HandlerContext & { text: string; context: ChatContext }) {
    const { env, chatId, text: input } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;

    const tz = input.trim().toUpperCase();

    if (!isValidTimezone(tz)) {
        await sendMessage(env, chatId,
            `${t(lang, 'schedule.invalidFormat')}\n\n${t(lang, 'settings.timezoneInputDesc')}\n${t(lang, 'settings.timezoneInputExamples')}`,
            [cancelRow('view:settings', lang)]
        );
        return;
    }

    await setTimezone(env, chatId, tz);
    await updateChatState(env, chatId, { current_view: 'settings', context: null });

    const savedTz = await getTimezone(env, chatId);
    const ps = await getPageSize(env, chatId);
    const staleCount = await countStalePrompts(env, chatId);
    const isAdminUser = isAdmin(chatId, env);
    const view = renderSettings(savedTz, ps, lang, env.WORKER_URL, staleCount, isAdminUser);
    await respond(env, chatId, view, { viewName: 'settings', context: null });
}
