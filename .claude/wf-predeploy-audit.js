export const meta = {
  name: 'predeploy-wip-audit',
  description: 'Adversarially audit the unrelated uncommitted WIP files that would ship in this Worker deploy',
  phases: [{ title: 'Audit', detail: 'one reviewer per unrelated WIP file — deploy-safety only' }],
}

const ROOT = '/Users/amkeisar/Keisar/Projects/MusePostBot/cloudflare-bot'

// Unrelated uncommitted files (NOT part of the identity-depth change) that
// `wrangler deploy` would bundle into the production Worker.
const FILES = [
  'cloudflare-bot/src/core/publish.ts',
  'cloudflare-bot/src/data/draft-db.ts',
  'cloudflare-bot/src/routes/api-v1-drafts.ts',
  'cloudflare-bot/src/routes/api-v1-media.ts',
  'cloudflare-bot/src/services/video-publish.ts',
]

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'shipRisk', 'looksComplete', 'summary', 'concerns'],
  properties: {
    file: { type: 'string' },
    shipRisk: { type: 'string', enum: ['none', 'low', 'medium', 'high'], description: 'risk of shipping this diff to prod' },
    looksComplete: { type: 'boolean', description: 'does the change look finished vs. half-written WIP' },
    summary: { type: 'string', description: 'what the diff does, in 1-2 sentences' },
    concerns: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['severity', 'detail'],
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          detail: { type: 'string' },
        },
      },
    },
  },
}

phase('Audit')

const verdicts = await parallel(FILES.map(f => () => agent(
  `You are a deploy-safety reviewer. The repo at ${ROOT.replace('/cloudflare-bot','')} has uncommitted changes that are about to be deployed to a PRODUCTION Cloudflare Worker via "wrangler deploy". Your job is to assess ONE file: ${f}.

Steps:
1. Run: cd ${ROOT.replace('/cloudflare-bot','')} && git diff ${f}   (read the full diff)
2. Read the surrounding code in the file as needed for context.

Assess ONLY production deploy-safety (NOT style). Specifically look for:
  - Module-load-time / top-level code that could THROW at Worker startup (breaks the whole worker).
  - Obviously INCOMPLETE or half-written WIP (stub returns, TODO-blocking logic, commented-out critical code, debugging left in, a function that no longer does what its callers expect).
  - Removed/renamed exports or changed function signatures that could break OTHER modules at runtime (note: the project already typechecks clean, so focus on runtime/logic behavior, not type errors).
  - Data-loss or destructive DB/storage operations introduced by the diff.
  - Anything that changes externally-visible behavior (publishing, media handling, API routes) in a way that looks risky or unfinished.

Note: tsc --noEmit already passes for the whole project, so do NOT report pure type issues. Focus on runtime correctness and completeness. If the diff looks like a clean, finished change, say so with shipRisk "none" or "low" and looksComplete true. Be concrete and skeptical. Do NOT edit anything.`,
  { label: `audit:${f.split('/').pop()}`, phase: 'Audit', schema: VERDICT_SCHEMA },
)))

const ok = verdicts.filter(Boolean)
const risky = ok.filter(v => v.shipRisk === 'high' || v.shipRisk === 'medium' || v.looksComplete === false)

return {
  reviewed: ok.length,
  riskyCount: risky.length,
  verdicts: ok.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2, none: 3 }
    return order[a.shipRisk] - order[b.shipRisk]
  }),
}
