## MODIFIED Requirements

### Requirement: Remove character limit from AI prompts
All AI prompt instructions SHALL NOT include tweet character length constraints. The AI should generate content at natural social media length without artificial truncation.

#### Scenario: Content generation prompts
- **WHEN** the system generates tweet content via Gemini
- **THEN** the prompt SHALL NOT include "≤ 280 characters" or similar char-limit rules
- **AND** response parsing SHALL NOT truncate tweet text to 280 characters

#### Scenario: AI refinement prompts
- **WHEN** the system refines tweet content via Gemini
- **THEN** the prompt SHALL NOT include character length constraints

#### Scenario: Quote skill prompts
- **WHEN** the quote skill generates content (English and Hebrew)
- **THEN** the prompt SHALL NOT include "<=280 characters" constraints

#### Scenario: Video script prompts
- **WHEN** the video skill generates scripts with Twitter captions
- **THEN** the prompt SHALL NOT describe Twitter captions as "max 280 chars"
