# webapp-schedule-calendar Specification

## Purpose
TBD - created by archiving change webapp-schedule-calendar. Update Purpose after archive.
## Requirements
### Requirement: Calendar picker replaces the day-chip + clock sheet

The webapp SHALL schedule a draft through a calendar picker that opens from the draft's Schedule action. The picker SHALL present a **month view** by default and SHALL drill into a **day view** when a day is selected. It SHALL replace the prior 7-day-chip + circular-clock sheet (`ScheduleSheet`). The picker SHALL be modal and SHALL target exactly one draft (the one being scheduled).

#### Scenario: Open the picker

- **WHEN** the user taps Schedule on a draft (status `draft`/`approved`/`scheduled`)
- **THEN** the calendar picker SHALL open in month view showing the current month in the user's configured timezone

#### Scenario: Cancel without scheduling

- **WHEN** the user dismisses the picker (backdrop tap, close button, or Cancel)
- **THEN** the picker SHALL close and the draft's schedule SHALL be unchanged

### Requirement: Month view in the user's configured timezone

The month view SHALL render a 7-column grid of the visible month computed in the user's configured `users.timezone` offset (never the device timezone). Each day cell SHALL show a density indicator for the number of posts on that day, SHALL mark "today", and SHALL mark the day of the draft's current slot when rescheduling. The user SHALL be able to page to the previous and next month.

#### Scenario: Days with posts show density

- **WHEN** a day in the visible month has one or more posts (scheduled or published)
- **THEN** that day cell SHALL display a density indicator reflecting the count (e.g. dots or "+N")

#### Scenario: Today is marked in the user's timezone

- **WHEN** the month view renders
- **THEN** the cell for the current date in the user's configured offset SHALL be visually marked as today

#### Scenario: Page between months

- **WHEN** the user taps the previous/next month control
- **THEN** the grid SHALL move to the adjacent month and SHALL load that month's posts for display

#### Scenario: Empty month

- **WHEN** the visible month has no posts
- **THEN** the grid SHALL render with no density indicators (no error or empty placeholder is required)

### Requirement: Day view hour ruler with posts pinned to their time

Selecting a day SHALL open a day view showing a vertical 24-hour ruler in the user's configured timezone. Every post on that day SHALL appear pinned to its hour (with sub-hour minute reflected), labelled with its title and a platform icon per selected target. Hours wholly in the past relative to "now" in the user's timezone SHALL be read-only.

#### Scenario: Posts appear at their hour

- **WHEN** the day view opens for a day that has posts
- **THEN** each post SHALL be rendered in the row for its hour, in time order, showing its title and platform icons

#### Scenario: Past hours are not selectable

- **WHEN** the day being viewed is today and an hour row is entirely before the current time in the user's timezone
- **THEN** that hour row SHALL be read-only and SHALL NOT offer a "schedule here" action

#### Scenario: Return to month view

- **WHEN** the user taps the day-view back/month control
- **THEN** the picker SHALL return to the month view with the same visible month

### Requirement: Tap an hour to schedule with minute fine-tuning

Tapping an empty, selectable hour row SHALL select that hour for the targeted draft at minute `00` and SHALL reveal a fine-tune control allowing the user to adjust the minutes before confirming. Confirming SHALL schedule the draft at the selected wall-clock time.

#### Scenario: Tap an hour selects it

- **WHEN** the user taps an empty future hour row (e.g. 14:00)
- **THEN** the picker SHALL select that time at minute 00 and SHALL show a fine-tune control and a confirm action

#### Scenario: Fine-tune the minutes

- **WHEN** the user adjusts the fine-tune control to a different minute (e.g. 30)
- **THEN** the selected time SHALL update accordingly (e.g. 14:30) before confirmation

#### Scenario: Confirm schedules the draft

- **WHEN** the user confirms the selected time
- **THEN** the picker SHALL emit the wall-clock value `"YYYY-MM-DDTHH:mm"` in the user's configured timezone and SHALL schedule the draft via `POST /api/v1/drafts/:id/schedule`, after which the draft status SHALL become `scheduled` and the bot message SHALL update

### Requirement: Emit wall-clock time without device-timezone conversion

The picker SHALL emit the chosen time as a raw wall-clock string `"YYYY-MM-DDTHH:mm"` interpreted in the user's configured timezone, and SHALL NOT apply the device timezone. The backend (`POST /api/v1/drafts/:id/schedule`) remains responsible for converting that wall-clock to UTC for storage.

#### Scenario: Wall-clock contract preserved

- **WHEN** a user in `UTC+2` confirms 14:30 on 2026-06-19
- **THEN** the picker SHALL emit `"2026-06-19T14:30"` (no `Z`, no offset, no device-timezone shift), identical to the contract the prior sheet used

### Requirement: Full content calendar backdrop

The picker SHALL display, as read-only context, both future **scheduled** drafts and past **published** posts for the visible range, so the user sees real posting cadence while choosing a slot. Only the draft currently being scheduled SHALL be actionable from within the picker; other posts SHALL be read-only context.

#### Scenario: Past published posts are shown

- **WHEN** the visible month/day includes days on which posts were already published
- **THEN** those published posts SHALL appear in the calendar as read-only items (distinguishable from upcoming scheduled posts)

#### Scenario: Other posts are not edited from the picker

- **WHEN** the user taps a post that is not the draft being scheduled
- **THEN** the picker SHALL NOT unschedule or reschedule that other post (it MAY navigate to that post read-only, but SHALL NOT mutate it)

#### Scenario: Calendar data loads per visible window

- **WHEN** the visible month changes
- **THEN** the picker SHALL request the posts for that window via the Calendar range API (`GET /api/v1/calendar?from=&to=`) covering the visible grid's first and last days

### Requirement: Reschedule opens on the current slot

When the targeted draft is already scheduled, the picker SHALL open on the month and day of its current slot, SHALL highlight that slot as the current selection, and SHALL allow the user to pick a new slot. Confirming a new slot SHALL reschedule the same draft.

#### Scenario: Reschedule an already-scheduled draft

- **WHEN** the picker opens for a draft whose `scheduled_at` is 2026-06-19 14:30
- **THEN** the month view SHALL show June 2026 with June 19 indicated as the current slot, and selecting a different future slot and confirming SHALL update the draft's `scheduled_at` to the new time

### Requirement: Past-time selection is prevented

The confirm action SHALL be disabled whenever the selected wall-clock time is at or before "now" in the user's configured timezone, so the picker never submits a past time.

#### Scenario: Confirm disabled for a past selection

- **WHEN** the selected wall-clock time is at or before the current time in the user's configured timezone
- **THEN** the confirm action SHALL be disabled and the draft SHALL NOT be scheduled

