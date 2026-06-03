import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { cancelRow } from '../ui/components';
import { updateChatState } from '../data/db';

export async function editAction(ctx: HandlerContext & { value: string; extra?: string }): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const draftId = ctx.extra!;
    await updateChatState(ctx.env, ctx.chatId, {
        context: { awaiting_input: 'edit_draft', selected_draft_id: draftId },
    });
    return {
        text: `${t(lang, 'actions.editDraftTitle')}\n\n${t(lang, 'actions.editDraftDesc')}`,
        keyboard: [cancelRow(`draft:${draftId}`, lang)],
    };
}
