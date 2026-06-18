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
The system SHALL integrate with Telegram via the `@telegram-apps/sdk-react` library, accessed through a thin `lib/telegram.ts` facade so screens depend on the facade rather than the SDK directly. The facade SHALL expose: `initData`, theme params, viewport, color scheme, `MainButton`, `BackButton`, `SettingsButton`, `HapticFeedback`, and `showConfirm`/`showPopup`. The hand-rolled wrapper over `window.Telegram.WebApp` is replaced.

#### Scenario: SDK initialization on app load
- **WHEN** the webapp loads inside Telegram's WebApp container
- **THEN** the app SHALL signal readiness and expand to full height, bind the theme params and viewport to reactive state, and make `BackButton`/`MainButton`/`SettingsButton` available to screens

#### Scenario: initData is available for auth
- **WHEN** the webapp loads inside Telegram's WebApp container
- **THEN** `initData` SHALL be a non-empty string exposed via the facade and used for the `Authorization: tma <initData>` header

#### Scenario: Webapp loaded outside Telegram
- **WHEN** the webapp is loaded in a regular browser (not inside Telegram)
- **THEN** the app SHALL display a message instructing the user to open it from Telegram, and SHALL NOT attempt API calls

#### Scenario: Theme params are reactive
- **WHEN** the user changes their Telegram theme (light/dark) while the Mini App is open
- **THEN** the facade SHALL update the exposed theme params and the UI SHALL re-render with the new colors without a reload

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
The system SHALL provide a shared layout with a **custom bottom Tabbar** on top-level tabbed screens and **no bottom nav** on flow/detail screens. Top-level tabs SHALL be: Home, Drafts, Repos, Accounts, Settings. Flow/detail screens (Composer/Draft-viewer, Repo detail, Account detail, Settings sub-pages) SHALL hide the Tabbar and use the system `BackButton`. The Video Studio navigation item is removed.

#### Scenario: Navigation bar shows current page
- **WHEN** the user is on the drafts hub
- **THEN** the "Drafts" item in the Tabbar SHALL be visually highlighted as active

#### Scenario: Navigation items
- **WHEN** the Tabbar renders on a top-level screen
- **THEN** it SHALL display exactly: Home, Drafts, Repos, Accounts, Settings — and SHALL NOT include Video Studio

#### Scenario: Flow screen hides the Tabbar
- **WHEN** the user opens a flow/detail screen (e.g. the Composer/Draft-viewer or a Repo detail)
- **THEN** the bottom Tabbar SHALL be hidden and the system `BackButton` SHALL be shown for return navigation

#### Scenario: Safe-area aware
- **WHEN** the Tabbar renders
- **THEN** it SHALL respect the device safe-area inset at the bottom

### Requirement: Telegram theme integration
The system SHALL derive ALL color, and the spacing/radius/typography scales, from Telegram `themeParams` via CSS custom properties defined in a single tokens layer (`--bg`, `--text`, `--hint`, `--link`, `--accent`/button color, `--secondary-bg`, …), updated reactively on theme change. There SHALL be no hardcoded color palette and no `!important` overrides. The app SHALL set the Telegram header and background colors to match.

#### Scenario: Light and dark matching
- **WHEN** the user's Telegram is in light or dark mode
- **THEN** the webapp SHALL render with the corresponding colors sourced from Telegram's theme params, with no hardcoded black/white palette

#### Scenario: Accent color adoption
- **WHEN** the user's Telegram exposes a button/accent color
- **THEN** primary actions and active states SHALL use that accent color via the token, not a fixed brand color

#### Scenario: Fallback colors in development
- **WHEN** the webapp is loaded outside Telegram (development) and theme params are unavailable
- **THEN** the tokens SHALL fall back to sensible light-theme defaults so the UI is usable

### Requirement: Native Telegram chrome orchestration
The system SHALL orchestrate the global system `MainButton`, `BackButton`, and `SettingsButton` through a single provider, with screens declaring intent via hooks (e.g. `useMainButton`, `useBackButton`) that register on mount and clean up on unmount, so screens never collide over the singleton buttons. Confirmations SHALL use Telegram `showConfirm`/`showPopup` (not a custom modal), and committing/toggling actions SHALL trigger `HapticFeedback`.

#### Scenario: MainButton bound to the screen's primary action
- **WHEN** a flow screen mounts and declares a primary action via `useMainButton`
- **THEN** the system `MainButton` SHALL show that label and invoke the screen's handler on tap

#### Scenario: Button cleanup on navigation
- **WHEN** the user leaves a flow screen
- **THEN** that screen's `MainButton`/`BackButton` registrations SHALL be cleared so the next screen controls them cleanly

#### Scenario: Native confirmation for destructive actions
- **WHEN** the user triggers a destructive action (e.g. delete a draft)
- **THEN** the app SHALL request confirmation via `showConfirm`/`showPopup` and proceed only on confirm

#### Scenario: Haptic feedback on commit
- **WHEN** the user toggles a setting or commits a primary action
- **THEN** the app SHALL emit the appropriate `HapticFeedback` (impact/notification)

### Requirement: Design-token styling foundation
The system SHALL style all components via design tokens and co-located CSS Modules. Inline `style` objects SHALL be used only for genuinely dynamic computed values (e.g. a progress width); all other styling SHALL be class-based. `!important` SHALL NOT be used. Standard native surfaces (lists, cells, sections, switches, inputs, tabbar, popups) SHALL be built with the Telegram UI component kit; bespoke screens (Composer/Draft-viewer, Home timeline) SHALL consume the same theme tokens for visual consistency.

#### Scenario: No inline-style screens
- **WHEN** a screen or component is implemented
- **THEN** its visual styling SHALL live in a CSS Module (or the UI kit), not in inline `style={{}}` objects, except for dynamic computed values

#### Scenario: Tokens drive component styling
- **WHEN** a bespoke component renders
- **THEN** its colors and scales SHALL reference the theme tokens, so it matches the kit components automatically across light/dark/accent

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
