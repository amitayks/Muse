## 1. Schema, config & types

- [x] 1.1 D1 migration: `migrations/020_x_oauth2_media.sql` + `schema.sql` in sync + idempotent (020) block wired into `routes/migrate.ts`. **APPLIED to remote D1** via `wrangler d1 execute` (x_oauth_state table + 3 columns live).
- [~] 1.2 Provisioning: `X_OAUTH2_REDIRECT_URI` secret set (`…/x/oauth/callback`); `WEBAPP_URL` + `WORKER_URL` already set. ⏳ **`X_OAUTH2_CLIENT_ID` PENDING** — user must create the X OAuth 2.0 **public client** + register the redirect URI, then provide the Client ID
- [x] 1.3 Extend the `Env` type with `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_REDIRECT_URI`, `X_OAUTH2_ACCESS_TOKEN`

## 2. OAuth 2.0 connect flow (backend)

- [x] 2.1 `services/x-oauth.ts`: PKCE helpers (`generatePkce` via Web Crypto), `buildAuthorizeUrl`, `exchangeCode` + `refreshAccessToken` (public client, urlencoded, no secret)
- [x] 2.2 Transient state store: `putXOAuthState` / `takeXOAuthState` (single-use delete-on-read, 10-min TTL) in `data/user-db.ts`
- [x] 2.3 `GET /api/v1/x/oauth/start` (`handleXOAuthStart`): pkce+state, persist, return authorize URL
- [x] 2.4 `GET /x/oauth/callback` (`handleXOAuthCallback`): validate state, exchange code, persist tokens, redirect with `?x_connected=`
- [x] 2.5 Register both routes (`/api/v1/x/oauth/start` in `api-v1.ts`; `/x/oauth/callback` in `index.ts`, honoring `X_OAUTH2_REDIRECT_URI`)

## 3. Token storage, resolution & refresh

- [x] 3.1 `storeXOAuth2Tokens(...)`: encrypt access/refresh + write ISO expiry
- [x] 3.2 `getValidXAccessToken` + `hydrateEnv` set `X_OAUTH2_ACCESS_TOKEN` (no Worker-secret fallback)
- [x] 3.3 `refreshAccessToken` path persists the **rotated** refresh token + new expiry. ⚠️ No single-flight guard for concurrent refreshes (self-heals via refresh-on-401) — see Review notes
- [x] 3.4 Proactive refresh when `x_oauth2_expires_at` is within the buffer (60s)

## 4. Switch all X API calls to Bearer

- [x] 4.1 `xFetch` wrapper in `integrations/x.ts` (Bearer; on 401 refresh once + retry; throw `XReconnectError` when no token)
- [x] 4.2 Reads converted (`getUserTweets`, `getTweetById`, `searchConversation`, `lookupUserByUsername`, `getMyProfile`, `fetchUserTweets`)
- [x] 4.3 Writes converted (`postTweet`, `postThread`, `postQuoteTweet`, `deleteTweet`)
- [x] 4.4 Media converted (`uploadVideoToX` init/append/finalize/status, `uploadMediaFromBuffer`)
- [x] 4.5 1.0a retired from the live UX: onboarding (`renderXKeysPrompt`/`handleXKeysInput`) + Settings (`settings-key.ts`) X paths now redirect to the web-app Connect X flow (no 1.0a key entry). `generateOAuthHeader`/`verifyCredentials`/`verifyXCredentials` remain defined as dead/rollback code (only the admin `/test-x` debug route still references the legacy validator)

## 5. Reconnect UX (backend signal + webapp)

- [x] 5.1 Reconnect signal: `publish.ts` X branch maps `XReconnectError` → `errors.x='needs_x_reconnect'` + `needsXReconnect`; poller skips users with no valid token
- [x] 5.2 Webapp Connect X: `api.startXOAuth()` → redirect to authorize URL; `SettingsPage` Connect/Reconnect button + `?x_connected` return handling
- [x] 5.3 i18n strings (en + he) for connect/reconnect

## 6. Validate

- [x] 6.1 Typecheck both packages — `cloudflare-bot` and `webapp` both `tsc --noEmit` clean (exit 0), verified independently of the workflow
- [ ] 6.2 Live: connect a user via the webapp OAuth flow; confirm `x_oauth2_*` stored + a read succeeds — **MANUAL (needs browser OAuth consent)**
- [ ] 6.3 Live: publish a draft with a **video**; confirm it posts WITH the video attached, `publish_results.x` has `tweet_ids`, no `errors.x` — **MANUAL**
- [ ] 6.4 Live regression: photo post, text thread, quote tweet, identity fetch all succeed under the bearer — **MANUAL**
- [ ] 6.5 Verify refresh: simulate/await expiry or a 401; confirm refresh + rotated refresh persisted + retry — **MANUAL**

## Review notes (workflow wf_6d0a80b5 — reviewed by the main loop)

Code is complete and typechecks clean. Open items before it works in prod:

1. **Migration application** (task 1.1): `migrations/020_x_oauth2_media.sql` exists and `schema.sql` is in sync, but the idempotent programmatic runner `routes/migrate.ts` was intentionally not edited (route file owned by another slice). Deploy must either run `wrangler d1 execute content-bot-db --remote --file=migrations/020_x_oauth2_media.sql` OR add a guarded block to `migrate.ts`.
2. **Provisioning** (task 1.2): set `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_REDIRECT_URI` (== the registered redirect, path `/x/oauth/callback`), and `WEBAPP_URL`.
3. **Orphaned OAuth 1.0a paths** (task 4.5): `verifyCredentials` (and the `settings-key.ts` 1.0a key-paste onboarding + `/test-x` route) still assume 1.0a creds and will fail for OAuth2-only users. Follow-up: retire/redirect the 1.0a key entry to the OAuth connect flow.
4. **Refresh concurrency** (task 3.3): no single-flight; two concurrent hydrates can both refresh with the same (rotating) refresh token → one transient spurious reconnect, self-heals on the next call. Harden with a CAS/lock if churn shows up.
5. **Live validation** (6.2–6.5) + deploy remain human-gated; not deployed.
