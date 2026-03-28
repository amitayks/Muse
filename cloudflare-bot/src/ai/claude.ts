/**
 * Claude AI Provider - Text generation via Claude Messages API
 *
 * SECURITY: Uses secure logging and sanitizes API error responses
 */

import type { Env } from '../types';
import { logError } from '../infra/security';

const CLAUDE_API = 'https://api.anthropic.com/v1';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const CLAUDE_API_VERSION = '2023-06-01';
const CLAUDE_MAX_TOKENS = 8192;

/** Options for Claude text calls (same shape as GeminiOptions) */
export interface ClaudeOptions {
    temperature?: number;
    jsonMode?: boolean;
    tools?: Array<Record<string, unknown>>;
}

/** Claude content block types */
type ClaudeContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/**
 * Translate Gemini-format parts to Claude content blocks.
 * Gemini uses {text} and {inline_data: {mime_type, data}}.
 * Claude uses {type:'text', text} and {type:'image', source: {type:'base64', media_type, data}}.
 */
function translateParts(
    parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>
): ClaudeContentBlock[] {
    return parts.map(part => {
        if (part.text !== undefined) {
            return { type: 'text' as const, text: part.text };
        }
        if (part.inline_data) {
            return {
                type: 'image' as const,
                source: {
                    type: 'base64' as const,
                    media_type: part.inline_data.mime_type,
                    data: part.inline_data.data,
                },
            };
        }
        return { type: 'text' as const, text: '' };
    });
}

/**
 * Call Claude Messages API with system instruction and user prompt.
 * Accepts the same input format as callGeminiText (Gemini-style parts).
 */
export async function callClaudeText(
    env: Env,
    systemPrompt: string,
    userPrompt: string | Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>,
    options?: ClaudeOptions,
): Promise<string> {
    const temperature = options?.temperature ?? 0.7;

    // Build user content
    const content: ClaudeContentBlock[] = typeof userPrompt === 'string'
        ? [{ type: 'text', text: userPrompt }]
        : translateParts(userPrompt);

    const body: Record<string, unknown> = {
        model: CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
        temperature,
    };

    // Add tools if specified (already translated by the router)
    if (options?.tools && options.tools.length > 0) {
        body.tools = options.tools;
    }

    const response = await fetch(`${CLAUDE_API}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.CLAUDE_API_KEY || '',
            'anthropic-version': CLAUDE_API_VERSION,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errText = await response.text();
        logError('Claude API failed:', response.status, errText.substring(0, 200));
        throw new Error('Content generation failed. Please try again.');
    }

    const data = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
    };

    const text = data.content?.find(c => c.type === 'text')?.text;
    if (!text) {
        throw new Error('No content generated');
    }

    return text;
}

/**
 * Validate a Claude API key by making a lightweight test call.
 */
export async function validateClaudeKey(key: string): Promise<boolean> {
    try {
        const response = await fetch(`${CLAUDE_API}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': CLAUDE_API_VERSION,
            },
            body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Say "hello" in one word.' }],
            }),
        });
        return response.ok;
    } catch {
        return false;
    }
}
