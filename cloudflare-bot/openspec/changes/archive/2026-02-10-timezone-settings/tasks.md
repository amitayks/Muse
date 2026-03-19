## 1. Schema & Migration

- [x] 1.1 Add `timezone TEXT DEFAULT 'UTC'` column to `chat_state` in schema.sql
- [x] 1.2 Add ALTER TABLE migration in routes/migrate.ts
- [x] 1.3 Update `ChatState` interface in types.ts to include `timezone`

## 2. Timezone Utilities

- [x] 2.1 Create timezone helper functions: `parseOffset(tz: string) → minutes`, `applyOffset(date: Date, tz: string) → Date`, `formatLocalTime(utcDate: string, tz: string) → string`
- [x] 2.2 Add `getTimezone(env, chatId) → string` DB helper that reads timezone from chat_state
- [x] 2.3 Add `setTimezone(env, chatId, tz: string)` DB helper that updates timezone in chat_state

## 3. Settings UI

- [x] 3.1 Add settings button to home dashboard in views/home.ts
- [x] 3.2 Create `renderSettings(timezone: string)` view showing current timezone + "Change Timezone" button
- [x] 3.3 Create `renderTimezoneSelect()` view with preset offset buttons (UTC-5 through UTC+5:30) + "Type custom" option
- [x] 3.4 Add `view:settings` and `view:timezone_select` routes in actions/view-change.ts
- [x] 3.5 Add `config:timezone:OFFSET` callback handler for preset button clicks
- [x] 3.6 Add `timezone` awaiting_input handler for custom offset text input
- [x] 3.7 Validate timezone format and save, then redirect to settings view

## 4. Schedule Input Timezone

- [x] 4.1 In inputs/schedule.ts (Flow 1 — existing draft), read user timezone and convert local input to UTC before storing
- [x] 4.2 In inputs/schedule.ts (Flow 2 — /schedule command), same timezone conversion
- [x] 4.3 Update past-time validation to compare against user's local "now"

## 5. Display Timezone

- [x] 5.1 In views/drafts.ts `renderDraftDetail()`, convert scheduled_at to user's local time for display
- [x] 5.2 In schedule confirmation messages, show time with timezone label (e.g., "14:00 (UTC+2)")
- [x] 5.3 In handlers/cron.ts publish notification, show local time for the draft owner

## 6. Verification

- [x] 6.1 TypeScript compile check (`npx tsc --noEmit`)
- [ ] 6.2 Deploy and test: set timezone, schedule a draft, verify stored UTC time, verify display
