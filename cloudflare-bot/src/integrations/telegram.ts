/**
 * Telegram Service - Bot API interactions
 */

import type { Env, InlineButton } from '../types';
import { truncateHtml } from '../ui/utils';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/** Map InlineButton[][] to Telegram's format, including optional style */
function toTelegramKeyboard(keyboard: InlineButton[][]): Record<string, unknown>[][] {
    return keyboard.map(row =>
        row.map(btn => {
            const out: Record<string, unknown> = { text: btn.text };
            if (btn.callback_data) out.callback_data = btn.callback_data;
            if (btn.url) out.url = btn.url;
            if (btn.web_app) out.web_app = btn.web_app;
            if (btn.style) out.style = btn.style;
            return out;
        })
    );
}

/**
 * Send a new message to Telegram
 */
export async function sendMessage(
    env: Env,
    chatId: string | number,
    text: string,
    keyboard?: InlineButton[][],
    options?: { disableLinkPreview?: boolean }
): Promise<number> {
    const response = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            reply_markup: keyboard ? { inline_keyboard: toTelegramKeyboard(keyboard) } : undefined,
            link_preview_options: options?.disableLinkPreview ? { is_disabled: true } : undefined,
        }),
    });

    const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (!data.ok || !data.result) {
        console.error('sendMessage failed:', data.description);
        throw new Error(`Failed to send message: ${data.description}`);
    }

    console.log('Sent message:', data.result.message_id);
    return data.result.message_id;
}

/**
 * Edit an existing message
 */
export async function editMessage(
    env: Env,
    chatId: string | number,
    messageId: number,
    text: string,
    keyboard?: InlineButton[][],
    options?: { disableLinkPreview?: boolean }
): Promise<void> {
    const response = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: 'HTML',
            reply_markup: keyboard ? { inline_keyboard: toTelegramKeyboard(keyboard) } : undefined,
            link_preview_options: options?.disableLinkPreview ? { is_disabled: true } : undefined,
        }),
    });

    const data = await response.json() as { ok: boolean; description?: string };

    // "message is not modified" is acceptable - content already matches
    if (!data.ok && !data.description?.includes('message is not modified')) {
        console.error('editMessage failed:', data.description);
        throw new Error(`Failed to edit message: ${data.description}`);
    }
}

/**
 * Edit the caption of an existing photo message
 */
export async function editMessageCaption(
    env: Env,
    chatId: string | number,
    messageId: number,
    caption: string,
    keyboard?: InlineButton[][]
): Promise<void> {
    const response = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard ? { inline_keyboard: toTelegramKeyboard(keyboard) } : undefined,
        }),
    });

    const data = await response.json() as { ok: boolean; description?: string };

    // "message is not modified" is acceptable - content already matches
    if (!data.ok && !data.description?.includes('message is not modified')) {
        console.error('editMessageCaption failed:', data.description);
        throw new Error(`Failed to edit message caption: ${data.description}`);
    }
}

/**
 * Answer a callback query (removes loading indicator)
 */
export async function answerCallback(
    env: Env,
    callbackId: string,
    text?: string
): Promise<void> {
    await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            callback_query_id: callbackId,
            text,
        }),
    });
}

/**
 * Delete a message
 */
export async function deleteMessage(
    env: Env,
    chatId: string | number,
    messageId: number
): Promise<void> {
    await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
        }),
    });
}

/**
 * Send a photo with optional caption
 */
export async function sendPhoto(
    env: Env,
    chatId: string | number,
    photoUrl: string,
    caption?: string,
    keyboard?: InlineButton[][]
): Promise<number> {
    const response = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            photo: photoUrl,
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard ? { inline_keyboard: toTelegramKeyboard(keyboard) } : undefined,
        }),
    });

    const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (!data.ok || !data.result) {
        console.error('sendPhoto failed:', data.description);
        throw new Error(`Failed to send photo: ${data.description}`);
    }

    console.log('Sent photo:', data.result.message_id);
    return data.result.message_id;
}

/**
 * Send a document (file) with optional caption — preserves original resolution
 */
export async function sendDocument(
    env: Env,
    chatId: string | number,
    documentUrl: string,
    caption?: string,
    keyboard?: InlineButton[][]
): Promise<number> {
    const response = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            document: documentUrl,
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard ? { inline_keyboard: toTelegramKeyboard(keyboard) } : undefined,
        }),
    });

    const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (!data.ok || !data.result) {
        console.error('sendDocument failed:', data.description);
        throw new Error(`Failed to send document: ${data.description}`);
    }

    console.log('Sent document:', data.result.message_id);
    return data.result.message_id;
}

/**
 * Send a group of photos as an album (2–10 photos)
 */
export async function sendMediaGroup(
    env: Env,
    chatId: string | number,
    photoUrls: string[]
): Promise<number[]> {
    const media = photoUrls.map(url => ({
        type: 'photo' as const,
        media: url,
    }));

    const response = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendMediaGroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            media,
        }),
    });

    const data = await response.json() as { ok: boolean; result?: Array<{ message_id: number }>; description?: string };

    if (!data.ok || !data.result) {
        console.error('sendMediaGroup failed:', data.description);
        throw new Error(`Failed to send media group: ${data.description}`);
    }

    console.log('Sent media group:', data.result.length, 'photos');
    return data.result.map(m => m.message_id);
}

/**
 * Send a video with optional caption
 * Accepts a URL (Telegram downloads it) or binary data via multipart upload
 */
export async function sendVideo(
    env: Env,
    chatId: string | number,
    videoUrl: string,
    caption?: string,
    keyboard?: InlineButton[][]
): Promise<number> {
    const response = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendVideo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            video: videoUrl,
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard ? { inline_keyboard: toTelegramKeyboard(keyboard) } : undefined,
            supports_streaming: true,
        }),
    });

    const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (!data.ok || !data.result) {
        console.error('sendVideo failed:', data.description);
        throw new Error(`Failed to send video: ${data.description}`);
    }

    console.log('Sent video:', data.result.message_id);
    return data.result.message_id;
}

/**
 * Register bot commands with Telegram for / autocomplete menu
 */
export async function setMyCommands(env: Env): Promise<void> {
    const commands = [
        { command: 'start', description: 'Open dashboard' },
        { command: 'generate', description: 'Generate post from commit SHA or PR number' },
        { command: 'drafts', description: 'Browse auto-generated, approved & scheduled drafts' },
        { command: 'repos', description: 'Manage watched repositories' },
        { command: 'watch', description: 'Watch a repo — usage: /watch owner/repo' },
        { command: 'schedule', description: 'Schedule post — usage: /schedule sha 2025-03-01 14:00' },
        { command: 'approve', description: 'Publish all approved drafts to X' },
        { command: 'delete', description: 'Delete published posts by commit SHA' },
        { command: 'handwrite', description: 'Write your own tweet or thread' },
        { command: 'repost', description: 'Create a quote-tweet repost from any tweet URL' },
        { command: 'help', description: 'Show available commands and workflow guide' },
    ];

    await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands }),
    });
}

/**
 * Send a message with optional image
 * If imageUrl is provided, sends photo with caption; otherwise sends text message
 */
export async function sendMessageWithImage(
    env: Env,
    chatId: string | number,
    text: string,
    imageUrl?: string | null,
    keyboard?: InlineButton[][]
): Promise<number> {
    if (imageUrl) {
        // Truncate text to 1024 chars for photo captions (Telegram limit)
        const caption = truncateHtml(text, 1024);
        return sendPhoto(env, chatId, imageUrl, caption, keyboard);
    }
    return sendMessage(env, chatId, text, keyboard);
}

/**
 * Get a file download URL from Telegram
 * Used to download user-sent photos during compose mode
 */
export async function getFileUrl(env: Env, fileId: string): Promise<string | null> {
    const response = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/getFile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId }),
    });

    const data = await response.json() as { ok: boolean; result?: { file_path: string }; description?: string };

    if (!data.ok || !data.result?.file_path) {
        console.error('getFile failed:', data.description);
        return null;
    }

    return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}
