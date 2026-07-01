/**
 * Compose mode actions — pen down, toggles, cancel
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, DraftContent, ComposeState, ContentSource, ComposeSourceCommit } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { getChatState, parseContext, updateChatState, createDraft, getTimezone, applyOverviewPatches } from '../data/db';
import { getUser } from '../data/user-db';
import { sendMessage, editMessage, deleteMessage, sendPhoto, sendMediaGroup } from '../integrations/telegram';
import { generateTweetImage } from '../ai/tweet-image';
import { renderCompose, renderDraftDetail } from '../views';
import { truncateHtml } from '../ui/utils';
import { renderHome } from '../views/home';
import { sanitizeError } from '../infra/security';

// ==================== SHARED PEN-DOWN HELPERS ====================

/** Extract common data from compose state for pen-down processing */
function extractComposeData(compose: ComposeState) {
    return {
        hasTweets: compose.tweets.length > 0,
        hasInstruction: !!(compose.instruction && compose.aiRefine),
        allOriginalMedia: compose.tweets.flatMap(tw => tw.media || []),
        userTweetTexts: compose.tweets.map(t => t.text).filter(Boolean),
    };
}

/** Send pen-down status message (AI refining / saving draft) */
async function sendPenDownStatus(
    env: import('../types').Env,
    chatId: string,
    compose: ComposeState,
    lang: Lang,
): Promise<number> {
    const statusText = compose.aiRefine
        ? t(lang, 'compose.refiningAi')
        : t(lang, 'compose.savingDraft');
    return sendMessage(env, chatId, statusText);
}

/** Build user image parts for AI analysis if analyzeImages is enabled */
async function buildUserImageParts(
    env: import('../types').Env,
    compose: ComposeState,
    allOriginalMedia: import('../types').TweetMedia[],
): Promise<import('../ai/gemini').ImagePart[] | undefined> {
    if (!compose.analyzeImages || allOriginalMedia.length === 0) return undefined;
    const { buildImageParts } = await import('../ai/gemini');
    const tweetsForParts = compose.tweets.map((t, i) => ({ text: t.text, index: i, media: t.media }));
    const parts = await buildImageParts(env, tweetsForParts);
    return parts?.length ? parts : undefined;
}

/** Re-attach user's original media to AI-generated content */
function reattachMedia(content: DraftContent, allOriginalMedia: import('../types').TweetMedia[]): void {
    if (allOriginalMedia.length > 0 && content.tweets.length > 0) {
        content.tweets[0].media = allOriginalMedia;
    }
}

/** Apply overview patches non-blocking (log errors, don't throw) */
async function applyOverviewPatchesSafe(
    env: import('../types').Env,
    repoId: string | undefined,
    updates: any,
): Promise<void> {
    if (!updates || !repoId) return;
    try {
        await applyOverviewPatches(env, repoId, updates);
    } catch (patchError) {
        console.error('Overview patch failed (non-blocking):', patchError);
    }
}

/** Navigate chat state to draft detail view */
async function navigateToDraft(
    env: import('../types').Env,
    chatId: string,
    draftId: string,
): Promise<void> {
    await updateChatState(env, chatId, {
        current_view: 'draft',
        context: { selected_draft_id: draftId },
    });
}

// ==================== COMPOSE ACTION DISPATCH ====================

export async function composeAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const lang = (ctx.lang || 'en') as Lang;
    const { env, chatId, value } = ctx;
    const state = await getChatState(env, chatId);
    const context = parseContext(state);
    const compose = context.compose;

    switch (value) {
        case 'pendown':
            await handlePenDown(env, chatId, compose, lang);
            return; // void — handled sending ourselves
        case 'toggle_image':
            return handleToggle(env, chatId, context, compose, 'imageGen', lang);
        case 'toggle_ai': {
            // When turning AI off, also clear analyzeImages
            if (compose?.aiRefine) {
                compose.analyzeImages = false;
            }
            return handleToggle(env, chatId, context, compose, 'aiRefine', lang);
        }
        case 'toggle_analyze': {
            // When turning Analyze ON, auto-enable AI (images are sent to AI)
            if (compose && !compose.analyzeImages) {
                compose.aiRefine = true;
            }
            return handleToggle(env, chatId, context, compose, 'analyzeImages', lang);
        }
        case 'toggle_instruct':
            return handleInstruct(env, chatId, context, compose, lang);
        case 'toggle_thread':
            return handleToggle(env, chatId, context, compose, 'fetchThread', lang);
        case 'toggle_lang':
            return handleToggleLang(env, chatId, context, compose, lang);
        case 'cancel':
            await handleCancel(env, chatId, ctx.messageId, compose, lang);
            return; // void — handled sending ourselves
        default:
            return renderHome(env, chatId, lang);
    }
}

// ==================== PEN-DOWN HANDLERS ====================

async function handlePenDown(
    env: import('../types').Env,
    chatId: string,
    compose: ComposeState | undefined,
    lang: Lang = 'en'
): Promise<void> {
    if (!compose) {
        const view = renderCompose([], [], false, false, lang);
        await sendMessage(env, chatId, view.text, view.keyboard);
        return;
    }

    if (compose.mode === 'repost') {
        await handleRepostPenDown(env, chatId, compose, lang);
    } else if (compose.mode === 'commit') {
        await handleCommitPenDown(env, chatId, compose, lang);
    } else {
        await handleHandwritePenDown(env, chatId, compose, lang);
    }
}

/** Handwrite mode pen down — existing refine/image gen logic */
async function handleHandwritePenDown(
    env: import('../types').Env,
    chatId: string,
    compose: ComposeState,
    lang: Lang,
): Promise<void> {
    const { hasTweets, hasInstruction, allOriginalMedia } = extractComposeData(compose);
    const effectiveLang = (compose.langOverride ?? lang) as Lang;

    if (!hasTweets && !hasInstruction) {
        const view = renderCompose([], [], compose.imageGen, compose.aiRefine, lang);
        await sendMessage(env, chatId, view.text, view.keyboard);
        return;
    }

    // Handwrite has a more granular status message (uses global lang for UI)
    const statusText = hasInstruction && !hasTweets
        ? t(lang, 'compose.generatingFromInstruction')
        : compose.aiRefine && compose.imageGen
            ? t(lang, 'compose.refiningAndImage')
            : compose.aiRefine
                ? t(lang, 'compose.refiningAi')
                : compose.imageGen
                    ? t(lang, 'compose.generatingImagePrompt')
                    : t(lang, 'compose.savingDraft');
    const statusMsgId = await sendMessage(env, chatId, statusText);

    const tweets = compose.tweets.map((t, i) => ({ text: t.text, index: i, media: t.media }));

    let content: DraftContent = {
        format: tweets.length === 1 ? 'single' : (tweets.length === 0 ? 'single' : 'thread'),
        tweets,
    };

    // Text refinement only — image generation is handled per-tweet in finalizeDraft.
    if (compose.aiRefine) {
        try {
            const { refineHandwrittenContent } = await import('../ai/gemini');
            const imageParts = await buildUserImageParts(env, compose, allOriginalMedia);
            content = await refineHandwrittenContent(env, content, {
                refineText: compose.aiRefine,
                instruction: compose.instruction,
                imageParts,
            }, effectiveLang, chatId);

            // Handwrite re-attaches per-tweet if same count, else first-tweet bulk
            if (content.tweets.length === tweets.length) {
                content.tweets = content.tweets.map((t, i) => ({ ...t, media: compose.tweets[i]?.media }));
            } else {
                reattachMedia(content, allOriginalMedia);
            }
        } catch (error) {
            console.error('AI refinement failed, using original:', error);
        }
    }

    const draftId = await finalizeDraft(env, chatId, compose, content, statusMsgId, 'handwrite', lang);
    await navigateToDraft(env, chatId, draftId);
}

/** Repost mode pen down — uses quote skill for AI, supports user tweets as "initial thoughts" */
async function handleRepostPenDown(
    env: import('../types').Env,
    chatId: string,
    compose: ComposeState,
    lang: Lang,
): Promise<void> {
    const { hasTweets, hasInstruction, allOriginalMedia, userTweetTexts } = extractComposeData(compose);
    const sourceTweet = compose.sourceTweet;
    const effectiveLang = (compose.langOverride ?? lang) as Lang;

    // Repost allows pen down with just source tweet (AI generates everything)
    if (!sourceTweet && !hasTweets && !hasInstruction) {
        const view = buildComposeView(compose, lang);
        await sendMessage(env, chatId, view.text, view.keyboard);
        return;
    }

    const statusMsgId = await sendPenDownStatus(env, chatId, compose, lang);

    // Fetch thread context on-demand when thread toggle is ON
    if (compose.fetchThread && sourceTweet && !sourceTweet.threadText) {
        try {
            const { searchConversation, getMediaUrl: getMediaUrlFromExpansion } = await import('../integrations/x');
            const { getTweetById } = await import('../integrations/x');

            // Get conversation_id from the source tweet (need to re-fetch if not available)
            const tweetResult = await getTweetById(env, sourceTweet.tweetId);
            const conversationId = tweetResult?.tweet.conversation_id;

            if (conversationId) {
                const { tweets: threadTweets, media: threadMedia } = await searchConversation(
                    env, conversationId, sourceTweet.username
                );
                if (threadTweets.length > 1) {
                    const sorted = threadTweets
                        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
                        .slice(0, 10);
                    sourceTweet.threadText = sorted.map(t => t.text).join('\n\n---\n\n');
                    sourceTweet.text = sourceTweet.threadText;
                    sourceTweet.isThread = true;

                    // Collect thread media
                    if (threadMedia) {
                        const threadMediaUrls: string[] = sourceTweet.mediaUrls ? [...sourceTweet.mediaUrls] : [];
                        for (const t of sorted) {
                            const url = getMediaUrlFromExpansion(threadMedia, t);
                            if (url && !threadMediaUrls.includes(url)) {
                                threadMediaUrls.push(url);
                            }
                        }
                        if (threadMediaUrls.length > 0) sourceTweet.mediaUrls = threadMediaUrls;
                    }
                }
            }
        } catch (err) {
            console.warn('[compose] Thread fetch failed, proceeding without thread:', err);
        }
    }

    let content: DraftContent;

    if (compose.aiRefine && sourceTweet) {
        // AI-powered repost: call generateRepostContent with extended context
        try {
            const { generateRepostContent } = await import('../ai/repost-generate');
            const { getTwitterAccount, getTwitterAccountOverview, parseTwitterAccountConfig } = await import('../data/db');

            // Build a TwitterTweet-like object from sourceTweet
            const tweetData = {
                id: sourceTweet.tweetId,
                chat_id: chatId,
                account_id: compose.sourceAccountId || '',
                text: sourceTweet.text,
                author_username: sourceTweet.username,
                is_thread: sourceTweet.isThread ? 1 : 0,
                tweet_url: sourceTweet.tweetUrl,
                media_url: sourceTweet.mediaUrl || null,
            } as import('../types').TwitterTweet;

            // Get account config for persona
            let config = {} as import('../types').TwitterAccountConfig;
            if (compose.sourceAccountId) {
                const account = await getTwitterAccount(env, chatId, compose.sourceAccountId);
                if (account) config = parseTwitterAccountConfig(account);
            }

            const userImageParts = await buildUserImageParts(env, compose, allOriginalMedia);

            const generated = await generateRepostContent(env, tweetData, compose.sourceAccountId || '', config, {
                imageUrls: sourceTweet.mediaUrls || (sourceTweet.mediaUrl ? [sourceTweet.mediaUrl] : []),
                language: effectiveLang,
                userTweets: userTweetTexts,
                instruction: compose.instruction,
                threadText: sourceTweet.threadText,
                userImageParts,
                relevanceReason: sourceTweet.relevanceReason,
            });

            if (generated) {
                content = generated;
                reattachMedia(content, allOriginalMedia);
            } else {
                content = buildDirectContent(compose);
            }
        } catch (error) {
            console.error('Repost AI generation failed, saving directly:', error);
            content = buildDirectContent(compose);
        }
    } else {
        // No AI — save user tweets directly (or empty if just source tweet)
        content = buildDirectContent(compose);
    }

    const draftId = await finalizeDraft(env, chatId, compose, content, statusMsgId, 'repost', lang);

    // Link batch tweet if applicable
    if (compose.batchTweetId) {
        try {
            const { updateTwitterTweet } = await import('../data/db');
            await updateTwitterTweet(env, compose.batchTweetId, { status: 'drafted', draft_id: draftId });
        } catch (err) {
            console.error('Failed to link batch tweet:', err);
        }
    }

    await navigateToDraft(env, chatId, draftId);

    // Follow prompt moved to publish action — only shown after draft is actually posted
}

/** Commit mode pen down — uses work-progress skill for AI, supports user tweets as "initial thoughts" */
async function handleCommitPenDown(
    env: import('../types').Env,
    chatId: string,
    compose: ComposeState,
    lang: Lang,
): Promise<void> {
    const { hasTweets, hasInstruction, allOriginalMedia, userTweetTexts } = extractComposeData(compose);
    const sourceCommit = compose.sourceCommit;
    const effectiveLang = (compose.langOverride ?? lang) as Lang;

    // Commit allows pen down with just source commit (AI generates everything)
    if (!sourceCommit && !hasTweets && !hasInstruction) {
        const view = buildComposeView(compose, lang);
        await sendMessage(env, chatId, view.text, view.keyboard);
        return;
    }

    // AI off, no tweets — nothing to save, re-render
    if (!compose.aiRefine && !hasTweets) {
        const view = buildComposeView(compose, lang);
        await sendMessage(env, chatId, view.text, view.keyboard);
        return;
    }

    const statusMsgId = await sendPenDownStatus(env, chatId, compose, lang);

    let content: DraftContent;

    if (compose.aiRefine && sourceCommit) {
        // AI-powered commit: reconstruct ContentSource and call generateContent with user context
        try {
            const { generateContent } = await import('../ai/gemini');
            const contentSource = reconstructContentSource(sourceCommit);
            const userImageParts = await buildUserImageParts(env, compose, allOriginalMedia);

            const result = await generateContent(
                env, contentSource, sourceCommit.repoId, effectiveLang, chatId,
                {
                    userTweets: userTweetTexts.length > 0 ? userTweetTexts : undefined,
                    instruction: compose.instruction,
                    userImageParts,
                },
            );

            content = result.content;
            await applyOverviewPatchesSafe(env, sourceCommit.repoId, result.overviewUpdates);
            reattachMedia(content, allOriginalMedia);
        } catch (error) {
            console.error('Commit AI generation failed, saving directly:', error);
            content = buildDirectContent(compose);
        }
    } else {
        // No AI — save user tweets directly
        content = buildDirectContent(compose);
    }

    const draftId = await finalizeDraft(env, chatId, compose, content, statusMsgId, 'commit', lang, {
        prNumber: sourceCommit?.prNumber || 0,
        prTitle: sourceCommit ? `${sourceCommit.repoShort} | ${sourceCommit.title}` : undefined,
        commitSha: sourceCommit?.commitSha || '',
        eventId: compose.eventId,
    });

    // Link draft back to commit event
    if (compose.eventId) {
        const { updateCommitEvent } = await import('../data/commit-events-db');
        await updateCommitEvent(env, compose.eventId, { status: 'drafted', draftId });
    }

    await navigateToDraft(env, chatId, draftId);
}

// ==================== CONTENT BUILDERS ====================

/** Reconstruct a ContentSource from ComposeSourceCommit for passing to generateContent */
function reconstructContentSource(sc: ComposeSourceCommit): ContentSource {
    if (sc.type === 'pr' && sc.prNumber) {
        return {
            type: 'pr',
            repo: sc.repo,
            data: {
                number: sc.prNumber,
                title: sc.title,
                body: '',
                commits: [sc.commitSha],
                commitMessages: sc.commitMessages,
                fileNames: sc.fileNames,
                files_changed: sc.filesChanged,
                additions: sc.additions,
                deletions: sc.deletions,
                merged_at: '',
                author: sc.author,
            },
        };
    }
    return {
        type: 'commit',
        repo: sc.repo,
        data: {
            sha: sc.commitSha,
            title: sc.title,
            body: '',
            commitMessages: sc.commitMessages,
            fileNames: sc.fileNames,
            files_changed: sc.filesChanged,
            additions: sc.additions,
            deletions: sc.deletions,
            author: sc.author,
            date: '',
        },
    };
}

/** Build DraftContent directly from compose tweets (no AI) */
function buildDirectContent(compose: ComposeState): DraftContent {
    const tweets = compose.tweets.map((t, i) => ({ text: t.text, index: i, media: t.media }));

    // If no user tweets but we have a source tweet, create a placeholder
    if (tweets.length === 0 && compose.sourceTweet) {
        return { format: 'single', tweets: [{ text: '', index: 0 }] };
    }

    return {
        format: tweets.length === 1 ? 'single' : (tweets.length === 0 ? 'single' : 'thread'),
        tweets,
    };
}

// ==================== DRAFT FINALIZATION ====================

/** Shared draft finalization: create draft, handle images, show draft detail */
async function finalizeDraft(
    env: import('../types').Env,
    chatId: string,
    compose: ComposeState,
    content: DraftContent,
    statusMsgId: number,
    source: 'handwrite' | 'repost' | 'commit',
    lang: Lang,
    commitOverrides?: {
        prNumber?: number;
        prTitle?: string;
        commitSha?: string;
        eventId?: string;
    },
): Promise<string> {
    const defaultLabel = source === 'repost' ? 'Repost draft' : source === 'commit' ? 'Commit draft' : 'Handwritten draft';
    const firstTweet = content.tweets[0]?.text || defaultLabel;
    const prTitle = commitOverrides?.prTitle || (firstTweet.length > 100 ? firstTweet.substring(0, 97) + '...' : firstTweet);

    const user = await getUser(env, chatId);
    const hasVideo = content.tweets.some(t => t.media?.some(m => m.type === 'video')) ? 1 : 0;

    const draftId = await createDraft(env, chatId, {
        pr_number: commitOverrides?.prNumber || 0,
        pr_title: prTitle,
        commit_sha: commitOverrides?.commitSha || '',
        content: JSON.stringify(content),
        source,
        publish_targets: user?.default_publish_targets || undefined,
        has_video: hasVideo,
        original_tweet_id: compose.sourceTweet?.tweetId,
        original_tweet_url: compose.sourceTweet?.tweetUrl,
        event_id: commitOverrides?.eventId,
        // Persist the session's effective language so a later AI refine respects it.
        language: compose.langOverride ?? lang,
    });

    // Collect per-tweet media URLs
    const perTweetMediaUrls: string[] = [];
    if (env.WORKER_URL) {
        for (const tweet of content.tweets) {
            for (const media of tweet.media || []) {
                if (media.type === 'photo') {
                    perTweetMediaUrls.push(`${env.WORKER_URL}/media/${media.key}`);
                }
            }
        }
    }

    // Image: use an uploaded image if present, else generate one per-tweet when requested.
    let imageUrl: string | null = null;
    if (perTweetMediaUrls.length > 0) {
        imageUrl = perTweetMediaUrls[0];
    } else if (compose.imageGen) {
        await editMessage(env, chatId, statusMsgId, t(lang, 'compose.generatingImage'));
        try {
            const generated = await generateTweetImage(env, chatId, draftId, 0);
            if (env.WORKER_URL) {
                imageUrl = `${env.WORKER_URL}/media/${generated.media.key}`;
            }
        } catch (imgError) {
            console.error('Image generation failed:', sanitizeError(imgError));
        }
    }

    const tz = await getTimezone(env, chatId);
    const view = await renderDraftDetail(env, chatId, draftId, tz, lang);

    let finalMessageId: number;
    let albumMessageIds: number[] | undefined;

    if (imageUrl) {
        if (perTweetMediaUrls.length >= 2) {
            try {
                albumMessageIds = await sendMediaGroup(env, chatId, perTweetMediaUrls.slice(1, 10));
            } catch (albumError) {
                console.error('Album send failed:', sanitizeError(albumError));
            }
        }
        try { await deleteMessage(env, chatId, statusMsgId); } catch { /* ignore */ }
        const caption = truncateHtml(view.text, 1024);
        finalMessageId = await sendPhoto(env, chatId, imageUrl, caption, view.keyboard);
    } else {
        await editMessage(env, chatId, statusMsgId, view.text, view.keyboard);
        finalMessageId = statusMsgId;
    }

    await updateChatState(env, chatId, {
        message_id: finalMessageId,
        context: { selected_draft_id: draftId, album_message_ids: albumMessageIds },
    });

    return draftId;
}

// ==================== TOGGLE & CANCEL ====================

async function handleToggle(
    env: import('../types').Env,
    chatId: string,
    context: import('../types').ChatContext,
    compose: ComposeState | undefined,
    field: 'imageGen' | 'aiRefine' | 'analyzeImages' | 'fetchThread',
    lang: Lang = 'en'
): Promise<ViewResult> {
    if (!compose) {
        return renderHome(env, chatId, lang);
    }

    compose[field] = !compose[field];

    await updateChatState(env, chatId, {
        context: {
            ...context,
            compose,
        },
    });

    return buildComposeView(compose, lang);
}

async function handleInstruct(
    env: import('../types').Env,
    chatId: string,
    context: import('../types').ChatContext,
    compose: ComposeState | undefined,
    lang: Lang = 'en'
): Promise<ViewResult> {
    if (!compose) {
        return renderHome(env, chatId, lang);
    }

    compose.awaitingInstruction = true;
    compose.aiRefine = true; // auto-enable AI when instructing

    await updateChatState(env, chatId, {
        context: {
            ...context,
            compose,
        },
    });

    const view = buildComposeView(compose, lang);
    view.toast = t(lang, 'compose.instructToast');
    return view;
}

async function handleToggleLang(
    env: import('../types').Env,
    chatId: string,
    context: import('../types').ChatContext,
    compose: ComposeState | undefined,
    lang: Lang = 'en'
): Promise<ViewResult> {
    if (!compose) {
        return renderHome(env, chatId, lang);
    }

    // Toggle: if override matches opposite of global, clear it; otherwise set to opposite
    const opposite = lang === 'en' ? 'he' : 'en';
    compose.langOverride = compose.langOverride ? undefined : opposite;

    await updateChatState(env, chatId, {
        context: {
            ...context,
            compose,
        },
    });

    return buildComposeView(compose, lang);
}

function buildComposeView(compose: ComposeState, lang: Lang): ViewResult {
    const composeTweets = compose.tweets.map((t) => {
        return { text: t.text, mediaCount: t.media?.length || 0 };
    });

    return renderCompose(composeTweets, [], compose.imageGen, compose.aiRefine, lang, {
        instruction: compose.instruction,
        awaitingInstruction: compose.awaitingInstruction,
        analyzeImages: compose.analyzeImages,
        fetchThread: compose.fetchThread,
        sourceTweet: compose.sourceTweet,
        sourceCommit: compose.sourceCommit,
        langOverride: compose.langOverride,
        globalLang: lang as 'en' | 'he',
    });
}

async function handleCancel(
    env: import('../types').Env,
    chatId: string,
    messageId: number | undefined,
    compose: ComposeState | undefined,
    lang: Lang = 'en'
): Promise<void> {
    const view = await renderHome(env, chatId, lang);
    const hadTweets = compose && compose.tweets.length > 0;

    if (hadTweets) {
        // User sent messages — send new message to continue conversation flow
        const newMsgId = await sendMessage(env, chatId, view.text, view.keyboard);
        await updateChatState(env, chatId, {
            message_id: newMsgId,
            current_view: 'home',
            context: null,
        });
    } else {
        // No messages sent — edit the compose message in place
        if (messageId) {
            await editMessage(env, chatId, messageId, view.text, view.keyboard);
        }
        await updateChatState(env, chatId, {
            current_view: 'home',
            context: null,
        });
    }
}
