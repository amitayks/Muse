## Purpose

Adds per-user repost default settings — `fast_generate_image` (whether Fast Generate also produces an image) and `analyze_source_image` (whether the source tweet's image is sent to Gemini during repost generation) — stored on the `users` table via D1 migration and exposed as toggle buttons in a "Repost Defaults" section of the settings view.

## Requirements

### Requirement: Fast generate image default setting
The `users` table SHALL include a `fast_generate_image` column (`INTEGER DEFAULT 0`) controlling whether "Fast Generate" in batch notifications also generates an image for the draft.

#### Scenario: Default value for new users
- **WHEN** a new user completes onboarding
- **THEN** `fast_generate_image` SHALL be `0` (off — fast generate skips image for speed)

#### Scenario: User enables fast generate image
- **WHEN** user toggles "Fast Image" to ON in repost settings
- **THEN** `users.fast_generate_image` SHALL be updated to `1`
- **AND** subsequent fast generate actions SHALL call `ensureImage` after draft creation

#### Scenario: User disables fast generate image
- **WHEN** user toggles "Fast Image" to OFF in repost settings
- **THEN** `users.fast_generate_image` SHALL be updated to `0`
- **AND** subsequent fast generate actions SHALL skip image generation (image generated lazily on View Draft)

### Requirement: Source image analysis default setting
The `users` table SHALL include an `analyze_source_image` column (`INTEGER DEFAULT 1`) controlling whether the source tweet's image is sent to Gemini during repost generation.

#### Scenario: Default value for new users
- **WHEN** a new user completes onboarding
- **THEN** `analyze_source_image` SHALL be `1` (on — source images analyzed by default)

#### Scenario: User disables source image analysis
- **WHEN** user toggles "Source Analysis" to OFF in repost settings
- **THEN** `users.analyze_source_image` SHALL be updated to `0`
- **AND** repost generation (both fast and compose) SHALL NOT send the source tweet's image to Gemini

#### Scenario: User enables source image analysis
- **WHEN** user toggles "Source Analysis" to ON in repost settings
- **THEN** `users.analyze_source_image` SHALL be updated to `1`
- **AND** repost generation SHALL send the source tweet's image to Gemini when available

### Requirement: Repost defaults section in settings view
The settings view SHALL include a "Repost Defaults" section with toggle buttons for `fast_generate_image` and `analyze_source_image`.

#### Scenario: Settings view renders repost defaults
- **WHEN** user opens the settings view
- **THEN** a "🔄 Repost Defaults" section SHALL be visible
- **AND** it SHALL show two toggle buttons: `[🎨 Fast Image: OFF/ON]` and `[📷 Source Analysis: ON/OFF]`

#### Scenario: Toggle fast image in settings
- **WHEN** user clicks the "🎨 Fast Image" toggle
- **THEN** the setting SHALL be toggled in the database
- **AND** the settings view SHALL re-render with the updated toggle state

#### Scenario: Toggle source analysis in settings
- **WHEN** user clicks the "📷 Source Analysis" toggle
- **THEN** the setting SHALL be toggled in the database
- **AND** the settings view SHALL re-render with the updated toggle state

### Requirement: DB migration for repost settings
The system SHALL add the new columns via a D1 migration.

#### Scenario: Migration adds columns
- **WHEN** the migration runs
- **THEN** `users` table SHALL gain `fast_generate_image INTEGER DEFAULT 0` and `analyze_source_image INTEGER DEFAULT 1`
- **AND** existing users SHALL have the default values applied
