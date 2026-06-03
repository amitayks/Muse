## Purpose

This capability provides an admin-only WebApp page at `/app/admin-prompts` for editing all seven system prompt types (content, edit, repost, video, overview, persona, scoring) in both English and Hebrew. It enforces 403 access control for non-admins, offers an EN/HE language toggle independent of the admin's bot language, and supports saving to the admin's personal `user_prompts` row or pushing a new versioned global default to all users; it is served as a standalone HTML page separate from the user prompt editor.

## Requirements

### Requirement: Admin prompt editor WebApp page
The system SHALL serve a separate HTML page at `/app/admin-prompts` that provides a prompt editing interface for all 7 prompt types in both languages. Access SHALL be restricted to admin users only.

#### Scenario: Admin opens editor
- **WHEN** the admin taps the "System Prompts (Admin)" button in settings
- **THEN** Telegram SHALL open the WebApp at `/app/admin-prompts`
- **AND** the page SHALL display 7 tabs: Content, Edit, Repost, Video, Overview, Persona, Scoring

#### Scenario: Non-admin accesses admin URL
- **WHEN** a non-admin user somehow navigates to `/app/admin-prompts`
- **THEN** the API calls SHALL return HTTP 403
- **AND** the page SHALL show "Admin access required"

### Requirement: Admin language toggle
The admin editor SHALL display a language toggle (EN/HE) that allows switching between English and Hebrew prompt variants independently of the admin's bot language setting.

#### Scenario: Switch to Hebrew variant
- **WHEN** the admin clicks the HE language toggle
- **THEN** the editor SHALL load the Hebrew prompt for the currently selected type
- **AND** the HE button SHALL appear as the active selection

#### Scenario: Edit English then Hebrew
- **WHEN** the admin edits the English content prompt, saves, then switches to Hebrew
- **THEN** the Hebrew content prompt SHALL load (independent text from the English version)

### Requirement: Admin Save (personal only)
The admin editor SHALL provide a [Save] button that saves the prompt to the admin's personal `user_prompts` row only, without affecting global defaults.

#### Scenario: Admin saves personally
- **WHEN** the admin clicks [Save]
- **THEN** the prompt SHALL be saved to `user_prompts` for the admin's chat_id
- **AND** `default_prompts` SHALL NOT be modified
- **AND** a success confirmation SHALL be shown

### Requirement: Admin Save and Push to Users
The admin editor SHALL provide a [Save & Push to Users] button that updates the global default prompt and bumps the version number.

#### Scenario: Admin pushes new default
- **WHEN** the admin clicks [Save & Push to Users]
- **THEN** a confirmation dialog SHALL appear: "This will become the new default for all users who haven't customized. Continue?"
- **AND** on confirm, the API SHALL update `default_prompts` content, increment version, and save the admin's personal copy
- **AND** a success message SHALL show the new version number

#### Scenario: Admin cancels push
- **WHEN** the admin clicks [Save & Push to Users] and then cancels the confirmation
- **THEN** no changes SHALL be made to `default_prompts`

### Requirement: Admin editor shows all 7 prompt types
The admin editor SHALL display tabs for all prompt types: content, edit, repost, video, overview, persona, and scoring. There SHALL be no restriction on which types the admin can edit.

#### Scenario: Admin edits scoring prompt
- **WHEN** the admin selects the Scoring tab
- **THEN** the scoring system prompt SHALL load in the textarea
- **AND** Save and Save & Push SHALL both work for this type

### Requirement: Admin editor served as separate HTML
The admin editor SHALL be a completely separate HTML page from the user editor at `/app/prompts`. It SHALL NOT share the same HTML with conditional rendering based on role.

#### Scenario: Admin and user pages are independent
- **WHEN** the admin editor HTML is updated
- **THEN** the user editor at `/app/prompts` SHALL NOT be affected
