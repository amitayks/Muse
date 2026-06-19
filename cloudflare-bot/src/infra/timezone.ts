/**
 * Timezone utilities — parse, apply, and format UTC offsets
 *
 * Offsets are stored as strings: 'UTC', 'UTC+2', 'UTC-5:30', etc.
 * All internal storage and cron logic stays in UTC.
 * Offsets are applied only at input/output boundaries.
 */

/**
 * Parse a UTC offset string into total minutes.
 * 'UTC' → 0, 'UTC+2' → 120, 'UTC-5:30' → -330
 */
export function parseOffset(tz: string): number {
    if (!tz || tz === 'UTC') return 0;

    const match = tz.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return 0;

    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3] || '0', 10);

    return sign * (hours * 60 + minutes);
}

/**
 * Apply a UTC offset to a Date, returning a new Date shifted by the offset.
 * Useful for display: UTC date + offset → "local" date.
 */
export function applyOffset(date: Date, tz: string): Date {
    const offsetMinutes = parseOffset(tz);
    return new Date(date.getTime() + offsetMinutes * 60_000);
}

/**
 * Remove a UTC offset from a local datetime, converting to UTC.
 * Useful for input: user enters local time → subtract offset → store UTC.
 */
export function toUTC(date: Date, tz: string): Date {
    const offsetMinutes = parseOffset(tz);
    return new Date(date.getTime() - offsetMinutes * 60_000);
}

/**
 * Format a UTC datetime string to the user's local time for display.
 * Returns "YYYY-MM-DD at HH:MM (UTC+X)" format.
 */
export function formatLocalTime(utcDateStr: string, tz: string): string {
    const utcDate = new Date(utcDateStr);
    const local = applyOffset(utcDate, tz);

    const yyyy = local.getUTCFullYear();
    const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(local.getUTCDate()).padStart(2, '0');
    const hh = String(local.getUTCHours()).padStart(2, '0');
    const min = String(local.getUTCMinutes()).padStart(2, '0');

    const label = tz === 'UTC' ? 'UTC' : tz;
    return `${yyyy}-${mm}-${dd} at ${hh}:${min} (${label})`;
}

/**
 * Validate a timezone string format.
 * Accepts: 'UTC', 'UTC+N', 'UTC-N', 'UTC+N:MM', 'UTC-N:MM'
 */
export function isValidTimezone(tz: string): boolean {
    return tz === 'UTC' || /^UTC[+-]\d{1,2}(:\d{2})?$/.test(tz);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Format a Date's UTC fields as a SQLite-comparable string "YYYY-MM-DD HH:MM:SS".
 * Matches the shape of D1's `datetime('now')`, so it can be compared lexicographically
 * against normalized `scheduled_at` / `published_at` columns.
 */
export function formatSqlUTC(date: Date): string {
    const y = date.getUTCFullYear();
    const mo = pad2(date.getUTCMonth() + 1);
    const d = pad2(date.getUTCDate());
    const h = pad2(date.getUTCHours());
    const mi = pad2(date.getUTCMinutes());
    const s = pad2(date.getUTCSeconds());
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/**
 * Expand a local calendar-date window `[from 00:00:00, to 23:59:59]` in the user's `tz`
 * into a UTC window, returned as SQLite-comparable "YYYY-MM-DD HH:MM:SS" strings.
 *
 * `from`/`to` are wall-clock dates ("YYYY-MM-DD") in the user's configured offset — the same
 * contract the schedule input uses. We parse them as as-if-UTC instants, then `toUTC` subtracts
 * the offset so the bounds are true UTC (e.g. UTC+2 `from=2026-06-01` → `2026-05-31 22:00:00`).
 */
export function localDateRangeToUTC(from: string, to: string, tz: string): { fromUTC: string; toUTC: string } {
    const startLocal = new Date(`${from}T00:00:00Z`);
    const endLocal = new Date(`${to}T23:59:59Z`);
    return {
        fromUTC: formatSqlUTC(toUTC(startLocal, tz)),
        toUTC: formatSqlUTC(toUTC(endLocal, tz)),
    };
}
