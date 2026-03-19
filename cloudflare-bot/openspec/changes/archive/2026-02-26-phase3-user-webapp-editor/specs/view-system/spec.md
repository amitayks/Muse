## ADDED Requirements

### Requirement: InlineButton supports web_app type
The `InlineButton` interface SHALL include an optional `web_app` field of type `{ url: string }`. When present, the button SHALL open a Telegram WebApp at the specified URL.

#### Scenario: WebApp button in keyboard
- **WHEN** a ViewResult keyboard includes a button with `web_app: { url: 'https://...' }`
- **THEN** the `toTelegramKeyboard()` serializer SHALL include `web_app: { url: '...' }` in the Telegram API payload

#### Scenario: WebApp button mutually exclusive with callback_data
- **WHEN** a button has a `web_app` field
- **THEN** it SHALL NOT also have `callback_data` (they are mutually exclusive per Telegram API)

### Requirement: TelegramMessage includes web_app_data
The `TelegramMessage` interface SHALL include an optional `web_app_data` field of type `{ data: string; button_text: string }`.

#### Scenario: WebApp sends data back
- **WHEN** a WebApp calls `Telegram.WebApp.sendData()` (not used in our flow, but type support needed)
- **THEN** the message handler SHALL have access to `message.web_app_data`

### Requirement: toTelegramKeyboard serializes web_app buttons
The `toTelegramKeyboard()` function in `services/telegram.ts` SHALL include a `web_app` branch that passes the `web_app` field to the Telegram API.

#### Scenario: Serialize web_app button
- **WHEN** a button with `web_app: { url: 'https://bot.example.com/app/prompts' }` is serialized
- **THEN** the output SHALL include `{ text: '📝 System Prompts', web_app: { url: 'https://bot.example.com/app/prompts' } }`
