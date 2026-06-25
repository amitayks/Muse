# render-worker Specification

## Purpose
TBD - created by archiving change split-render-worker. Update Purpose after archive.
## Requirements
### Requirement: Dedicated render Worker
The system SHALL provide a standalone Cloudflare Worker named `render-worker`, separate from the `content-bot` Worker, that performs all Satori (JSX→SVG) and resvg (SVG→PNG) image rendering. The bot Worker SHALL invoke it exclusively through a `RENDER` service binding, and `render-worker` SHALL NOT be part of the bot Worker's bundle.

#### Scenario: Rendering executes in render-worker
- **WHEN** the bot needs a tweet-card, thread, quote, or story image
- **THEN** it SHALL call `render-worker` through the `RENDER` service binding
- **AND** the Satori/resvg computation SHALL occur inside `render-worker`, not in the bot Worker

#### Scenario: render-worker cold-starts independently
- **WHEN** no image has been rendered and the conversational (Telegram text) path is exercised
- **THEN** the `render-worker` isolate need not start
- **AND** the bot Worker's cold start SHALL NOT load Satori, resvg, bidi-js, or their WASM

### Requirement: Render service RPC contract
`render-worker` SHALL expose a `WorkerEntrypoint`-based RPC service with methods that accept serializable render inputs and return PNG bytes: `renderTweetCard(data)` → `Uint8Array`, `renderThreadCards(tweets)` → `Uint8Array[]`, `renderQuoteTweetCard(data)` → `Uint8Array`, and `createStoryImage(cardPng)` → `Uint8Array`. Method names, inputs, and PNG outputs SHALL match the pre-split renderer so produced images are byte-equivalent.

#### Scenario: Render single tweet card over RPC
- **WHEN** `RENDER.renderTweetCard(data)` is invoked with tweet text, username, display name, and profile image
- **THEN** it SHALL return a 1080px-wide PNG identical in layout to the pre-split renderer

#### Scenario: Render thread returns multiple PNGs
- **WHEN** `RENDER.renderThreadCards(tweets)` is invoked with N tweets from the same author
- **THEN** it SHALL return an array of N PNGs with the same connecting-line styling (first/middle/last) as before the split

#### Scenario: Render quote card over RPC
- **WHEN** `RENDER.renderQuoteTweetCard(data)` is invoked for a repost draft
- **THEN** it SHALL return a PNG with the user commentary above the embedded original-tweet card

#### Scenario: Create story image over RPC
- **WHEN** `RENDER.createStoryImage(cardPng)` is invoked with a card PNG
- **THEN** it SHALL return a 9:16 PNG with the card centered on the treated background

### Requirement: Render worker bindings and asset ownership
`render-worker` SHALL own the rendering dependencies (`satori`, `@resvg/resvg-wasm`, `bidi-js`) and the WASM assets (`satori/yoga.wasm`, resvg `index_bg.wasm`). It SHALL bind the `content-bot-images` R2 bucket as `IMAGES` for font loading (`fonts/` keys) and for the Twemoji (`emoji/`) and profile-image (`profiles/`) caches (read+write). Its build SHALL replace `process.env.SATORI_STANDALONE` with `'1'` and `process.env.JEST_WORKER_ID` with `undefined`, and SHALL use `compatibility_date >= 2024-04-03` so service-binding RPC is supported.

#### Scenario: Fonts and caches available to renderer
- **WHEN** `render-worker` renders any card
- **THEN** it SHALL load fonts from R2 and read/write the Twemoji and profile-image caches in R2 via its `IMAGES` binding

#### Scenario: Satori build shims present
- **WHEN** `render-worker` is built
- **THEN** `process.env.SATORI_STANDALONE` and `process.env.JEST_WORKER_ID` SHALL be replaced at build time so Satori runs on the Workers runtime

### Requirement: Render worker is internal-only
`render-worker` SHALL be reachable only through the service binding and SHALL NOT expose a public route or `workers.dev` URL.

#### Scenario: No public HTTP surface
- **WHEN** `render-worker` is deployed
- **THEN** it SHALL register no public routes and have `workers.dev` disabled
- **AND** it SHALL be invokable only via the bot's `RENDER` service binding

### Requirement: Graceful handling when render service is unavailable
A failed `RENDER` call (service unavailable or render error) SHALL be contained to the image operation and SHALL NOT break the conversational path.

#### Scenario: Render failure does not break text flows
- **WHEN** a `RENDER` RPC call throws
- **THEN** the calling image or publish flow SHALL surface or handle the error as it did pre-split (e.g., the publish error path)
- **AND** unrelated Telegram text interactions SHALL continue to function

