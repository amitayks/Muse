/**
 * Repost Preview Actions — Generation trigger, cancel
 *
 * @deprecated These handlers use the old repost_preview flow.
 * New code uses compose mode (enterComposeMode) for reposts and
 * fast_gen / edit_rp for batch notifications. Kept for backward
 * compatibility with in-flight callback buttons.
 *
 * Handles: rp_gen:TWEET_ID, rp_gen_anyway:TWEET_ID, rp_cancel
 */

import type { ActionHandler } from '../core/router';
import type { TwitterAccountConfig, ViewResult } from '../types';
import {
    getChatState, parseContext, updateChatState, createDraft,
    getTwitterAccounts, getTwitterAccountOverview, parseTwitterAccountConfig,
    getTimezone,
} from '../data/db';
import { getUser } from '../data/user-db';
import { renderRepostGenerating } from '../views/repost';
import { renderError } from '../views';
import { editMessage, sendMessage, deleteMessage, sendPhoto } from '../integrations/telegram';
import { generateRepostContent } from '../ai/repost-generate';
import { ensureImage } from '../data/storage';
import { renderDraftDetail } from '../views/drafts';
import { truncateHtml } from '../ui/utils';
import { homeButton } from '../ui/components';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';

/** Generate repost (and rp_gen_anyway for duplicates) */
export const rpGenAction: ActionHandler = async (ctx) => {
    const lang = (ctx.lang || 'en') as Lang;
    const tweetId = ctx.value;

    const state = await getChatState(ctx.env, ctx.chatId);
    const context = parseContext(state);
    const preview = context.repost_preview;

    if (!preview) {
        return renderError('Preview context lost. Please try /repost again.', lang);
    }

    // Show generating state
    if (ctx.messageId) {
        const genView = renderRepostGenerating(preview.username, lang);
        await editMessage(ctx.env, ctx.chatId, ctx.messageId, genView.text, genView.keyboard);
    }

    // Load persona context
    let persona: string | null = null;
    let config: TwitterAccountConfig | null = null;

    // Check if followed
    const accounts = await getTwitterAccounts(ctx.env, ctx.chatId);
    const followedAccount = accounts.find(
        a => a.username.toLowerCase() === preview.username.toLowerCase()
    );

    if (followedAccount) {
        config = parseTwitterAccountConfig(followedAccount);
        const overview = await getTwitterAccountOverview(ctx.env, ctx.chatId, followedAccount.id);
        persona = overview?.persona || null;
    }

    // No on-demand persona generation — persona only exists for followed accounts

    // Use followed account config or defaults
    const effectiveConfig = config || {
        relevanceThreshold: 6,
        autoApprove: false,
        analyzeMedia: true,
    };

    // Build a minimal tweet object for generateRepostContent
    const tweetObj = {
        id: preview.tweet_id,
        account_id: followedAccount?.id || '',
        chat_id: ctx.chatId,
        conversation_id: null,
        thread_position: 0,
        is_thread: preview.thread_text ? 1 : 0,
        text: preview.thread_text || preview.tweet_text,
        author_username: preview.username,
        author_profile_image_url: preview.author_profile_image_url || null,
        author_display_name: preview.author_name || null,
        metrics: null,
        tweet_url: `https://x.com/${preview.username}/status/${preview.tweet_id}`,
        tweeted_at: null,
        relevance_score: null,
        relevance_reason: null,
        status: 'pending' as const,
        draft_id: null,
        batch_message_id: null,
        media_url: preview.media_url || null,
        created_at: new Date().toISOString(),
    };

    // Generate content (with image if available)
    const content = await generateRepostContent(
        ctx.env, tweetObj, followedAccount?.id || '', effectiveConfig, persona, preview.media_url, lang
    );

    if (!content) {
        if (ctx.messageId) {
            await editMessage(ctx.env, ctx.chatId, ctx.messageId,
                `${t(lang, 'actions.generationFailed')}\n\n${t(lang, 'actions.generationFailedMsg')}`,
                [[{ text: t(lang, 'actions.btnRetry'), callback_data: `rp_gen:${tweetId}` }, homeButton(lang)]]
            );
        }
        return;
    }

    // Create draft
    const tweetPreview = preview.tweet_text.substring(0, 30).replace(/\n/g, ' ');
    const rpUser = await getUser(ctx.env, ctx.chatId);
    const draftId = await createDraft(ctx.env, ctx.chatId, {
        pr_number: 0,
        pr_title: `@${preview.username} | ${tweetPreview}...`,
        commit_sha: preview.tweet_id,
        source: 'repost',
        content: JSON.stringify(content),
        original_tweet_id: preview.tweet_id,
        original_tweet_url: `https://x.com/${preview.username}/status/${preview.tweet_id}`,
        publish_targets: rpUser?.default_publish_targets || undefined,
    });

    // Clear preview context
    await updateChatState(ctx.env, ctx.chatId, {
        current_view: 'draft_detail',
        context: { selected_draft_id: draftId },
    });

    // Generate image
    let imageUrl: string | null = null;
    if (ctx.messageId) {
        await editMessage(ctx.env, ctx.chatId, ctx.messageId, t(lang, 'actions.generatingImage'));
    }
    try {
        imageUrl = await ensureImage(ctx.env, ctx.chatId, { id: draftId, content: JSON.stringify(content) });
    } catch (error) {
        console.error('[rp_gen] Image generation failed:', error);
    }

    // Show draft detail
    const tz = await getTimezone(ctx.env, ctx.chatId);
    const view = await renderDraftDetail(ctx.env, ctx.chatId, draftId, tz, lang);

    if (imageUrl && ctx.messageId) {
        try { await deleteMessage(ctx.env, ctx.chatId, ctx.messageId); } catch { /* ignore */ }
        const fullImageUrl = `${ctx.env.WORKER_URL}${imageUrl}`;
        const caption = truncateHtml(view.text, 1000);
        await sendPhoto(ctx.env, ctx.chatId, fullImageUrl, caption, view.keyboard);
    } else if (ctx.messageId) {
        await editMessage(ctx.env, ctx.chatId, ctx.messageId, view.text, view.keyboard);
    }

    // Follow prompt for non-followed accounts
    if (!preview.is_followed) {
        await sendMessage(ctx.env, ctx.chatId,
            t(lang, 'actions.followPrompt').replace('{username}', preview.username),
            [
                [
                    { text: t(lang, 'actions.btnFollow'), callback_data: `rp_follow:${preview.username}` },
                    { text: t(lang, 'actions.btnNoThanks'), callback_data: `rp_no_follow:0` },
                ],
            ]
        );
    }

    return;
};

/** Cancel repost — return home */
export const rpCancelAction: ActionHandler = async (ctx) => {
    const lang = (ctx.lang || 'en') as Lang;
    await updateChatState(ctx.env, ctx.chatId, { current_view: 'home', context: null });
    const { renderHome } = await import('../views');
    return renderHome(ctx.env, ctx.chatId, lang);
};
