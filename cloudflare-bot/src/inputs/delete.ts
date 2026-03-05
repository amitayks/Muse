import type { HandlerContext } from '../core/router';
import type { ChatContext } from '../types';
import type { Lang } from '../ui/strings';
import { respond } from '../core/respond';
import { updateChatState } from '../data/db';
import { renderError } from '../views';

export async function deleteInput(ctx: HandlerContext & { text: string; context: ChatContext }) {
    const { env, chatId } = ctx;
    const lang = ((ctx as any).lang || 'en') as Lang;
    await updateChatState(env, chatId, { context: null });
    await respond(env, chatId, renderError('Delete functionality coming soon.', lang));
}
