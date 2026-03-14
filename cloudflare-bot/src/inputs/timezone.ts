import type { HandlerContext } from '../core/router';
import type { ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { setTimezone, getTimezone, getPageSize, updateChatState } from '../data/db';
import { getUser } from '../data/user-db';
import { getRepostDefaults, getCommitDefaults } from '../data/user-settings-db';
import { respond } from '../core/respond';
import { renderSettings } from '../views/settings';
import { isValidTimezone } from '../infra/timezone';
import { cancelRow } from '../ui/components';
import { sendMessage } from '../integrations/telegram';
import { countStalePrompts } from '../ai/prompts';
import { isAdmin } from '../infra/security';

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
    const user = await getUser(env, chatId);
    const rpDefaults = await getRepostDefaults(env, chatId);
    const cmDefaults = await getCommitDefaults(env, chatId);
    const view = renderSettings(savedTz, ps, lang, env.WORKER_URL, staleCount, isAdminUser, user?.default_publish_targets, user?.has_instagram === 1, rpDefaults, cmDefaults);
    await respond(env, chatId, view, { viewName: 'settings', context: null });
}
