/**
 * Quick actions from draft list views — approve, publish, delete inline
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult } from '../types';
import type { Lang } from '../ui/strings';
import type { DraftListType } from '../views/drafts';
import { shortToListType } from '../views/drafts';
import { getDraft, deleteDraft, updateDraftStatus, getPageSize, countDrafts, countDraftsBySource } from '../services/db';
import { publishDraft } from '../core/publish';
import { renderDraftsList, renderError } from '../views';
import { t } from '../ui/strings';

/**
 * Parse the extra field: "draftId:shortType:page"
 * shortType is abbreviated (a/h/v/s/p) to stay under Telegram's 64-byte callback_data limit
 */
function parseListContext(extra?: string): { draftId: string; listType: DraftListType; page: number } | null {
    if (!extra) return null;
    const parts = extra.split(':');
    if (parts.length < 3) return null;
    const raw = parts[1];
    const listType = shortToListType[raw] || raw as DraftListType;
    return {
        draftId: parts[0],
        listType,
        page: parseInt(parts[2], 10) || 0,
    };
}

async function countForListType(env: import('../types').Env, chatId: string, listType: DraftListType): Promise<number> {
    if (listType === 'auto') return countDraftsBySource(env, chatId, 'auto', ['draft']);
    if (listType === 'handwrite') return countDraftsBySource(env, chatId, 'handwrite', ['draft']);
    if (listType === 'approved') return countDrafts(env, chatId, 'approved');
    if (listType === 'scheduled') return countDrafts(env, chatId, 'scheduled');
    if (listType === 'published') return countDrafts(env, chatId, 'published');
    return 0;
}

async function reRenderList(env: import('../types').Env, chatId: string, listType: DraftListType, page: number, lang: Lang): Promise<ViewResult> {
    const ps = await getPageSize(env, chatId);
    // Clamp page to valid range — after delete/approve/publish the current page may be empty
    const total = await countForListType(env, chatId, listType);
    const totalPages = Math.ceil(total / ps);
    const safePage = totalPages > 0 ? Math.min(page, totalPages - 1) : 0;
    return renderDraftsList(env, chatId, safePage, listType, ps, lang);
}

export async function listApproveAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const parsed = parseListContext(ctx.extra);
    if (!parsed) return renderError('Invalid action.', lang);

    const { draftId, listType, page } = parsed;
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return renderError('Draft not found.', lang);

    await updateDraftStatus(ctx.env, draftId, ctx.chatId, 'approved');
    return reRenderList(ctx.env, ctx.chatId, listType, page, lang);
}

export async function listPublishAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const parsed = parseListContext(ctx.extra);
    if (!parsed) return renderError('Invalid action.', lang);

    const { draftId, listType, page } = parsed;
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return renderError('Draft not found.', lang);

    try {
        await publishDraft(ctx.env, ctx.chatId, draft);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return renderError(`Publishing failed:\n\n<code>${msg}</code>`, lang);
    }

    return reRenderList(ctx.env, ctx.chatId, listType, page, lang);
}

export async function listDeleteAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const parsed = parseListContext(ctx.extra);
    if (!parsed) return renderError('Invalid action.', lang);

    const { draftId, listType, page } = parsed;
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);
    if (!draft) return renderError('Draft not found.', lang);

    const title = draft.pr_title.length > 40 ? draft.pr_title.substring(0, 37) + '...' : draft.pr_title;

    // Use abbreviated codes to stay under Telegram's 64-byte callback_data limit
    const lt = Object.entries(shortToListType).find(([, v]) => v === listType)?.[0] || listType;
    return {
        text: `${t(lang, 'actions.listDeleteTitle')}\n\n"${title}"\n\n${t(lang, 'actions.listDeleteWarn')}`,
        keyboard: [
            [
                { text: t(lang, 'actions.btnYesDelete'), callback_data: `action:lyd:${draftId}:${lt}:${page}` },
                { text: t(lang, 'common.cancel'), callback_data: `action:lnd:${draftId}:${lt}:${page}`, style: 'danger' },
            ],
        ],
    };
}

export async function listConfirmDeleteAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const parsed = parseListContext(ctx.extra);
    if (!parsed) return renderError('Invalid action.', lang);

    const { draftId, listType, page } = parsed;
    const draft = await getDraft(ctx.env, draftId, ctx.chatId);

    if (draft) {
        // Delete R2 image if exists (best-effort)
        if (draft.image_url) {
            try {
                await ctx.env.IMAGES.delete(draft.image_url);
            } catch (err) {
                console.error('R2 image cleanup failed:', err);
            }
        }
        await deleteDraft(ctx.env, draftId, ctx.chatId);
    }

    return reRenderList(ctx.env, ctx.chatId, listType, page, lang);
}

export async function listCancelDeleteAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult> {
    const lang = (ctx.lang || 'en') as Lang;
    const parsed = parseListContext(ctx.extra);
    if (!parsed) return renderError('Invalid action.', lang);

    return reRenderList(ctx.env, ctx.chatId, parsed.listType, parsed.page, lang);
}
