## Context

Schedule times are parsed as UTC in Cloudflare Workers (V8's `new Date()` treats timezone-less strings as UTC). D1's `datetime('now')` also returns UTC. Users enter local times but the system stores/compares everything in UTC, causing posts to publish at the wrong time.

The bot currently has no user settings system. This change introduces one with timezone as the first setting, designed so more settings can be added later.

## Goals / Non-Goals

**Goals:**
- Let users configure their timezone once
- Apply the timezone offset when parsing schedule input
- Display scheduled times in the user's timezone
- Extensible settings storage for future config options

**Non-Goals:**
- Auto-detecting timezone from Telegram (Telegram doesn't expose this)
- Full timezone picker with DST rules (use fixed UTC offsets for simplicity)
- Settings for anything other than timezone in this change

## Decisions

### Store timezone in `chat_state` table
Add a `timezone` column to `chat_state` (default `'UTC'`). This avoids a new table for a single column and `chat_state` already exists per user.

Alternative: Separate `settings` table. Rejected — over-engineering for one field. Easy to migrate later if needed.

### Use UTC offset format (`UTC+2`, `UTC-5`, etc.)
Store timezone as a string like `'UTC+2'`, `'UTC-5:30'`, `'UTC'`. Parse the offset in hours (and optional minutes) for conversion.

Alternative: IANA timezone names (`Asia/Jerusalem`). Rejected — requires a timezone database for DST calculations, overkill for a Telegram bot. Users can adjust the offset seasonally if needed.

### Offset applied at input/output boundaries only
- **Schedule input**: User types local time → subtract offset → store UTC
- **Display**: Read UTC from DB → add offset → show local time
- **Cron/DB internals**: Everything stays UTC

### Settings UI as a simple view
A "Settings" button on the dashboard leads to a settings view showing the current timezone with a "Change" button. Clicking it prompts the user to type their offset. Follows the existing `awaiting_input` pattern.

### Timezone selection via common presets + custom input
Show buttons for common offsets (UTC-5 to UTC+5:30) plus an option to type a custom offset. This is faster than making users type every time.

## Risks / Trade-offs

- [No DST support] → Users in DST regions need to update offset twice a year. Acceptable for v1; can add IANA support later.
- [Schema migration] → Adding column to `chat_state` requires ALTER TABLE on existing DBs. Migration route already exists and handles this.
