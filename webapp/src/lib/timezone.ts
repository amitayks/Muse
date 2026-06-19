/**
 * Timezone utilities for the webapp — a mirror of `cloudflare-bot/src/infra/timezone.ts`.
 *
 * The user's timezone is a UTC offset string ('UTC', 'UTC+2', 'UTC-5:30') stored in
 * `users.timezone`. Scheduled times are persisted in UTC; these helpers render them back
 * in the user's *configured* offset — NOT the device timezone — so the webapp's scheduled
 * times agree with the bot, which interprets all scheduling in `users.timezone`.
 *
 * The shift trick: `applyOffset` moves a UTC instant by the offset so the result's UTC
 * fields read as the wall-clock time in `tz`. Formatting then reads those fields via
 * `{ timeZone: 'UTC' }`, keeping the user's locale while ignoring the device timezone.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse a stored timestamp as UTC. The backend persists scheduled times in UTC but in SQLite's
 * `"YYYY-MM-DD HH:MM:SS"` form (no `T`, no `Z` — `scheduleDraft` strips them for cron comparison).
 * A bare `new Date()` would reinterpret that as *device-local* time, shifting every displayed
 * scheduled time by the device offset. Normalize to an explicit-UTC form first.
 */
export function parseUTC(s: string): Date {
  let t = s.trim().replace(' ', 'T');
  // Append 'Z' only when there's no timezone designator already (Z, or ±HH:MM / ±HHMM).
  if (!/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(t)) t += 'Z';
  return new Date(t);
}

/** Parse a UTC offset string into total minutes. 'UTC'→0, 'UTC+2'→120, 'UTC-5:30'→-330. */
export function parseOffset(tz: string): number {
  if (!tz || tz === 'UTC') return 0;
  const m = tz.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return 0;
  const sign = m[1] === '+' ? 1 : -1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
}

/**
 * Shift a UTC date by the offset so the result's `getUTC*` fields (or `{ timeZone: 'UTC' }`
 * formatting) read as the wall-clock time in `tz`.
 */
export function applyOffset(date: Date, tz: string): Date {
  return new Date(date.getTime() + parseOffset(tz) * 60_000);
}

/** Day index (days since epoch) of an instant within the user's offset. */
function offsetDayIndex(date: Date, tz: string): number {
  return Math.floor(applyOffset(date, tz).getTime() / ONE_DAY_MS);
}

/** Whole-day delta in the user's offset: 0 = today, 1 = tomorrow, -1 = yesterday, … */
export function dayDeltaInTz(iso: string, tz: string, now: Date = new Date()): number {
  return offsetDayIndex(parseUTC(iso), tz) - offsetDayIndex(now, tz);
}

/** Locale time-of-day (e.g. "14:30" / "2:30 PM") rendered in the user's offset. */
export function formatTimeInTz(iso: string, tz: string): string {
  return applyOffset(parseUTC(iso), tz).toLocaleTimeString(undefined, {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Locale short date (e.g. "Mon, Jun 22") rendered in the user's offset. */
export function formatDateInTz(iso: string, tz: string): string {
  return applyOffset(parseUTC(iso), tz).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
