## Purpose

Defines the webapp application shell: the Vite + React 19 + TypeScript scaffold, Telegram WebApp SDK integration and theming, hash-based routing, a shared layout with navigation, English/Hebrew i18n with RTL, a centralized authenticated API client, and consistent loading and error states.

## Requirements

### Requirement: React SPA project scaffold
The system SHALL provide a Vite + React 19 + TypeScript project in the `webapp/` directory at the monorepo root, with Cloudflare Pages deployment configuration.

#### Scenario: Project builds successfully
- **WHEN** `npm run build` is executed in the `webapp/` directory
- **THEN** Vite produces a static build in `webapp/dist/` with `index.html`, JS bundles, and CSS

#### Scenario: Development server starts
- **WHEN** `npm run dev` is executed in the `webapp/` directory
- **THEN** a local dev server starts on a configurable port with HMR (hot module replacement)

### Requirement: Telegram WebApp SDK integration
The system SHALL integrate with Telegram's WebApp JavaScript SDK to access `initData`, theme variables, and lifecycle events.

#### Scenario: SDK initialization on app load
- **WHEN** the webapp loads inside Telegram's WebApp container
- **THEN** the app calls `window.Telegram.WebApp.ready()` and `window.Telegram.WebApp.expand()` to signal readiness and expand to full height

#### Scenario: initData is available for auth
- **WHEN** the webapp loads inside Telegram's WebApp container
- **THEN** `window.Telegram.WebApp.initData` is a non-empty string that can be used for API authentication

#### Scenario: Webapp loaded outside Telegram
- **WHEN** the webapp is loaded in a regular browser (not inside Telegram)
- **THEN** the app SHALL display a message instructing the user to open it from Telegram, and SHALL NOT attempt API calls

### Requirement: Hash-based routing
The system SHALL use React Router v7 with hash-based routing (`/#/path`) for all page navigation.

#### Scenario: Direct deep link to draft editor
- **WHEN** the webapp is opened with URL `https://app.example.com/#/draft/abc123`
- **THEN** the draft editor page loads for draft ID `abc123`

#### Scenario: Navigation between pages
- **WHEN** the user navigates from the home page to drafts list
- **THEN** the URL hash changes to `/#/drafts` and the drafts list page renders without a full page reload

#### Scenario: Browser back button
- **WHEN** the user presses the browser/Telegram back button
- **THEN** the app navigates to the previous route in history

### Requirement: Shared layout with navigation
The system SHALL provide a shared layout component with navigation elements (bottom nav bar or sidebar) that persists across pages.

#### Scenario: Navigation bar shows current page
- **WHEN** the user is on the drafts list page
- **THEN** the "Drafts" item in the navigation bar is visually highlighted as active

#### Scenario: Navigation items
- **WHEN** the navigation bar renders
- **THEN** it SHALL display items for: Home, Drafts, Repos, Accounts, Settings, and conditionally Video Studio (for admin users only)

### Requirement: Telegram theme integration
The system SHALL use Telegram WebApp CSS variables (`--tg-theme-bg-color`, `--tg-theme-text-color`, `--tg-theme-button-color`, `--tg-theme-button-text-color`, `--tg-theme-hint-color`, `--tg-theme-link-color`, `--tg-theme-secondary-bg-color`) for all theming.

#### Scenario: Dark mode matching
- **WHEN** the user's Telegram is in dark mode
- **THEN** the webapp automatically renders with dark colors from Telegram's theme variables

#### Scenario: Fallback colors in development
- **WHEN** the webapp is loaded outside Telegram (development mode) and Telegram variables are not available
- **THEN** the app SHALL use sensible fallback colors (light theme defaults) so the UI is usable

### Requirement: Internationalization (i18n)
The system SHALL support English (`en`) and Hebrew (`he`) languages, with RTL layout support for Hebrew.

#### Scenario: Language detection from Telegram
- **WHEN** the webapp loads
- **THEN** the app SHALL detect the user's language from `window.Telegram.WebApp.initDataUnsafe.user.language_code` and fall back to `en` if unavailable or unsupported

#### Scenario: RTL layout for Hebrew
- **WHEN** the language is set to `he`
- **THEN** the root HTML element SHALL have `dir="rtl"` and all layout SHALL render right-to-left

#### Scenario: Translation function
- **WHEN** a component renders a user-facing string
- **THEN** it SHALL use a `t(key)` function that returns the translated string for the current language

### Requirement: API client layer
The system SHALL provide a centralized API client that handles authentication, base URL configuration, error handling, and response parsing.

#### Scenario: Auth header on every request
- **WHEN** the API client makes a request to the Worker
- **THEN** it SHALL include the header `Authorization: tma <initData>` where initData is from `window.Telegram.WebApp.initData`

#### Scenario: 401 handling (session expired)
- **WHEN** an API response returns status 401
- **THEN** the app SHALL display a message "Session expired — please reopen the app from Telegram" and stop further API calls

#### Scenario: Network error handling
- **WHEN** a fetch request fails due to network error
- **THEN** the app SHALL display an error toast/banner and allow the user to retry

### Requirement: Loading and error states
The system SHALL provide consistent loading indicators and error displays across all pages.

#### Scenario: Page loading
- **WHEN** a page is fetching its initial data
- **THEN** a loading skeleton or spinner SHALL be displayed in place of content

#### Scenario: Action error
- **WHEN** an action (save, publish, delete) fails
- **THEN** an error message SHALL appear (toast or inline) with the error description, and the action button SHALL return to its enabled state
