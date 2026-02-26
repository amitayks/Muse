/**
 * Video Settings views — Characters, Looks, Voices, Defaults, HeyGen Account, Instagram
 */

import type { ViewResult, InlineButton, HeyGenCharacter, VideoSettings } from '../types';
import type { Lang } from '../ui/strings';
import { t } from '../ui/strings';
import { escapeHtml } from '../ui/utils';
import { backButton, selectedItemLabel, cancelRow } from '../ui/components';

/**
 * Video settings home — subsection buttons
 */
export function renderVideoSettingsHome(settings: VideoSettings, lang: Lang = 'en'): ViewResult {
    const charCount = settings.characters.length;

    return {
        text: `${t(lang, 'videoSettings.title')}\n\n` +
            `${t(lang, 'videoSettings.characters')} ${charCount} ${t(lang, 'videoSettings.configured')}\n` +
            `${t(lang, 'videoSettings.voices')}\n` +
            `${t(lang, 'videoSettings.defaults')}`,
        keyboard: [
            [{ text: `${t(lang, 'videoSettings.btnCharacters')} (${charCount})`, callback_data: 'vsettings:characters' }],
            [{ text: t(lang, 'videoSettings.btnDefaults'), callback_data: 'vsettings:defaults' }],
            [{ text: t(lang, 'videoSettings.btnHeygen'), callback_data: 'vsettings:heygen' }],
            [{ text: t(lang, 'videoSettings.btnInstagram'), callback_data: 'vsettings:instagram' }],
            [backButton('view:video_studio', lang)],
        ],
    };
}

/**
 * Character listing view
 */
export function renderCharacterList(settings: VideoSettings, lang: Lang = 'en'): ViewResult {
    const chars = settings.characters;

    if (chars.length === 0) {
        return {
            text: `${t(lang, 'videoSettings.charListTitle')}\n\n${t(lang, 'videoSettings.noChars')}\n\nAdd a character to start creating videos with Photo Avatars.`,
            keyboard: [
                [{ text: t(lang, 'videoSettings.addCharacter'), callback_data: 'vsettings:add_character' }],
                [backButton('vsettings:home', lang)],
            ],
        };
    }

    const statusIcon = (s: string) => s === 'ready' ? '✅' : s === 'training' ? '⏳' : '❌';

    let text = `${t(lang, 'videoSettings.charListTitle')}\n`;
    for (const c of chars) {
        const looksCount = (c.looks || []).length;
        text += `\n${statusIcon(c.status)} <b>${escapeHtml(c.name)}</b>`;
        text += ` — ${looksCount} ${looksCount !== 1 ? t(lang, 'videoSettings.looks') : t(lang, 'videoSettings.look')}`;
        if (c.voiceId) text += ' 🎙️';
        if (c.personality) text += `\n    <i>${escapeHtml(c.personality.substring(0, 60))}</i>`;
    }

    const buttons: InlineButton[][] = [];
    for (const c of chars) {
        buttons.push([
            { text: `👁️ ${c.name}`, callback_data: `vsettings:char_detail:${c.heygenGroupId}` },
        ]);
    }
    buttons.push([{ text: t(lang, 'videoSettings.addCharacter'), callback_data: 'vsettings:add_character' }]);
    buttons.push([backButton('vsettings:home', lang)]);

    return { text, keyboard: buttons };
}

/**
 * Character detail view — shows looks with pagination, edit, remove options
 */
export function renderCharacterDetail(character: HeyGenCharacter, lookPage = 0, lang: Lang = 'en'): ViewResult {
    const statusIcon = character.status === 'ready' ? '✅' : character.status === 'training' ? '⏳' : '❌';
    const statusLabel = character.status === 'ready' ? t(lang, 'videoSettings.statusReady') : character.status === 'training' ? t(lang, 'videoSettings.statusTraining') : t(lang, 'videoSettings.statusFailed');
    const looks = character.looks || [];

    const LOOKS_PAGE_SIZE = 5;
    const totalLookPages = Math.max(1, Math.ceil(looks.length / LOOKS_PAGE_SIZE));
    const safePage = Math.min(lookPage, totalLookPages - 1);
    const lookStart = safePage * LOOKS_PAGE_SIZE;
    const shownLooks = looks.slice(lookStart, lookStart + LOOKS_PAGE_SIZE);

    let text = `${statusIcon} <b>${escapeHtml(character.name)}</b>\n\n`;
    text += `${t(lang, 'videoSettings.statusLabel')} ${statusLabel}\n`;
    text += `${t(lang, 'videoSettings.voiceLabel')} ${character.voiceId || t(lang, 'video.notSet')}\n`;
    text += `${t(lang, 'videoSettings.emotionLabel')} ${character.defaultEmotion || 'Friendly'}\n`;
    if (character.personality) text += `${t(lang, 'videoSettings.personalityLabel')} <i>${escapeHtml(character.personality.substring(0, 100))}</i>\n`;

    if (looks.length > 0) {
        text += `\n${t(lang, 'videoSettings.looksTitle')} (${looks.length}):</b>`;
        if (totalLookPages > 1) {
            text += ` <i>page ${safePage + 1}/${totalLookPages}</i>`;
        }
        for (let i = 0; i < shownLooks.length; i++) {
            const hasKey = shownLooks[i].imageKey ? '🔑' : '⚠️';
            text += `\n  ${hasKey} ${lookStart + i + 1}. ${escapeHtml(shownLooks[i].name)}`;
        }
    } else {
        text += `\n${t(lang, 'videoSettings.looksNone')}`;
        if (character.status !== 'training') {
            text += `\n${t(lang, 'videoSettings.uploadPhotos')}`;
        }
    }

    const keyboard: InlineButton[][] = [];

    // Primary actions row — short `vs:` prefix, groupId stored in context
    keyboard.push([
        { text: t(lang, 'videoSettings.btnVoice'), callback_data: 'vs:voice' },
        { text: t(lang, 'videoSettings.btnPersonality'), callback_data: 'vs:edit_char' },
    ]);

    // Training & sync — contextual buttons based on status
    if (character.status === 'training') {
        keyboard.push([
            { text: t(lang, 'videoSettings.checkTraining'), callback_data: 'vs:train_char' },
            { text: t(lang, 'videoSettings.syncLooks'), callback_data: 'vs:sync_looks' },
        ]);
    } else if (character.status === 'ready') {
        keyboard.push([
            { text: t(lang, 'videoSettings.syncLooks'), callback_data: 'vs:sync_looks' },
            { text: t(lang, 'videoSettings.reTrain'), callback_data: 'vs:train_char' },
        ]);
    } else {
        keyboard.push([{ text: t(lang, 'videoSettings.trainAvatar'), callback_data: 'vs:train_char' }]);
    }

    // Look management (only when trained)
    if (character.status === 'ready') {
        keyboard.push([{ text: t(lang, 'videoSettings.addLook'), callback_data: 'vs:add_look' }]);

        // Remove buttons for looks on current page
        for (let i = 0; i < shownLooks.length; i++) {
            const absIndex = lookStart + i;
            const lookName = shownLooks[i].name.length > 20
                ? shownLooks[i].name.substring(0, 18) + '..'
                : shownLooks[i].name;
            keyboard.push([
                { text: `${t(lang, 'videoSettings.removeLook')} "${lookName}"`, callback_data: `vs:rl:${absIndex}` },
            ]);
        }

        // Look pagination
        if (totalLookPages > 1) {
            const nav: InlineButton[] = [];
            if (safePage > 0) nav.push({ text: t(lang, 'common.prev'), callback_data: `vs:lp:${safePage - 1}` });
            if (safePage < totalLookPages - 1) nav.push({ text: t(lang, 'common.next'), callback_data: `vs:lp:${safePage + 1}` });
            keyboard.push(nav);
        }
    }

    // Danger zone + nav
    keyboard.push([{ text: t(lang, 'videoSettings.removeCharacter'), callback_data: 'vs:remove_char' }]);
    keyboard.push([{ text: t(lang, 'videoSettings.btnCharactersList'), callback_data: 'vs:characters' }]);

    return { text, keyboard };
}

/**
 * Character removal confirmation
 */
export function renderRemoveCharacterConfirm(character: HeyGenCharacter, lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'videoSettings.removeCharTitle')}\n\n` +
            `"${escapeHtml(character.name)}" ${t(lang, 'videoSettings.removeCharDesc')}\n\n` +
            `${t(lang, 'videoSettings.removeCharNote')}\n` +
            `${t(lang, 'videoSettings.removeCharDrafts')}`,
        keyboard: [
            [{ text: t(lang, 'videoSettings.yesRemove'), callback_data: `vsettings:confirm_remove_char:${character.heygenGroupId}` }],
            cancelRow(`vsettings:char_detail:${character.heygenGroupId}`, lang),
        ],
    };
}

/**
 * Voice selection view — uses numeric indices to keep callback_data under 64 bytes
 * The voice list is stored in context so the handler can look up by index.
 */
export function renderVoiceSelect(
    character: HeyGenCharacter,
    voices: Array<{ voice_id: string; name: string; language?: string; gender?: string }>,
    page = 0,
    lang: Lang = 'en'
): ViewResult {
    const PAGE_SIZE = 8;
    const start = page * PAGE_SIZE;
    const shown = voices.slice(start, start + PAGE_SIZE);
    const totalPages = Math.ceil(voices.length / PAGE_SIZE);

    const currentName = character.voiceId
        ? voices.find(v => v.voice_id === character.voiceId)?.name || character.voiceId.substring(0, 12)
        : t(lang, 'video.notSet');

    let text = `${t(lang, 'videoSettings.voiceSelectTitle').replace('{name}', escapeHtml(character.name))}\n\n`;
    text += `${t(lang, 'videoSettings.currentVoice')} ${escapeHtml(currentName)}\n`;
    text += `${t(lang, 'videoSettings.showing')} ${start + 1}–${start + shown.length} of ${voices.length}`;

    const keyboard: InlineButton[][] = [];
    for (let i = 0; i < shown.length; i++) {
        const v = shown[i];
        const label = `${v.name}${v.gender ? ` (${v.gender})` : ''}${v.language ? ` [${v.language}]` : ''}`;
        const selected = v.voice_id === character.voiceId;
        keyboard.push([{
            text: selectedItemLabel(label, selected),
            callback_data: `vsettings:sv:${start + i}`,
        }]);
    }

    // Pagination
    if (totalPages > 1) {
        const nav: InlineButton[] = [];
        if (page > 0) nav.push({ text: t(lang, 'common.prev'), callback_data: `vsettings:vp:${page - 1}` });
        if (page < totalPages - 1) nav.push({ text: t(lang, 'common.next'), callback_data: `vsettings:vp:${page + 1}` });
        keyboard.push(nav);
    }

    keyboard.push([backButton(`vsettings:char_detail:${character.heygenGroupId}`, lang)]);

    return { text, keyboard };
}

/**
 * Emotion selector for character
 */
export function renderEmotionSelect(character: HeyGenCharacter, lang: Lang = 'en'): ViewResult {
    const emotions = ['Excited', 'Friendly', 'Serious', 'Soothing', 'Broadcaster'];

    return {
        text: `${t(lang, 'videoSettings.emotionSelectTitle').replace('{name}', escapeHtml(character.name))}\n\n${t(lang, 'videoSettings.emotionSelectDesc')}`,
        keyboard: [
            ...emotions.map(e => [{
                text: selectedItemLabel(e, e === character.defaultEmotion),
                callback_data: `vs:set_emotion:${e}`,
            }]),
            [backButton(`vsettings:char_detail:${character.heygenGroupId}`, lang)],
        ],
    };
}

/**
 * Default video settings view
 */
export function renderDefaultSettings(settings: VideoSettings, lang: Lang = 'en'): ViewResult {
    const d = settings.defaults;

    return {
        text: `${t(lang, 'videoSettings.defaultsTitle')}\n\n` +
            `${t(lang, 'videoSettings.defaultsDesc')}\n\n` +
            `${t(lang, 'videoSettings.aspectRatio')} ${d.aspectRatio || '16:9'}\n` +
            `${t(lang, 'videoSettings.maxLength')} ${d.maxLength || t(lang, 'videoSettings.noLimit')}\n` +
            `${t(lang, 'videoSettings.characterDefault')} ${d.defaultCharacterId ? settings.characters.find(c => c.heygenGroupId === d.defaultCharacterId)?.name || d.defaultCharacterId : t(lang, 'videoSettings.none')}\n` +
            `${t(lang, 'videoSettings.background')} ${d.defaultBackground || '#ffffff'}\n` +
            `${t(lang, 'videoSettings.captionsLabel')} ${d.defaultCaptions !== undefined ? (d.defaultCaptions ? 'ON' : 'OFF') : 'OFF'}`,
        keyboard: [
            [
                { text: t(lang, 'videoSettings.btnAspectRatio'), callback_data: 'vsettings:def_aspect' },
                { text: t(lang, 'videoSettings.btnMaxLength'), callback_data: 'vsettings:def_length' },
            ],
            [{ text: t(lang, 'videoSettings.btnCharacter'), callback_data: 'vsettings:def_character' }],
            [
                { text: t(lang, 'videoSettings.btnBackground'), callback_data: 'vsettings:def_bg' },
                { text: `${t(lang, 'videoSettings.captionsLabel')} ${d.defaultCaptions ? 'ON' : 'OFF'}`, callback_data: 'vsettings:def_captions_toggle' },
            ],
            [backButton('vsettings:home', lang)],
        ],
    };
}

/**
 * HeyGen account settings view
 */
export function renderHeyGenSettings(hasApiKey: boolean, lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'videoSettings.heygenTitle')}\n\n` +
            `${t(lang, 'videoSettings.apiKey')} ${hasApiKey ? t(lang, 'videoSettings.configuredStatus') : t(lang, 'videoSettings.notConfigured')}\n\n` +
            `${t(lang, 'videoSettings.creditCosts')}\n` +
            `${t(lang, 'videoSettings.avatarIII')}\n` +
            `${t(lang, 'videoSettings.avatarIV')}\n` +
            `${t(lang, 'videoSettings.photoAvatarTraining')}`,
        keyboard: [
            [backButton('vsettings:home', lang)],
        ],
    };
}

/**
 * Instagram settings view
 */
export function renderInstagramSettings(hasCredentials: boolean, lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'videoSettings.instagramTitle')}\n\n` +
            `${t(lang, 'videoSettings.businessAccountId')} ${hasCredentials ? t(lang, 'videoSettings.configuredStatus') : t(lang, 'videoSettings.notConfigured')}\n` +
            `${t(lang, 'videoSettings.accessToken')} ${hasCredentials ? t(lang, 'videoSettings.configuredStatus') : t(lang, 'videoSettings.notConfigured')}\n\n` +
            (hasCredentials
                ? t(lang, 'videoSettings.instagramEnabled')
                : t(lang, 'videoSettings.instagramDisabled')),
        keyboard: [
            [backButton('vsettings:home', lang)],
        ],
    };
}
