## Requirements

### Requirement: Per-compose language override stored in ComposeState
The `ComposeState` interface SHALL include an optional `langOverride` field of type `'en' | 'he'` that carries a per-session language override for AI skill and prompt resolution. When set, all AI calls during the compose session SHALL use this value instead of the user's global language. The override SHALL NOT be persisted to the database and SHALL be discarded when the compose session ends (pen-down or cancel).

#### Scenario: ComposeState with langOverride set
- **WHEN** the user toggles the language button in compose mode
- **THEN** `ComposeState.langOverride` SHALL be set to the opposite of the current effective language
- **AND** the value SHALL be stored in the chat state context alongside other compose fields

#### Scenario: ComposeState without langOverride (default)
- **WHEN** a compose session is entered without toggling the language button
- **THEN** `ComposeState.langOverride` SHALL be `undefined`
- **AND** all AI calls SHALL use the user's global language from `getUserLanguage()`

#### Scenario: langOverride discarded on session end
- **WHEN** the user clicks Pen Down or Cancel
- **THEN** the `ComposeState` (including `langOverride`) SHALL be cleared from context
- **AND** the user's global language setting SHALL remain unchanged

### Requirement: Language toggle callback in compose action handler
The compose action handler SHALL support a `compose:toggle_lang` callback that toggles the `langOverride` field in `ComposeState`.

#### Scenario: Toggle lang from default (no override)
- **WHEN** callback data is `compose:toggle_lang` and `ComposeState.langOverride` is `undefined`
- **THEN** `ComposeState.langOverride` SHALL be set to the opposite of the user's global language
- **AND** the compose view SHALL re-render with the updated lang button label

#### Scenario: Toggle lang back to global (clear override)
- **WHEN** callback data is `compose:toggle_lang` and `ComposeState.langOverride` equals the opposite of the user's global language
- **THEN** `ComposeState.langOverride` SHALL be set to `undefined` (back to global)
- **AND** the compose view SHALL re-render with the updated lang button label

#### Scenario: Toggle lang state persists across other toggles
- **WHEN** the user toggles lang to Hebrew, then toggles AI or Image Gen
- **THEN** `ComposeState.langOverride` SHALL remain `'he'` after the other toggle
- **AND** the lang button SHALL still show "English"

### Requirement: Language button rendered in compose extras row
The `renderCompose` function SHALL render a language toggle button in the extras row (between the toggle row and the action row) for all compose modes (handwrite, repost, commit).

#### Scenario: Lang button in handwrite mode (no other extras)
- **WHEN** the compose view is rendered in handwrite mode with global lang `en` and no langOverride
- **THEN** the keyboard SHALL include an extras row containing a single button labeled "עברית" with callback data `compose:toggle_lang`
- **AND** this row SHALL appear between the toggle row and the action row

#### Scenario: Lang button in repost mode (alongside Thread)
- **WHEN** the compose view is rendered in repost mode with a sourceTweet
- **THEN** the extras row SHALL contain both the lang button and the Thread toggle button
- **AND** the lang button SHALL appear first in the row

#### Scenario: Lang button label when overridden to Hebrew
- **WHEN** `langOverride` is `'he'` (effective lang is Hebrew)
- **THEN** the lang button label SHALL be "English"

#### Scenario: Lang button label when overridden to English (global is Hebrew)
- **WHEN** the user's global lang is `'he'` and `langOverride` is `'en'`
- **THEN** the lang button label SHALL be "עברית"

#### Scenario: Lang button label when no override
- **WHEN** `langOverride` is `undefined` and global lang is `'en'`
- **THEN** the lang button label SHALL be "עברית" (shows what you'd switch to)

#### Scenario: Lang button label when no override and global is Hebrew
- **WHEN** `langOverride` is `undefined` and global lang is `'he'`
- **THEN** the lang button label SHALL be "English"

### Requirement: ComposeOptions extended with langOverride and globalLang
The `ComposeOptions` interface SHALL include `langOverride?: 'en' | 'he'` and `globalLang?: 'en' | 'he'` fields so that `renderCompose` can compute the effective language and render the correct button label.

#### Scenario: ComposeOptions with both fields
- **WHEN** `renderCompose` is called with `options.langOverride = 'he'` and `options.globalLang = 'en'`
- **THEN** the effective language SHALL be `'he'` and the button label SHALL be "English"

#### Scenario: ComposeOptions without langOverride
- **WHEN** `renderCompose` is called with `options.globalLang = 'en'` and no `langOverride`
- **THEN** the effective language SHALL be `'en'` and the button label SHALL be "עברית"

### Requirement: Effective language used for AI calls at pen-down
All pen-down handlers (handwrite, repost, commit) SHALL compute the effective language as `compose.langOverride ?? globalLang` and use it for all AI function calls. UI-facing strings (status messages, toasts) SHALL continue to use the global language.

#### Scenario: Handwrite pen-down with lang override to Hebrew
- **WHEN** user clicks Pen Down in handwrite mode with `langOverride: 'he'` and `aiRefine: true`
- **THEN** `refineHandwrittenContent` SHALL be called with `lang = 'he'`
- **AND** the status message ("Refining with AI...") SHALL render in the user's global language (not Hebrew)

#### Scenario: Repost pen-down with lang override to Hebrew
- **WHEN** user clicks Pen Down in repost mode with `langOverride: 'he'` and `aiRefine: true`
- **THEN** `generateRepostContent` SHALL be called with `language: 'he'`
- **AND** `assembleSystemInstruction` SHALL be called with `lang = 'he'` to resolve the Hebrew quote skill

#### Scenario: Commit pen-down with lang override to Hebrew
- **WHEN** user clicks Pen Down in commit mode with `langOverride: 'he'` and `aiRefine: true`
- **THEN** `generateContent` SHALL be called with `lang = 'he'`
- **AND** the Hebrew work-progress skill and Hebrew identity document SHALL be used

#### Scenario: Pen-down without lang override
- **WHEN** user clicks Pen Down with `langOverride` as `undefined`
- **THEN** all AI calls SHALL use the global language from `getUserLanguage()` (existing behavior preserved)

### Requirement: i18n strings for language button labels
The bot string registries (en.ts, he.ts) SHALL include string keys for the language button labels used in the compose view.

#### Scenario: English string registry
- **WHEN** the English string registry is examined
- **THEN** it SHALL include `compose.btnLangHe` with value `'עברית'` and `compose.btnLangEn` with value `'English'`

#### Scenario: Hebrew string registry
- **WHEN** the Hebrew string registry is examined
- **THEN** it SHALL include `compose.btnLangHe` with value `'עברית'` and `compose.btnLangEn` with value `'English'`

#### Scenario: Labels are language-name constants
- **WHEN** the lang button labels are rendered
- **THEN** "עברית" SHALL always be "עברית" and "English" SHALL always be "English" regardless of the current UI language (they are proper names, not translatable strings)
