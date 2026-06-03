/**
 * Telegram WebApp initData validation using HMAC-SHA256.
 *
 * Follows Telegram's official validation flow:
 * 1. Parse initData as URL query string
 * 2. Extract `hash` parameter
 * 3. Sort remaining params alphabetically, join with \n
 * 4. HMAC-SHA256 with key derived from bot token
 * 5. Compare computed hash with provided hash
 */

export interface InitDataResult {
    valid: boolean;
    expired?: boolean;
    chatId?: string;
    user?: { id: number; first_name: string; last_name?: string; username?: string };
}

/**
 * Validate Telegram WebApp initData signature.
 * Returns the authenticated user's chatId on success.
 */
export async function validateInitData(initData: string, botToken: string): Promise<InitDataResult> {
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return { valid: false };

        // Check auth_date freshness (1 hour window)
        const authDate = params.get('auth_date');
        if (authDate) {
            const authTimestamp = parseInt(authDate, 10);
            const now = Math.floor(Date.now() / 1000);
            if (now - authTimestamp > 3600) {
                return { valid: false, expired: true };
            }
        }

        // Build data check string: sort params (excluding hash) and join with \n
        params.delete('hash');
        const entries = Array.from(params.entries());
        entries.sort((a, b) => a[0].localeCompare(b[0]));
        const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

        // Derive secret key: HMAC-SHA256("WebAppData", botToken)
        const encoder = new TextEncoder();
        const secretKeyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode('WebAppData'),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const secretKeyBytes = await crypto.subtle.sign('HMAC', secretKeyMaterial, encoder.encode(botToken));

        // Compute HMAC of data check string
        const signingKey = await crypto.subtle.importKey(
            'raw',
            secretKeyBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const signatureBytes = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(dataCheckString));

        // Compare hashes
        const computedHash = Array.from(new Uint8Array(signatureBytes))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        if (computedHash !== hash) {
            return { valid: false };
        }

        // Extract user info
        const userJson = params.get('user');
        if (!userJson) return { valid: false };

        const user = JSON.parse(userJson) as { id: number; first_name: string; last_name?: string; username?: string };
        return {
            valid: true,
            chatId: String(user.id),
            user,
        };
    } catch {
        return { valid: false };
    }
}
