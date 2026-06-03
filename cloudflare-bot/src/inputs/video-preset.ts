/**
 * Video Preset Input — handles preset name text input
 */

import type { HandlerContext } from '../core/router';
import type { ChatContext, VideoConfig } from '../types';
import { createVideoPreset, updateChatState } from '../data/db';
import { sendMessage } from '../integrations/telegram';
import { renderVideoConfig } from '../views';

export async function videoPresetNameInput(ctx: HandlerContext & { text: string; context: ChatContext }) {
    const { env, chatId, text, context } = ctx;

    const config = context.video_config;
    const repoId = context.selected_repo_id || 'standalone';

    if (!config) {
        await sendMessage(env, chatId, '❌ No video config found. Please try again.',
            [[{ text: '🏠 Home', callback_data: 'view:home' }]]
        );
        return;
    }

    const name = text.trim().substring(0, 50);
    if (!name) {
        await sendMessage(env, chatId, '❌ Preset name cannot be empty.');
        return;
    }

    await createVideoPreset(env, chatId, name, config as VideoConfig);
    await updateChatState(env, chatId, { context: { ...context, awaiting_input: undefined } });

    await sendMessage(env, chatId, `✅ Preset "<b>${name}</b>" saved!`,
        [[{ text: '◀️ Back to Config', callback_data: `action:video_create:${repoId}` }]]
    );
}
