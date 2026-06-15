# Deploy & Migrate

How to ship the `content-bot` Worker and apply DB changes **today**.

> ⚠️ This is the *correct* process for how the project is currently wired — **not** the
> best practice we want long-term. See [Known sharp edges](#known-sharp-edges-not-best-practice)
> at the bottom. Follow this until we migrate to a cleaner setup.

All commands run from `cloudflare-bot/` unless noted.

- **Worker:** `content-bot` → https://content-bot.keisarcontentcreator.workers.dev
- **Config:** `cloudflare-bot/wrangler.toml`
- **D1 database:** `content-bot-db`
- **Auth:** OAuth token via `wrangler login` (needs `d1 (write)` + `workers_scripts (write)`). Check with `npx wrangler whoami`.

---

## 1. Deploy the Worker

```bash
cd cloudflare-bot
npx wrangler deploy --dry-run   # validate the bundle builds first
npx wrangler deploy             # ship it
```

⚠️ **`wrangler deploy` bundles the entire working tree, not git.** Whatever is
currently in `cloudflare-bot/src` ships to production — including uncommitted and
unrelated WIP. Before deploying, run `git status` and make sure you actually want
everything that's modified to go live.

> The `webapp/` (React) deploys **separately** to Cloudflare Pages and is not affected
> by `wrangler deploy` of the Worker.

---

## 2. Apply a database migration

The numbered files in `migrations/*.sql` and `schema.sql` are **documentation / local
setup only**. They are NOT what runs in production. There is no `migrations_dir`, so
`wrangler d1 migrations apply` does nothing, and `npm run db:migrate` only runs
`schema.sql` (`CREATE TABLE IF NOT EXISTS`) — it will **not** alter existing tables.

**Production migrations are code-embedded** as idempotent blocks in
`src/routes/migrate.ts`, run by hitting the `/migrate` endpoint (guarded by `ADMIN_SECRET`).

### Recipe: add a new column

1. **Add an idempotent block** to `src/routes/migrate.ts` (PRAGMA-check → `ALTER`),
   matching the existing pattern, e.g.:

   ```ts
   // Migration: Add my_new_col column to users table (0XX)
   try {
       const info = await env.DB.prepare("PRAGMA table_info(users)").all();
       const has = info.results?.some((c: any) => c.name === 'my_new_col');
       if (!has) {
           await env.DB.prepare(`ALTER TABLE users ADD COLUMN my_new_col INTEGER DEFAULT 0;`).run();
           logInfo('Added my_new_col column to users table');
       }
   } catch (e) {
       logInfo('my_new_col migration note:', String(e));
   }
   ```

2. **Keep the docs in sync** (so fresh DBs and humans stay correct): add the column to
   `schema.sql`'s `CREATE TABLE`, and add a numbered `migrations/0XX_*.sql` file.

3. **Apply it to prod.** Two options:

   - **Direct (preferred for one-offs)** — uses your `wrangler` auth, no secret needed.
     Migrate *before* deploying new code that reads the column (additive columns are
     tolerant, but migrate-first is the safe order):
     ```bash
     npx wrangler d1 execute content-bot-db --remote \
       --command "ALTER TABLE users ADD COLUMN my_new_col INTEGER DEFAULT 0;"
     ```
   - **Via the endpoint** — after deploying the updated `migrate.ts`, hit:
     ```bash
     curl "https://content-bot.keisarcontentcreator.workers.dev/migrate?secret=$ADMIN_SECRET"
     ```
     This is idempotent (the PRAGMA-check skips columns that already exist).

4. **Verify:**
   ```bash
   npx wrangler d1 execute content-bot-db --remote \
     --command "SELECT name FROM pragma_table_info('users') WHERE name='my_new_col';"
   ```

---

## Order of operations

For additive columns: **migrate first, then deploy**, so the new code never runs
against a table missing the column. (Code that reads a new column should still tolerate
its absence — see `getIdentityTweetCount` for the `try/catch → default` pattern.)

---

## LinkedIn publishing setup (migration 023)

LinkedIn publishing adds per-user OAuth 2.0 tokens + a connect flow. To enable it:

1. **Create a LinkedIn app** at <https://www.linkedin.com/developers/apps>. Add the
   **"Sign In with LinkedIn using OpenID Connect"** and **"Share on LinkedIn"** products,
   and request **programmatic refresh tokens** (so 60-day access tokens refresh silently).
2. **Register the redirect URL** in the app's Auth tab. It must exactly equal
   `LINKEDIN_REDIRECT_URI`; its path is the callback route served by the Worker, e.g.
   `https://content-bot.keisarcontentcreator.workers.dev/linkedin/oauth/callback`.
3. **Set Worker config** (vars in the dashboard or `wrangler.toml`, secret via CLI):
   ```bash
   # Vars
   #   LINKEDIN_CLIENT_ID    = <app Client ID>
   #   LINKEDIN_REDIRECT_URI = https://<worker-host>/linkedin/oauth/callback
   npx wrangler secret put LINKEDIN_CLIENT_SECRET   # confidential client — required in token exchange
   ```
   If any of the three is unset, `/api/v1/linkedin/oauth/start` returns 503 and the
   connect button is inert (LinkedIn stays hidden until a user connects), so deploying
   without config is safe.
4. **Apply migration 023** (adds the `linkedin_*` user columns + `linkedin_oauth_state`
   table) — same as any additive migration above (direct `wrangler d1 execute` of
   `migrations/023_linkedin_publishing.sql`, or hit `/migrate`). Migrate before deploy.
5. Users connect under **Settings → API Keys → LinkedIn** (OAuth, no key paste). Once
   connected (`has_linkedin = 1`), the LinkedIn target appears on the draft platform toggles.

---

## Known sharp edges (not best practice)

These are why this doc exists. Things to fix when we modernize the pipeline:

- **Migrations live in app code** (`migrate.ts`) behind a secret-guarded HTTP endpoint.
  Fragile and non-standard. **Ideal:** real `wrangler d1 migrations` with a
  `migrations_dir`, versioned and tracked in a `d1_migrations` table.
- **Three sources of truth** that can drift: `schema.sql`, `migrations/*.sql`, and
  `migrate.ts`. **Ideal:** one source.
- **Deploys come from the working tree, not a committed/tagged state**, so uncommitted
  or unrelated WIP can leak into production. **Ideal:** deploy from CI on a clean,
  tagged commit.
- **`npm run db:migrate` is misleading** — it runs `schema.sql`, which can't alter
  existing tables. Don't rely on it for migrations.
