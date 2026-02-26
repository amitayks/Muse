/**
 * Shared UI utility functions
 */

export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Safely truncate HTML text to a max length without breaking tags.
 * Strips all open tags that would be left unclosed after truncation.
 */
export function truncateHtml(html: string, maxLen: number): string {
    if (html.length <= maxLen) return html;

    // Truncate to maxLen - 3 to leave room for "..."
    let truncated = html.substring(0, maxLen - 3);

    // If we cut inside a tag (after < but before >), back up to before the <
    const lastOpen = truncated.lastIndexOf('<');
    const lastClose = truncated.lastIndexOf('>');
    if (lastOpen > lastClose) {
        truncated = truncated.substring(0, lastOpen);
    }

    // Close any unclosed tags
    const openTags: string[] = [];
    const tagRegex = /<\/?([a-zA-Z]+)[^>]*>/g;
    let match;
    while ((match = tagRegex.exec(truncated)) !== null) {
        const isClosing = match[0][1] === '/';
        const tagName = match[1].toLowerCase();
        if (isClosing) {
            const idx = openTags.lastIndexOf(tagName);
            if (idx !== -1) openTags.splice(idx, 1);
        } else {
            openTags.push(tagName);
        }
    }

    // Close tags in reverse order
    let result = truncated + '...';
    for (let i = openTags.length - 1; i >= 0; i--) {
        result += `</${openTags[i]}>`;
    }
    return result;
}
