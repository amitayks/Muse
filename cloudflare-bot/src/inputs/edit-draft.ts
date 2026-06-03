import type { HandlerContext } from '../core/router';
import type { ChatContext, InlineButton } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { respond } from '../core/respond';
import { updateChatState, getDraft, updateDraftContent } from '../data/db';
import { editContent } from '../ai/gemini';
import { sendMessage, editMessage } from '../integrations/telegram';
import { renderError } from '../views';
import { cancelRow } from '../ui/components';
import { sanitizeError } from '../infra/security';
import type { DraftContent } from '../types';

export async function editDraftInput(ctx: HandlerContext & { text: string; context: ChatContext }) {
    const { env, chatId, text: instruction, context } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;

    const draftId = context.selected_draft_id;
    if (!draftId) {
        await updateChatState(env, chatId, { context: null });
        await respond(env, chatId, renderError(t(lang, 'editDraft.noDraftSelected'), lang));
        return;
    }

    try {
        const draft = await getDraft(env, draftId, chatId);
        if (!draft) {
            await updateChatState(env, chatId, { context: null });
            await respond(env, chatId, renderError(t(lang, 'error.draftNotFound'), lang));
            return;
        }

        const currentContent = JSON.parse(draft.content) as DraftContent;

        const editingView = {
            text: `${t(lang, 'editDraft.editing')}\n\n${t(lang, 'editDraft.applying').replace('{instruction}', instruction)}`,
            keyboard: [] as InlineButton[][],
        };
        const messageId = await sendMessage(env, chatId, editingView.text);

        const refinedContent = await editContent(env, currentContent, instruction, chatId, lang);

        await updateDraftContent(env, draftId, chatId, JSON.stringify(refinedContent));
        await updateChatState(env, chatId, { context: null });

        await editMessage(env, chatId, messageId,
            `${t(lang, 'editDraft.updated')}\n\n${t(lang, 'editDraft.applied').replace('{instruction}', instruction)}`,
            [[{ text: t(lang, 'editDraft.btnViewDraft'), callback_data: `draft:${draftId}` }]]
        );
    } catch (error) {
        console.error('Edit draft error:', sanitizeError(error));
        // Keep awaiting_input so user can retry with a different instruction
        await sendMessage(env, chatId,
            `${t(lang, 'editDraft.editFailed')}\n\n${t(lang, 'editDraft.editFailedMsg')}`,
            [cancelRow(`draft:${draftId}`, lang)]
        );
    }
}
