## Context

Today every X (Twitter) API call in `cloudflare-bot/src/integrations/x.ts` is signed with **OAuth 1.0a** via `generateOAuthHeader(env, method, url, bodyParams)` (HMAC-SHA1 over the app's consumer key/secret + per-user access token/secret). Per-user credentials are stored as encrypted columns on the `users` table (`x_api_key_enc`, `x_api_secret_enc`, `x_access_token_enc`, `x_access_secret_enc`), decrypted in `getUserKeys` and overlaid onto `env` by `hydrateEnv` (`src/data/user-keys.ts`). `encrypt`/`decrypt` live in `src/infra/crypto.ts`; keys are written with `storeEncryptedKey(env, chatId, '<col>_enc', await encrypt(env, value))` (see `routes/api-v1-settings.ts`).

The `fix-x-video-append-oauth` change migrated media upload to the v2 endpoints and proved the **upload** works under OAuth 1.0a, but **attaching** the uploaded media to `POST /2/tweets` is rejected (`"Your media IDs are invalid"`). The v2 media→post association requires an **OAuth 2.0 user-context** token (`media.write` scope). The decision (this change) is to migrate **all** X calls — reads, writes, identity, and media — to OAuth 2.0 user-context auth via a **PKCE public client**, with the **webapp** as the connect surface.

Notable: the app has **no existing redirect-based OAuth flow** — Instagram is connected by pasting a token (`api-v1-settings.ts`), and `services/instagram-token.ts` handles long-lived-token exchange/refresh on a cron. So the Authorization-Code-with-PKCE redirect/callback is genuinely new infrastructure. The closest refresh precedent is the Instagram token lifecycle (expiry stored plaintext as `instagram_token_expires_at`, refreshed before expiry).

## Goals / Non-Goals

**Goals:**
- A per-user OAuth 2.0 (Authorization Code + PKCE, public client) connect flow initiated from the webapp, exchanging for access + refresh tokens.
- Encrypted at-rest storage of the access + refresh tokens with expiry; automatic, rotation-aware refresh.
- A single bearer-token resolver used by **every** X API call (reads, writes, media) — replacing `generateOAuthHeader` on the live path.
- Media upload + the media-bearing post share the same OAuth 2.0 user context, so attachment finally succeeds.
- A clean re-connect path: users without a valid OAuth 2.0 token are prompted; nothing silently half-works.

**Non-Goals:**
- No change to Instagram auth, the chunked-upload mechanics (already correct from `fix-x-video-append-oauth`), or the draft/content schema.
- No multi-account-per-user X support (one X identity per user, as today).
- Not deleting the OAuth 1.0a code/columns in this change — they are left inert as a rollback aid; removal is a later cleanup.

## Decisions

### D1 — Full migration to OAuth 2.0 Bearer (retire 1.0a from the live path)
Replace `generateOAuthHeader` usage with `Authorization: Bearer <access_token>` on all calls in `x.ts`: reads (`getUserTweets`, `getTweetById`, `searchConversation`, `lookupUserByUsername`, `getMyProfile`, `fetchUserTweets`), writes (`postTweet`, `postThread`, `postQuoteTweet`, `deleteTweet`), and media (`uploadVideoToX`, `uploadMediaFromBuffer`). The HMAC signing helper and its percent-encode/HMAC utilities become dead code (kept, unexported-where-possible, for rollback). Rationale: a single auth model is simpler than dual-auth, and the media path *requires* 2.0 anyway; partial migration would leave the confusing split that caused this whole investigation. Alternative (media-only dual-auth) rejected by the scope decision.

### D2 — PKCE public client
Use Authorization Code + PKCE with **no client secret** (public client). Connect flow:
1. Webapp (authenticated as `chatId`) calls backend `GET /api/v1/x/oauth/start` → backend generates `state` (random) + `code_verifier` (random 43–128 chars) + `code_challenge = BASE64URL(SHA256(code_verifier))`, persists `{state → chatId, code_verifier}` transiently, and returns the X authorize URL.
2. Webapp redirects the user to `https://x.com/i/oauth2/authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…&code_challenge=…&code_challenge_method=S256`.
3. X redirects to the backend callback `GET /x/oauth/callback?code=…&state=…`.
4. Backend validates `state`, loads `code_verifier`, exchanges at `POST https://api.twitter.com/2/oauth2/token` (`grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`; `Content-Type: application/x-www-form-urlencoded`; **no** Authorization header for a public client), stores tokens, deletes the transient state row, and redirects back to the webapp with a success indicator.

Scopes: `tweet.read tweet.write users.read media.write offline.access` (`offline.access` is required to receive a refresh token). Rationale: public client avoids managing/rotating a client secret on Workers; PKCE is the X-recommended flow for this.

### D3 — Token storage (new encrypted columns + transient PKCE state)
Add to `users`: `x_oauth2_access_enc TEXT`, `x_oauth2_refresh_enc TEXT`, `x_oauth2_expires_at TEXT` (ISO 8601, plaintext — mirrors `instagram_token_expires_at`). Reuse `storeEncryptedKey` + `encrypt`/`decrypt`. Add a transient table `x_oauth_state (state TEXT PRIMARY KEY, chat_id TEXT, code_verifier TEXT, created_at TEXT)` for the in-flight authorize↔callback handshake (rows are single-use and swept after a short TTL, e.g. 10 min). D1 is used (no KV binding exists). `getUserKeys`/`hydrateEnv` resolve a usable bearer into a new `env.X_OAUTH2_ACCESS_TOKEN` field and expose the refresh token + expiry for the refresh step.

### D4 — Refresh: proactive + reactive, rotation-aware, single-flight
- **Proactive**: in `hydrateEnv` (or a resolver it calls), if `x_oauth2_expires_at` is within a buffer (e.g. ≤ 60s away or past), refresh before use: `POST /2/oauth2/token` `grant_type=refresh_token`, `refresh_token`, `client_id`.
- **Reactive**: a thin wrapper around X `fetch`es refreshes once on a `401` and retries the call.
- **Rotation-aware**: X returns a NEW `refresh_token` on each refresh — persist the new access **and** refresh token + recomputed expiry every time, or the next refresh fails.
- **Single-flight**: guard concurrent refreshes (thread post + poller can collide). Use a per-user advisory lock row / compare-and-set on `expires_at`, or accept refresh-on-401 idempotency. Finalize the exact mechanism in implementation (Open Question).

### D5 — Re-connect UX for existing users
Add a `needsXReconnect`-style signal (parallel to the Instagram `needsInstagramReconnect` flag): when a user has no `x_oauth2_access_enc` (or refresh fails), publish/identity flows surface "Connect X" instead of failing opaquely, and the webapp shows a Connect X entry point (accounts/settings). Existing users keep their inert 1.0a columns but must connect via OAuth 2.0 for any X action.

### D6 — Config
New Worker vars: `X_OAUTH2_CLIENT_ID` and `X_OAUTH2_REDIRECT_URI` (public client → no secret). The redirect URI must be registered in the X developer app and point at the backend `/x/oauth/callback` route (registered by prefix in `src/index.ts`, like the other routes).

## Risks / Trade-offs

- **[All X functionality now depends on a valid OAuth 2.0 token]** → If refresh fails, reads *and* writes break, not just media. Mitigate with refresh-on-401, clear reconnect prompts, and never removing the ability to re-auth.
- **[Forced re-auth for every existing user]** → Onboarding friction / temporary breakage until each connects. Mitigate with an explicit, discoverable Connect X prompt and messaging; keep 1.0a columns for emergency rollback.
- **[Refresh-token rotation]** → Failing to persist the rotated refresh token bricks the user's auth on the *next* refresh. Mitigate: persist access+refresh+expiry atomically on every exchange/refresh; test the rotation path.
- **[Concurrent refresh races]** → Two requests refresh at once; the first rotation invalidates the second's refresh token. Mitigate with single-flight/CAS (D4); refresh-on-401 retry tolerates the loser.
- **[API access tier / scope coverage]** → user-context OAuth 2.0 may meter or gate some endpoints (search/recent, user lookup) differently than 1.0a at the app's tier. Mitigate: verify each endpoint post-connect; confirm the scope set.
- **[PKCE state CSRF / fixation]** → Mitigate: random unguessable `state`, single-use, short TTL, bound to `chat_id`; validate on callback.
- **[Token leakage in logs]** → Tokens encrypted at rest; never log access/refresh tokens or the `code`/`code_verifier`.

## Migration Plan

1. D1 migration: add `x_oauth2_*` columns to `users` + create `x_oauth_state` table.
2. Provision the X OAuth 2.0 **public client id** + register the **redirect URI**; set `X_OAUTH2_CLIENT_ID` / `X_OAUTH2_REDIRECT_URI` Worker vars.
3. Backend: `GET /api/v1/x/oauth/start` + `GET /x/oauth/callback`; bearer resolution + refresh in `user-keys`; swap `x.ts` calls to `Bearer`.
4. Webapp: Connect X button + redirect handling + connected/needs-reconnect state.
5. Roll out; prompt existing users to connect. Verify a video publish posts with the video attached (the original goal) and a photo/text post + reads still work.
6. Rollback: revert the `x.ts` auth swap to `generateOAuthHeader` (1.0a columns retained). Later cleanup change removes 1.0a once adoption is complete.

## Open Questions

- Single-flight refresh mechanism: CAS on `expires_at` vs. a lock row vs. rely on refresh-on-401 idempotency.
- Where exactly to persist PKCE `code_verifier`/`state` (chosen: transient D1 `x_oauth_state` table) and the sweep cadence.
- Confirm the scope set covers every endpoint at the app's X API tier (esp. `tweets/search/recent`, `users/by/username`).
- Whether the cron coordinator should also refresh soon-to-expire tokens proactively (like the Instagram refresh) to reduce 401 churn.
