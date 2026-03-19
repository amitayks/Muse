## MODIFIED Requirements

### Requirement: Account detail view
The system SHALL provide a `renderAccountDetail(env, chatId, accountId, lang)` view showing account info and config toggle buttons. Layout SHALL include: account name/username header, watching status, overview status, and settings toggles. The language toggle button SHALL NOT be included (language is now a global user setting).

#### Scenario: Settings buttons layout
- **WHEN** account detail is rendered
- **THEN** settings buttons SHALL include: [#️⃣ Tags], [🖼 Img] [🎲 N%], [📊 Threshold: N] [🎭 Tone], [✅ Auto-approve: ON/OFF], [⏸️ Stop watching / 👁 Start watching], [🗑️ Delete], [◀️ Back]
- **AND** there SHALL be NO language toggle button (🌐 Lang removed)

## REMOVED Requirements

### Requirement: Per-account language configuration
**Reason**: Language is now a global user-level setting (in `users.language`), not a per-account setting. The `TwitterAccountConfig.language` field and its toggle are removed.
**Migration**: Existing `language` values in account config JSON blobs will be ignored. User-level language setting takes precedence for all AI content generation.
