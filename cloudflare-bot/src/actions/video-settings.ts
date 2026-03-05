/**
 * Video Settings actions — character/look management, defaults, account config
 */

import type { HandlerContext } from '../core/router';
import type { ViewResult, HeyGenCharacter, VideoSettings, InlineButton } from '../types';
import { getVideoSettings, updateVideoSettings, updateChatState, getChatState, parseContext } from '../data/db';
import { sendMessage, editMessage } from '../integrations/telegram';
import { logInfo, logError } from '../infra/security';
import { errorWithBackView, selectedItemLabel, backButton, cancelRow } from '../ui/components';
import type { Lang } from '../ui/strings';
import { escapeHtml } from '../ui/utils';
import {
    renderVideoSettingsHome,
    renderCharacterList,
    renderCharacterDetail,
    renderRemoveCharacterConfirm,
    renderVoiceSelect,
    renderEmotionSelect,
    renderDefaultSettings,
    renderHeyGenSettings,
    renderInstagramSettings,
} from '../views/video-settings';

/**
 * Main video settings callback handler
 * Callback data: vsettings:ACTION or vsettings:ACTION:PARAM or vsettings:ACTION:PARAM:PARAM2
 */
export async function videoSettingsAction(
    ctx: HandlerContext & { value: string; extra?: string }
): Promise<ViewResult | void> {
    const { env, chatId, value, extra } = ctx;
    const settings = await getVideoSettings(env, chatId);

    // Parse compound value — value may be the action, extra may have params
    // Callback format: vsettings:value[:extra]
    // The router splits on first : giving prefix=vsettings, then value=rest
    // But our router splits into prefix:value:extra
    // So value = "characters" or "char_detail", extra = groupId or groupId:more

    switch (value) {
        case 'home':
            return renderVideoSettingsHome(settings);

        case 'characters':
            return renderCharacterList(settings);

        case 'char_detail': {
            const stateCD0 = await getChatState(env, chatId);
            const contextCD0 = parseContext(stateCD0);
            const groupId = extra || contextCD0.selectedCharGroupId || '';
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            // Persist selected character groupId in context for short callbacks
            await updateChatState(env, chatId, {
                context: { ...contextCD0, selectedCharGroupId: groupId },
            });

            return renderCharacterDetail(char);
        }

        case 'add_character': {
            // Enter character creation compose mode
            const state = await getChatState(env, chatId);
            const context = parseContext(state);
            await updateChatState(env, chatId, {
                context: {
                    ...context,
                    characterCreate: { active: true, step: 'awaiting_photos', assetIds: [] },
                },
            });
            return {
                text: `📷 <b>Create New Character</b>\n\n` +
                    `Send photos of the person to create an avatar.\n\n` +
                    `<b>Photo Tips:</b>\n` +
                    `• 5-10 photos recommended\n` +
                    `• Mix of angles: front, 3/4, profile\n` +
                    `• Mix of expressions: smile, neutral, serious\n` +
                    `• Good lighting, no harsh shadows\n` +
                    `• High resolution, face clearly visible\n\n` +
                    `Send your first photo to begin.`,
                keyboard: [
                    cancelRow('vsettings:cancel_character', (ctx.lang || 'en') as Lang),
                ],
            };
        }

        case 'cancel_character': {
            // Cancel character creation, return to characters list
            const state3 = await getChatState(env, chatId);
            const context3 = parseContext(state3);
            await updateChatState(env, chatId, {
                context: { ...context3, characterCreate: undefined },
            });
            return renderCharacterList(settings);
        }

        case 'done_photos': {
            // Transition from photo upload to name input
            const state4 = await getChatState(env, chatId);
            const context4 = parseContext(state4);
            const cc = context4.characterCreate;
            if (!cc || !cc.assetIds || cc.assetIds.length === 0) {
                return renderCharacterList(settings);
            }
            cc.step = 'awaiting_name';
            await updateChatState(env, chatId, {
                context: { ...context4, characterCreate: cc },
            });
            return {
                text: `✅ <b>${cc.assetIds.length} photo${cc.assetIds.length !== 1 ? 's' : ''} uploaded!</b>\n\nNow enter a <b>display name</b> for this character:`,
                keyboard: [
                    cancelRow('vsettings:cancel_character', (ctx.lang || 'en') as Lang),
                ],
            };
        }

        case 'edit_char': {
            const stateEC = await getChatState(env, chatId);
            const contextEC = parseContext(stateEC);
            const groupId = extra || contextEC.selectedCharGroupId || '';
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            // Enter edit mode — awaiting personality input
            const state = stateEC;
            const context = contextEC;
            await updateChatState(env, chatId, {
                context: {
                    ...context,
                    awaiting_input: 'edit_character' as any,
                    selected_video_draft_id: groupId, // reuse field for group ID
                },
            });

            return {
                text: `✏️ <b>Edit Character: ${char.name}</b>\n\n` +
                    `Send the new personality description for this character.\n` +
                    `This is used by the AI to adapt the script tone.\n\n` +
                    `Current: ${char.personality || '(none)'}\n\n` +
                    `Example: "Energetic tech educator who explains complex concepts simply"`,
                keyboard: [
                    cancelRow(`vsettings:char_detail:${groupId}`, (ctx.lang || 'en') as Lang),
                ],
            };
        }

        case 'remove_char': {
            const stateRC = await getChatState(env, chatId);
            const contextRC = parseContext(stateRC);
            const groupId = extra || contextRC.selectedCharGroupId || '';
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);
            return renderRemoveCharacterConfirm(char);
        }

        case 'confirm_remove_char': {
            const stateCRC = await getChatState(env, chatId);
            const contextCRC = parseContext(stateCRC);
            const groupId = extra || contextCRC.selectedCharGroupId || '';
            settings.characters = settings.characters.filter(c => c.heygenGroupId !== groupId);
            await updateVideoSettings(env, chatId, settings);
            logInfo('Character removed:', groupId);
            return renderCharacterList(settings);
        }

        case 'train_char': {
            const stateTC = await getChatState(env, chatId);
            const contextTC = parseContext(stateTC);
            const groupId = extra || contextTC.selectedCharGroupId || '';
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            if (char.status === 'training') {
                // Already marked as training — check if looks now exist (= training done)
                try {
                    const { getAvatarGroupLooks, listTalkingPhotos } = await import('../integrations/heygen');

                    // Prefer group-specific endpoint
                    let photos = await getAvatarGroupLooks(env, groupId);
                    logInfo('Training check: group-specific found', photos.length, 'looks for', groupId);
                    if (photos.length === 0) {
                        photos = await listTalkingPhotos(env);
                        logInfo('Training check: fallback found', photos.length, 'talking photos total');
                    }

                    if (photos.length > 0) {
                        char.status = 'ready';
                        // Merge: preserve imageKey from existing looks
                        const existing = char.looks;
                        const matched = new Set<number>();
                        char.looks = photos.map(tp => {
                            const idx = existing.findIndex((l, i) => !matched.has(i) && (l.name === tp.name || !l.talkingPhotoId));
                            if (idx >= 0) { matched.add(idx); return { talkingPhotoId: tp.id, imageKey: existing[idx].imageKey, name: tp.name }; }
                            return { talkingPhotoId: tp.id, imageKey: '', name: tp.name };
                        });
                        // Keep unmatched looks with imageKey
                        for (let i = 0; i < existing.length; i++) {
                            if (!matched.has(i) && existing[i].imageKey) char.looks.push(existing[i]);
                        }
                        await updateVideoSettings(env, chatId, settings);
                        return renderCharacterDetail(char);
                    }

                    // No looks yet — may still be training or may need re-train
                    return {
                        text: `⏳ <b>${escapeHtml(char.name)}</b>\n\n` +
                            `No looks found yet.\n\n` +
                            `If training completed (check your email/dashboard), it may take a few more minutes for looks to appear. Try checking again.\n\n` +
                            `If needed, you can re-trigger training.`,
                        keyboard: [
                            [{ text: '⏳ Check Again', callback_data: `vsettings:train_char:${groupId}` }],
                            [{ text: '🧠 Re-Train', callback_data: `vsettings:retrain_char:${groupId}` }],
                            [{ text: '◀️ Back', callback_data: `vsettings:char_detail:${groupId}` }],
                        ],
                    };
                } catch (error) {
                    logError('Training check failed:', error instanceof Error ? error.message : String(error));
                    const safeMsg = escapeHtml((error instanceof Error ? error.message : String(error)).substring(0, 200));
                    return {
                        text: `⚠️ <b>Could not check training status</b>\n\n<code>${safeMsg}</code>`,
                        keyboard: [
                            [{ text: '⏳ Check Again', callback_data: `vsettings:train_char:${groupId}` }],
                            [{ text: '◀️ Back', callback_data: `vsettings:char_detail:${groupId}` }],
                        ],
                    };
                }
            }

            try {
                const { trainAvatarGroup } = await import('../integrations/heygen');
                await trainAvatarGroup(env, groupId);
                char.status = 'training';
                await updateVideoSettings(env, chatId, settings);
                logInfo('Avatar training started:', groupId);

                // Show initial progress and start polling
                const mid = ctx.messageId!;
                const backBtn: InlineButton[][] = [[{ text: '◀️ Back', callback_data: `vsettings:char_detail:${groupId}` }]];
                await editMessage(env, chatId, mid,
                    buildTrainingProgress(char.name, 0, 'pending'),
                    backBtn,
                );

                if (ctx.executionCtx) {
                    ctx.executionCtx.waitUntil(
                        pollTrainingStatus(env, chatId, groupId, mid, char.name)
                    );
                }
                return; // handled messaging ourselves
            } catch (error) {
                logError('Avatar training failed:', error instanceof Error ? error.message : String(error));
                const safeMsg = escapeHtml((error instanceof Error ? error.message : String(error)).substring(0, 200));
                return errorWithBackView(`Failed to start training:\n<code>${safeMsg}</code>`, `vsettings:char_detail:${groupId}`, (ctx.lang || 'en') as Lang);
            }
        }

        case 'sync_looks': {
            const stateSL = await getChatState(env, chatId);
            const contextSL = parseContext(stateSL);
            const groupId = extra || contextSL.selectedCharGroupId || '';
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            try {
                const { getAvatarGroupLooks, listTalkingPhotos } = await import('../integrations/heygen');

                // Try group-specific endpoint first (only returns this character's looks)
                let photos = await getAvatarGroupLooks(env, groupId);
                logInfo('Sync looks: group-specific found', photos.length, 'looks for', groupId);

                // Fallback to all talking photos if group endpoint returned nothing
                if (photos.length === 0) {
                    photos = await listTalkingPhotos(env);
                    logInfo('Sync looks: fallback found', photos.length, 'talking photos total');
                }

                if (photos.length > 0) {
                    char.status = 'ready';

                    // Merge: match synced photos to existing looks, preserving imageKey
                    const existingLooks = char.looks;
                    const mergedLooks: typeof char.looks = [];
                    const matchedExisting = new Set<number>();

                    for (const tp of photos) {
                        // Try to match by name to an existing look
                        const existingIdx = existingLooks.findIndex((l, i) =>
                            !matchedExisting.has(i) && l.name === tp.name
                        );
                        if (existingIdx >= 0) {
                            matchedExisting.add(existingIdx);
                            mergedLooks.push({
                                talkingPhotoId: tp.id,
                                imageKey: existingLooks[existingIdx].imageKey,
                                name: tp.name,
                            });
                        } else {
                            // Try to match by index (positional) for unnamed looks
                            const posIdx = existingLooks.findIndex((l, i) =>
                                !matchedExisting.has(i) && !l.talkingPhotoId
                            );
                            if (posIdx >= 0) {
                                matchedExisting.add(posIdx);
                                mergedLooks.push({
                                    talkingPhotoId: tp.id,
                                    imageKey: existingLooks[posIdx].imageKey,
                                    name: tp.name,
                                });
                            } else {
                                // New look from sync — no imageKey available
                                mergedLooks.push({
                                    talkingPhotoId: tp.id,
                                    imageKey: '',
                                    name: tp.name,
                                });
                            }
                        }
                    }

                    // Preserve existing looks not matched (keep their imageKey)
                    for (let i = 0; i < existingLooks.length; i++) {
                        if (!matchedExisting.has(i) && existingLooks[i].imageKey) {
                            mergedLooks.push(existingLooks[i]);
                        }
                    }

                    char.looks = mergedLooks;
                }

                await updateVideoSettings(env, chatId, settings);
                return renderCharacterDetail(char);
            } catch (error) {
                logError('Sync looks failed:', error instanceof Error ? error.message : String(error));
                const safeMsg = escapeHtml((error instanceof Error ? error.message : String(error)).substring(0, 200));
                return errorWithBackView(`Failed to sync looks:\n<code>${safeMsg}</code>`, `vsettings:char_detail:${groupId}`, (ctx.lang || 'en') as Lang);
            }
        }

        case 'retrain_char': {
            // Force re-train regardless of current status
            const stateRT = await getChatState(env, chatId);
            const contextRT = parseContext(stateRT);
            const groupId = extra || contextRT.selectedCharGroupId || '';
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            try {
                const { trainAvatarGroup } = await import('../integrations/heygen');
                await trainAvatarGroup(env, groupId);
                char.status = 'training';
                await updateVideoSettings(env, chatId, settings);
                logInfo('Avatar re-training started:', groupId);

                const mid = ctx.messageId!;
                const backBtn: InlineButton[][] = [[{ text: '◀️ Back', callback_data: `vsettings:char_detail:${groupId}` }]];
                await editMessage(env, chatId, mid,
                    buildTrainingProgress(char.name, 0, 'pending'),
                    backBtn,
                );
                if (ctx.executionCtx) {
                    ctx.executionCtx.waitUntil(
                        pollTrainingStatus(env, chatId, groupId, mid, char.name)
                    );
                }
                return;
            } catch (error) {
                logError('Avatar re-training failed:', error instanceof Error ? error.message : String(error));
                const safeMsg = escapeHtml((error instanceof Error ? error.message : String(error)).substring(0, 200));
                return errorWithBackView(`Failed to start training:\n<code>${safeMsg}</code>`, `vsettings:char_detail:${groupId}`, (ctx.lang || 'en') as Lang);
            }
        }

        case 'add_look': {
            const state2 = await getChatState(env, chatId);
            const context2 = parseContext(state2);
            const groupId = extra || context2.selectedCharGroupId || '';
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            // Enter look creation compose mode — photo upload
            await updateChatState(env, chatId, {
                context: {
                    ...context2,
                    lookCreate: { active: true, step: 'awaiting_photo', characterGroupId: groupId },
                },
            });

            return {
                text: `🎭 <b>Add Look for ${char.name}</b>\n\n` +
                    `Send a <b>photo</b> to add as a new look.\n\n` +
                    `<b>Photo Tips:</b>\n` +
                    `• Clear face, good lighting\n` +
                    `• Different outfit or setting from existing looks\n` +
                    `• High resolution, face clearly visible`,
                keyboard: [
                    cancelRow(`vsettings:char_detail:${groupId}`, (ctx.lang || 'en') as Lang),
                ],
            };
        }

        case 'remove_look': {
            // extra = "groupId:talkingPhotoId" (legacy long callback)
            const parts = (extra || '').split(':');
            const stateRLk = await getChatState(env, chatId);
            const contextRLk = parseContext(stateRLk);
            const groupId = parts[0] || contextRLk.selectedCharGroupId || '';
            const photoId = parts.slice(1).join(':');
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            char.looks = char.looks.filter(l => l.talkingPhotoId !== photoId);
            await updateVideoSettings(env, chatId, settings);
            logInfo('Look removed:', photoId, 'from character:', groupId);
            return renderCharacterDetail(char);
        }

        case 'rl': {
            // Remove look by index: vs:rl:INDEX — groupId from context
            const index = parseInt(extra || '0', 10);
            const stateRL = await getChatState(env, chatId);
            const contextRL = parseContext(stateRL);
            const groupId = contextRL.selectedCharGroupId || '';
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            const look = char.looks[index];
            if (!look) return renderCharacterDetail(char);

            char.looks = char.looks.filter(l => l.talkingPhotoId !== look.talkingPhotoId);
            await updateVideoSettings(env, chatId, settings);
            logInfo('Look removed by index:', index, look.talkingPhotoId, 'from character:', groupId);
            return renderCharacterDetail(char);
        }

        case 'lp': {
            // Look page navigation: vs:lp:PAGE
            const page = parseInt(extra || '0', 10);
            const stateLP = await getChatState(env, chatId);
            const contextLP = parseContext(stateLP);
            const groupIdLP = contextLP.selectedCharGroupId || '';
            const charLP = settings.characters.find(c => c.heygenGroupId === groupIdLP);
            if (!charLP) return renderCharacterList(settings);
            return renderCharacterDetail(charLP, page);
        }

        case 'voice': {
            const stateV = await getChatState(env, chatId);
            const contextV = parseContext(stateV);
            const groupId = extra || contextV.selectedCharGroupId || '';
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            try {
                const { listVoices } = await import('../integrations/heygen');
                const voices = await listVoices(env);

                // Store voices and groupId in context for indexed lookup
                await updateChatState(env, chatId, {
                    context: {
                        ...contextV,
                        voiceSelect: { groupId, voiceIds: voices.map(v => v.voice_id) },
                    },
                });

                return renderVoiceSelect(char, voices);
            } catch (error) {
                logError('Failed to list voices:', error instanceof Error ? error.message : String(error));
                const safeMsg = escapeHtml((error instanceof Error ? error.message : String(error)).substring(0, 200));
                return errorWithBackView(`Failed to load voices:\n<code>${safeMsg}</code>`, `vsettings:char_detail:${groupId}`, (ctx.lang || 'en') as Lang);
            }
        }

        case 'vp': {
            // Voice page navigation: vsettings:vp:PAGE
            const page = parseInt(extra || '0', 10);
            const stateVP = await getChatState(env, chatId);
            const contextVP = parseContext(stateVP);
            const vs = (contextVP as any).voiceSelect;
            if (!vs?.groupId) return renderCharacterList(settings);

            const char = settings.characters.find(c => c.heygenGroupId === vs.groupId);
            if (!char) return renderCharacterList(settings);

            try {
                const { listVoices } = await import('../integrations/heygen');
                const voices = await listVoices(env);
                return renderVoiceSelect(char, voices, page);
            } catch {
                return renderCharacterDetail(char);
            }
        }

        case 'sv': {
            // Select voice by index: vsettings:sv:INDEX
            const index = parseInt(extra || '0', 10);
            const stateSV = await getChatState(env, chatId);
            const contextSV = parseContext(stateSV);
            const vsSV = (contextSV as any).voiceSelect;
            if (!vsSV?.groupId || !vsSV?.voiceIds) return renderCharacterList(settings);

            const char = settings.characters.find(c => c.heygenGroupId === vsSV.groupId);
            if (!char) return renderCharacterList(settings);

            const voiceId = vsSV.voiceIds[index];
            if (!voiceId) return renderCharacterDetail(char);

            char.voiceId = voiceId;
            await updateVideoSettings(env, chatId, settings);

            // Clear voice select context
            await updateChatState(env, chatId, {
                context: { ...contextSV, voiceSelect: undefined },
            });

            logInfo('Voice set for character:', vsSV.groupId, '→', voiceId);
            return renderEmotionSelect(char);
        }

        case 'set_emotion': {
            // extra = "groupId:emotion" (legacy) or just "emotion" (context-based)
            const parts = (extra || '').split(':');
            const stateSE = await getChatState(env, chatId);
            const contextSE = parseContext(stateSE);
            // If parts has 2+, first is groupId; if just 1, it's the emotion and groupId is in context
            const groupId = parts.length > 1 ? parts[0] : (contextSE.selectedCharGroupId || '');
            const emotion = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
            const char = settings.characters.find(c => c.heygenGroupId === groupId);
            if (!char) return renderCharacterList(settings);

            char.defaultEmotion = emotion as any;
            await updateVideoSettings(env, chatId, settings);
            logInfo('Emotion set for character:', groupId, '→', emotion);
            return renderCharacterDetail(char);
        }

        // ==================== DEFAULTS ====================
        case 'defaults':
            return renderDefaultSettings(settings);

        case 'def_aspect': {
            const ratios = ['16:9', '9:16', '1:1'];
            return {
                text: '📐 <b>Default Aspect Ratio</b>\n\nSelect the default for new videos:',
                keyboard: [
                    ...ratios.map(r => [{
                        text: selectedItemLabel(r, r === (settings.defaults.aspectRatio || '16:9')),
                        callback_data: `vsettings:set_def_aspect:${r}`,
                    }]),
                    [backButton('vsettings:defaults', (ctx.lang || 'en') as Lang)],
                ],
            };
        }

        case 'set_def_aspect': {
            settings.defaults.aspectRatio = extra || '16:9';
            await updateVideoSettings(env, chatId, settings);
            return renderDefaultSettings(settings);
        }

        case 'def_length': {
            const lengths = ['30s', '60s', '90s', '2m', '3m', '5m'];
            return {
                text: '⏱️ <b>Max Video Length</b>\n\nSelect the maximum length for new videos:',
                keyboard: [
                    ...lengths.map(l => [{
                        text: selectedItemLabel(l, l === settings.defaults.maxLength),
                        callback_data: `vsettings:set_def_length:${l}`,
                    }]),
                    [{ text: 'No limit', callback_data: 'vsettings:set_def_length:none' }],
                    [backButton('vsettings:defaults', (ctx.lang || 'en') as Lang)],
                ],
            };
        }

        case 'set_def_length': {
            settings.defaults.maxLength = extra === 'none' ? undefined : extra;
            await updateVideoSettings(env, chatId, settings);
            return renderDefaultSettings(settings);
        }

        case 'def_character': {
            if (settings.characters.length === 0) {
                return {
                    text: 'No characters configured. Add a character first.',
                    keyboard: [
                        [{ text: '➕ Add Character', callback_data: 'vsettings:add_character' }],
                        [{ text: '◀️ Back', callback_data: 'vsettings:defaults' }],
                    ],
                };
            }
            return {
                text: '👤 <b>Default Character</b>\n\nSelect the default character for new videos:',
                keyboard: [
                    ...settings.characters.map(c => [{
                        text: selectedItemLabel(c.name, c.heygenGroupId === settings.defaults.defaultCharacterId),
                        callback_data: `vsettings:set_def_character:${c.heygenGroupId}`,
                    }]),
                    [{ text: 'None', callback_data: 'vsettings:set_def_character:none' }],
                    [backButton('vsettings:defaults', (ctx.lang || 'en') as Lang)],
                ],
            };
        }

        case 'set_def_character': {
            settings.defaults.defaultCharacterId = extra === 'none' ? undefined : extra;
            await updateVideoSettings(env, chatId, settings);
            return renderDefaultSettings(settings);
        }

        case 'def_bg': {
            const colors = ['#ffffff', '#000000', '#1a1a2e', '#0f3460', '#16213e'];
            return {
                text: '🎨 <b>Default Background</b>\n\nSelect a default background color:',
                keyboard: [
                    ...colors.map(c => [{
                        text: selectedItemLabel(c, c === (settings.defaults.defaultBackground || '#ffffff')),
                        callback_data: `vsettings:set_def_bg:${c}`,
                    }]),
                    [backButton('vsettings:defaults', (ctx.lang || 'en') as Lang)],
                ],
            };
        }

        case 'set_def_bg': {
            settings.defaults.defaultBackground = extra;
            await updateVideoSettings(env, chatId, settings);
            return renderDefaultSettings(settings);
        }

        case 'def_captions_toggle': {
            settings.defaults.defaultCaptions = !settings.defaults.defaultCaptions;
            await updateVideoSettings(env, chatId, settings);
            return renderDefaultSettings(settings);
        }

        // ==================== ACCOUNT SETTINGS ====================
        case 'heygen':
            return renderHeyGenSettings(!!env.HEYGEN_API_KEY);

        case 'instagram':
            return renderInstagramSettings(!!env.INSTAGRAM_ACCESS_TOKEN && !!env.INSTAGRAM_BUSINESS_ACCOUNT_ID);

        default:
            return renderVideoSettingsHome(settings);
    }
}

// ==================== TRAINING PROGRESS POLLING ====================

function buildProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function buildTrainingProgress(name: string, elapsedSec: number, status: string): string {
    // Estimate based on typical 3-4 min training time
    const estimatedPct = Math.min(Math.round((elapsedSec / 240) * 100), 95);
    const bar = buildProgressBar(estimatedPct);
    const statusText = status === 'pending' ? 'Queued...' : 'Processing...';

    return `🧠 <b>Training "${escapeHtml(name)}"</b>\n\n` +
        `Status: ⏳ ${statusText}\n` +
        `Elapsed: ${formatElapsed(elapsedSec)}\n` +
        `[${bar}] ~${estimatedPct}%\n\n` +
        `<i>Training teaches HeyGen to recognize the subject's face.\nThis typically takes 2-5 minutes.</i>`;
}

/**
 * Handle training completion — sync looks and update the message.
 * Shared between immediate status check and polling loop.
 */
async function handleTrainingComplete(
    env: import('../types').Env,
    chatId: string,
    groupId: string,
    messageId: number,
    charName: string,
    settingsOverride?: import('../types').VideoSettings,
): Promise<void> {
    const { getAvatarGroupLooks, listTalkingPhotos } = await import('../integrations/heygen');
    const settings = settingsOverride || await getVideoSettings(env, chatId);
    const char = settings.characters.find(c => c.heygenGroupId === groupId);

    if (char) {
        char.status = 'ready';
        try {
            // Prefer group-specific looks
            let photos = await getAvatarGroupLooks(env, groupId);
            if (photos.length === 0) {
                photos = await listTalkingPhotos(env);
            }
            if (photos.length > 0) {
                // Merge: preserve imageKey from existing looks
                const existing = char.looks;
                const matched = new Set<number>();
                char.looks = photos.map(tp => {
                    const idx = existing.findIndex((l, i) => !matched.has(i) && (l.name === tp.name || !l.talkingPhotoId));
                    if (idx >= 0) { matched.add(idx); return { talkingPhotoId: tp.id, imageKey: existing[idx].imageKey, name: tp.name }; }
                    return { talkingPhotoId: tp.id, imageKey: '', name: tp.name };
                });
                for (let i = 0; i < existing.length; i++) {
                    if (!matched.has(i) && existing[i].imageKey) char.looks.push(existing[i]);
                }
            }
        } catch (syncErr) {
            logError('Auto-sync looks failed:', syncErr instanceof Error ? syncErr.message : String(syncErr));
        }
        await updateVideoSettings(env, chatId, settings);
    }

    const looksCount = (char?.looks || []).length;
    await editMessage(env, chatId, messageId,
        `✅ <b>Training Complete!</b>\n\n` +
        `"${escapeHtml(charName)}" is ready for video generation.\n` +
        `${looksCount} look${looksCount !== 1 ? 's' : ''} synced automatically.`,
        [
            [{ text: `👁️ View ${charName}`, callback_data: `vsettings:char_detail:${groupId}` }],
            [{ text: '◀️ Characters', callback_data: 'vsettings:characters' }],
        ],
    );
}

/**
 * Background polling loop for avatar training status.
 * Edits the Telegram message with progress, auto-syncs looks on completion.
 */
async function pollTrainingStatus(
    env: import('../types').Env,
    chatId: string,
    groupId: string,
    messageId: number,
    charName: string,
): Promise<void> {
    const POLL_INTERVAL_MS = 15_000; // 15 seconds
    const MAX_POLLS = 24; // 24 × 15s = 6 minutes max

    const backBtn: import('../types').InlineButton[][] = [[{ text: '◀️ Back', callback_data: `vsettings:char_detail:${groupId}` }]];

    try {
        const { getAvatarGroupLooks, listTalkingPhotos } = await import('../integrations/heygen');

        for (let i = 0; i < MAX_POLLS; i++) {
            await new Promise(r => setTimeout(r, i === 0 ? 5_000 : POLL_INTERVAL_MS));

            const elapsed = 5 + i * 15;
            let photos: Array<{ id: string; name: string }>;
            try {
                // Prefer group-specific endpoint
                photos = await getAvatarGroupLooks(env, groupId);
                if (photos.length === 0) {
                    photos = await listTalkingPhotos(env);
                }
            } catch (err) {
                logError('Poll training error:', err instanceof Error ? err.message : String(err));
                continue;
            }

            logInfo('Training poll', i + 1, 'for', groupId, ': found', photos.length, 'looks');

            if (photos.length > 0) {
                // Looks appeared — training complete
                await handleTrainingComplete(env, chatId, groupId, messageId, charName);
                return;
            }

            // Still no photos — update progress
            try {
                await editMessage(env, chatId, messageId,
                    buildTrainingProgress(charName, elapsed, 'processing'),
                    backBtn,
                );
            } catch {
                // ignore edit failures (content unchanged)
            }
        }

        // Timeout
        await editMessage(env, chatId, messageId,
            `⏰ <b>Training is taking longer than expected</b>\n\n` +
            `"${escapeHtml(charName)}" is still training after 6 minutes.\n` +
            `Check back later using "Check Training" on the character page.`,
            [
                [{ text: `👁️ View ${charName}`, callback_data: `vsettings:char_detail:${groupId}` }],
                [{ text: '◀️ Characters', callback_data: 'vsettings:characters' }],
            ],
        );
    } catch (error) {
        logError('Training poll fatal error:', error instanceof Error ? error.message : String(error));
        try {
            await editMessage(env, chatId, messageId,
                `⚠️ <b>Training status check interrupted</b>\n\nGo back to character page to check status.`,
                backBtn,
            );
        } catch { /* last resort, ignore */ }
    }
}

/**
 * Handle character personality edit input
 */
export async function handleCharacterEditInput(
    ctx: HandlerContext & { text: string }
): Promise<ViewResult | void> {
    const { env, chatId, text } = ctx;
    const state = await getChatState(env, chatId);
    const context = parseContext(state);
    const groupId = context.selected_video_draft_id;

    if (!groupId) return;

    const settings = await getVideoSettings(env, chatId);
    const char = settings.characters.find(c => c.heygenGroupId === groupId);

    if (!char) {
        await updateChatState(env, chatId, { context: null });
        return renderCharacterList(settings);
    }

    char.personality = text.trim();
    await updateVideoSettings(env, chatId, settings);

    // Clear input mode
    await updateChatState(env, chatId, { context: null });

    logInfo('Character personality updated:', groupId);
    return renderCharacterDetail(char);
}
