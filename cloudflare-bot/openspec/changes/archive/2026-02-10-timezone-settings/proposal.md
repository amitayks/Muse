## Why

Schedule times are stored and compared in UTC, but users enter local times without knowing the offset. A post scheduled for "08:10" by a user in UTC+2 actually publishes at 10:10 local time. There's no way to configure a timezone, and no indication that times are UTC.

## What Changes

- Add a user settings system with timezone as the first configurable option
- New "Settings" button on the home dashboard
- Settings view showing current timezone with a change option
- Store timezone per chat in the database
- Apply timezone offset when parsing schedule input (convert user's local time → UTC for storage)
- Display scheduled times in the user's local timezone
- Default to UTC if no timezone is configured

## Capabilities

### New Capabilities
- `user-settings`: Settings view, storage, and timezone configuration UI
- `schedule-timezone`: Apply user's timezone when scheduling and displaying times

### Modified Capabilities

## Impact

- `chat_state` or new `settings` table in D1 for timezone storage
- `inputs/schedule.ts` — parse datetime with timezone offset
- `views/drafts.ts` — display scheduled times in user's timezone
- `views/home.ts` — add Settings button to dashboard
- `actions/view-change.ts` — add settings route
- `handlers/cron.ts` — notification displays local time
