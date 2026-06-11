## Why

X (Twitter) media publishing is broken end-to-end and the root cause is the auth model, not the upload code. The `fix-x-video-append-oauth` change migrated all X media upload to the v2 endpoints (`/2/media/upload/*`) and proved the **upload** works under our existing OAuth 1.0a credentials — a video uploads completely and processes to `succeeded`. But **attaching** that media to a post via `POST /2/tweets` is rejected with `"Your media IDs are invalid"`, even though the media id is the correct format (`^[0-9]{1,19}$`) and fully processed. The X v2 media APIs require **OAuth 2.0 user-context tokens with the `media.write` scope** for the media→post association; OAuth 1.0a is accepted for the upload calls but the resulting media is not attachable by a 1.0a-posted tweet. This change adds OAuth 2.0 user authorization so that media (photos and videos) can actually be posted.

**Decided scope (full migration).** Migrate **all** X API calls — reads, writes, identity, and media — to **OAuth 2.0 user-context** auth via a **PKCE public client** (no client secret), with the **webapp** as the connect surface. OAuth 1.0a is retired from the live request path (HMAC signing removed); existing per-user 1.0a credentials remain in the DB only as an inert fallback/rollback aid.

- Add an **OAuth 2.0 Authorization Code + PKCE** connect flow for X per user, initiated from the **webapp**: build the authorize URL with `code_challenge` (S256) and scopes (`tweet.read tweet.write users.read media.write offline.access`), handle the redirect callback, and exchange the code (+ `code_verifier`) for an access token + refresh token. Public client → no client secret.
- **Store** per-user OAuth 2.0 tokens encrypted (mirroring the existing `*_enc` columns and `encrypt`/`decrypt` in `key-encryption`), with the access-token expiry, and **refresh** them with the refresh token (`offline.access`) on expiry / on a 401.
- **Resolve a bearer** in `hydrateEnv`/key resolution and use `Authorization: Bearer <access_token>` for **every** X call in `integrations/x.ts` — replacing `generateOAuthHeader` (OAuth 1.0a HMAC) across all read endpoints (`getUserTweets`, `getTweetById`, `searchConversation`, `lookupUserByUsername`, `getMyProfile`, `fetchUserTweets`) and all write endpoints (`postTweet`, `postThread`, `postQuoteTweet`, `deleteTweet`, `uploadVideoToX`, `uploadMediaFromBuffer`). Media upload and the media-bearing post now share the same OAuth 2.0 user context, which is what makes attachment work.
- Add a **Connect X** entry point + OAuth callback route in the **webapp** (parallel to the existing accounts/settings + Instagram-reconnect patterns), and set a `needsXReconnect`-style flag when a user has no valid OAuth 2.0 token so flows prompt to connect.
- Provide a **transition path** for existing users (who only have OAuth 1.0a creds): detect missing OAuth 2.0 tokens and prompt re-connect; no silent breakage.

## Capabilities

### New Capabilities
- `x-oauth2-auth`: per-user OAuth 2.0 (Authorization Code + PKCE, public client) authorization initiated from the webapp, encrypted access/refresh token storage, automatic refresh (on expiry / 401), and bearer-token resolution used by all X API calls.

### Modified Capabilities
- `user-key-resolution`: `hydrateEnv`/key resolution SHALL resolve a valid per-user OAuth 2.0 access token (refreshing via the stored refresh token when expired) and expose it for `Bearer` auth; OAuth 1.0a credential resolution is no longer used for live requests.
- `video-publish-pipeline`: the shared X media uploader SHALL authenticate with the OAuth 2.0 bearer (not OAuth 1.0a), so the uploaded media is attachable to a post by the same user context.
- `publish-pipeline`: all X post calls (text and media, thread, quote, delete) SHALL use the OAuth 2.0 user context.
- `twitter-source-system`: the read/poller paths (`getUserTweets`, `searchConversation`, `getTweetById`, `lookupUserByUsername`) SHALL use OAuth 2.0 bearer auth.
- `user-identity-system`: identity fetch (`fetchUserTweets`, `getMyProfile`) SHALL use OAuth 2.0 bearer auth.

## Impact

- **Code**: `cloudflare-bot/src/integrations/x.ts` — replace `generateOAuthHeader` (OAuth 1.0a HMAC) with an OAuth 2.0 `Authorization: Bearer` resolver on **every** request (reads + writes + media); `src/data/user-keys.ts` (resolve + refresh OAuth 2.0 tokens); new route handlers for the OAuth 2.0 authorize redirect + PKCE callback; webapp **Connect X** UI + state; a DB migration for new encrypted columns (`x_oauth2_access_enc`, `x_oauth2_refresh_enc`, `x_oauth2_expires_at`, plus PKCE `code_verifier`/`state` transient storage).
- **Re-auth**: existing users (OAuth 1.0a only) must connect via OAuth 2.0 before X actions work; the webapp prompts them. Old `x_*_enc` 1.0a columns are retained but inert (rollback aid).
- **Config**: an X **OAuth 2.0 client id** and a registered **redirect URI** must be provisioned in the X developer app (public client → no secret).
- **Depends on**: `fix-x-video-append-oauth` (the v2 upload migration) — prerequisite; this change supplies the auth context that makes upload + attach work end-to-end.
- **Not affected**: Instagram publishing, the chunked-upload mechanics (already correct), the DB content/draft schema.

## Open Questions (for the design phase)

- **Transition/rollback**: keep an OAuth 1.0a fallback path behind a flag during rollout, or hard-cut to OAuth 2.0? (Leaning hard-cut with the 1.0a columns retained but unused.)
- **Refresh concurrency**: how to avoid races when multiple concurrent requests (e.g. a thread post + poller) refresh the same expired token — single-flight lock vs. refresh-on-401-and-retry.
- **PKCE transient state**: where to persist `code_verifier` + `state` between the authorize redirect and the callback (short-TTL KV row vs. DB), keyed to the user.
- **Scope finalization**: confirm the scope set (`tweet.read tweet.write users.read media.write offline.access`) covers every endpoint in use (search, user lookup, delete) at the user's API access tier.
- **Token↔post coupling**: confirm media upload and the media-bearing post must use the same access-token instance/user (expected yes) — validate during implementation.
