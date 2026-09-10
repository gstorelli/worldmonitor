# AGENTS.md

Agent entry point for **Risk Sentinel**, a self-hosted fork of
[WorldMonitor](https://github.com/koala73/worldmonitor). Read this first: the
fork diverges substantially from upstream, so upstream docs (and older
snapshots of this file) can be wrong.

## What This Project Is

AI early-warning dashboard for **customs risk mitigation**. TypeScript SPA
(Vite + Preact), a self-hosted Node API (`local-api-server.mjs` behind nginx),
plus a Tauri desktop sidecar. It aggregates geopolitics, military, markets,
commodities, climate, cyber, maritime, aviation, customs, and policy data.

- **Production**: `https://risksentinel.opencyber.org` — a single Docker
  Compose stack on a Contabo VPS (nginx reverse proxy + `worldmonitor`,
  `redis`, `redis-rest`, `ais-relay`).
- **This is a fork, not upstream WorldMonitor**: the de-clouding pass removed
  Convex, Dodo Payments, and Clerk from the runtime (stubs remain in
  `src/services/`). `ALLOW_ANONYMOUS_API=true` is the intended self-hosted mode.
- **n8n** (`automata.opencyber.org`) runs the ingestion/scoring/notification
  workflows and pushes results into Redis via `/api/n8n/ingest`.

## Production Deployment (read before pushing)

```
git push origin main
        │
        ▼
.github/workflows/deploy.yml  (GitHub Actions)
        │  appleboy/ssh-action, port 56969
        ▼
Contabo VPS  $DEPLOY_PATH
  git pull --ff-only origin main
  docker compose up -d --build
  docker image prune -f
        │
        ▼
health gate (/api/version) → public check
https://risksentinel.opencyber.org/api/version
```

- **Every push to `main` rebuilds production.** Work on a branch, open a PR,
  merge only when green and explicitly approved. Never push directly to `main`
  for experimental work.
- The real `.env` lives **only on the VPS** at `$DEPLOY_PATH/.env`. It is
  gitignored and the deploy script never touches it. `.env.example` documents
  the keys; the local `.env` (if present) is ignored local state.
- GitHub Actions secrets (`SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`,
  `DEPLOY_PATH`, `SERVER_PORT`) are deploy credentials only — never app keys.
- Seeding is **manual/one-shot** on the server (`scripts/seed-all.sh` over the
  internal Docker network). A rebuild does not re-seed; empty Redis surfaces as
  `/api/health` criticals.

## Repository Map

```
src/                    # Browser SPA (TypeScript, class-based components)
  app/                  # Orchestration: data-loader, refresh-scheduler, panel-layout
  components/           # ~143 top-level component files (Panel subclasses)
  config/panels.ts      # Single panel registry (the variant system is collapsed to "full")
  config/panel-tiers.ts # Fork 3-tier selector: CORE / CONTESTO / DISABLED
  services/             # Business logic (incl. customs-risk-scoring.ts, threat-classifier.ts)
  utils/circuit-breaker.ts
  generated/            # Proto-generated client/server stubs (DO NOT EDIT)
api/                    # Edge Functions (plain JS/TS, self-contained) + fork endpoints
  _*.js                 # Shared same-dir helpers (CORS, rate-limit, API key)
  n8n/ingest.js         # n8n ingest (fail-closed Bearer auth)
  notify/config.js      # Notification config (redacted GET, merging POST)
  notify/digest.js      # Delivery-ready digest
  customs/*             # Read dedicated n8n keys
  policy/registry.js    # reads policy:monitor:v1
server/                 # Shared server code bundled into gateways at deploy time
  gateway.ts            # Domain gateway factory (CORS, auth, cache tiers, ETag)
  _shared/redis.ts      # cachedFetchJson + stampede protection
  worldmonitor/<domain>/# RPC handlers matching proto services
proto/worldmonitor/     # Protobuf/sebuf service definitions (make generate)
src-tauri/sidecar/      # Node sidecar (local-api-server.mjs) + SQLite/ONNX path
scripts/                # ~168 seeders, build/guard helpers
tests/                  # node:test suites (tsx --test)
e2e/                    # Playwright specs
n8n-workflows/          # 7 active + 2 legacy workflow JSONs (imported manually)
docker/                 # nginx/supervisord/redis-rest config for the self-hosted stack
docs/solutions/         # Documented solutions (YAML frontmatter: module, tags, problem_type)
```

## How to Run

```bash
npm ci                    # Deterministic install (also builds blog-site). Node 24 (.nvmrc).
npm run dev               # Vite dev server (VITE_VARIANT is collapsed to "full")
npm run typecheck         # tsc --noEmit (src)
npm run typecheck:api     # tsc --noEmit (api/server/scripts/generated)
npm run test:data         # node:test suites (should stay green for changed files)
npm run test:sidecar      # sidecar + API handler tests
npm run lint              # biome
npm run lint:boundaries   # dependency-direction guard
npm run lint:safe-html    # OPT-IN ONLY: see "Pre-Push" (fork baseline fails this)
```

- Docker is required to run the real production stack locally; `npm run dev`
  alone degrades gracefully without Redis/seeds.
- Node 24 is expected (`.nvmrc`). Node 25 works for typecheck/tests but is not
  the CI target.

## Runtime Knobs (fork defaults)

- **LLM chain**: `ollama → openrouter → groq → generic` (`server/_shared/llm.ts`).
  OpenRouter is tried first with `deepseek/deepseek-v4-flash`; **Groq is optional**
  (free fallback). A 429 usually means the OpenRouter free-tier quota, not a config
  error; add a Groq key to absorb it. `LLM_TOOL_PROVIDER`/`LLM_REASONING_PROVIDER`
  override the per-profile default provider.
- **Notify auth**: anonymous `GET /api/notify/config` is redacted; changing a stored
  delivery credential (`chatId`/`to`/`botToken`/`smtpUrl`) requires the
  `N8N_INGEST_SECRET` bearer. The settings UI keeps that token in `localStorage`
  (`rs-notify-admin-token`).
- **Ingest auth**: `/api/n8n/ingest` fails closed (503) without `N8N_INGEST_SECRET`;
  local opt-out is `ALLOW_ANONYMOUS_N8N_INGEST=true` (never in production).
- **Seeding**: one-shot on the VPS via `scripts/seed-all.sh` (compose `internal-net`);
  a rebuild does not re-seed. Missing API keys make individual seeders skip/fail.
- **Download CTA removed**: the fork has no desktop distribution, so the header
  download button/dropdown is gone. Do not re-add it without a real release channel.
- **Panel tiers**: `src/config/panel-tiers.ts` DISABLED (tier 3) includes the upstream
  PRO finance surfaces (`stock-analysis`, `stock-backtest`, `wsb-ticker-scanner`).
- **User auth (Phase 1)**: `AUTH_REQUIRED=true` makes the self-hosted server enforce an
  `rs_session` HttpOnly cookie on every `/api/*` except `auth/login|me|logout`,
  `sidecar-health`, `service-status`, `version`, `health`. Users/roles live in Redis
  (`rs:users`, managed with `scripts/create-user.sh`); PBKDF2 password hashes; sessions
  are stateless HMAC (`WM_SESSION_SECRET`) with 7-day TTL. Machine callers (n8n) may
  present `N8N_INGEST_SECRET` as a bearer instead. The SPA gate lives in
  `src/services/user-auth.ts` and is a no-op when `AUTH_REQUIRED` is false.
- **User prefs & panel policy (Phase 2)**: `GET/PUT /api/prefs/panels` stores per-user
  panel settings (`rs:user:<id>:panel-prefs`); `GET/PUT /api/panel-policy` stores a
  global admin deny-list (`rs:panel-policy`, admin-only writes). Precedence:
  **policy > user prefs > defaults**. The SPA hydrates prefs at boot and pushes on save
  (`src/services/user-panel-prefs.ts`, `src/services/panel-policy.ts`); admins get an
  "Admin" tab in UnifiedSettings (`src/services/admin-panel-policy.ts`).
- **Multi-app (Phase 3)**: `src/config/apps.ts` is an app registry layered ON TOP of the
  collapsed variant system (do not revive upstream variants — build-time meta/favicon
  machinery is inert here). `?app=<id>` (persisted in localStorage) selects an app; an
  app is a panel allowlist + default-enabled set. `customs` = unrestricted (current
  dashboard), `osint` = curated OSINT workspace. The header switcher links apps; panels
  outside the active app's allowlist are filtered in layout and settings.

## Runtime Architecture

Three runtimes share one source tree:

1. **Vercel Edge / self-hosted Node** — `api/**/*.ts` RPC gateways
   (`api/<domain>/v1/[rpc].ts`) and legacy `api/*.js`. Edge entries are
   self-contained: they cannot import from `../src/` or `../server/`; only
   same-directory `_*.js` helpers. Enforced by `tests/edge-functions.test.mjs`
   and `scripts/check-edge-function-bundles.mjs`.
2. **Self-hosted Node API** — `src-tauri/sidecar/local-api-server.mjs`, spawned
   by Docker; nginx serves the SPA and proxies `/api/*` to it, injecting a local
   token. `server/` code is bundled into the gateway here.
3. **Tauri desktop sidecar** — same local server in `desktop-sidecar` mode.

Key mechanisms:

- `server/gateway.ts` pipeline: CORS → auth → entitlement → rate-limit →
  cache tiers → JMESPath → ETag/304 → telemetry.
- `cachedFetchJson()` coalesces concurrent misses; cache tiers fast (5m),
  medium (10m), slow (30m), static (2h), daily (24h). Include request-varying
  params in the cache key.
- Proto flow: `proto/` → `buf generate` (`make generate`) →
  `src/generated/{client,server}/`. GET fields need `(sebuf.http.query)`;
  `repeated string` needs `parseStringArray()`; `int64` maps to `string`.

## n8n Integration (fork-critical)

Active workflows live in `n8n-workflows/` and are imported manually into n8n.

- **Ingest** (`api/n8n/ingest.js`): `POST` with `Authorization: Bearer
  <N8N_INGEST_SECRET>`. Auth **fails closed** — if the secret is unset the
  endpoint returns 503 unless `ALLOW_ANONYMOUS_N8N_INGEST=true`. Workflows
  01–06 use the shared n8n credential `Risk Sentinel Ingest Bearer`.
- Pipelines write **dedicated keys** `risk_sentinel:n8n:<resource>` (gdelt,
  usgs, openmeteo, commodities, acled); the sole canonical exception is
  `policy:monitor:v1`. Contract: `tests/n8n-workflows-contract.test.mjs`.
- **Notify** (`api/notify/config.js`): anonymous `GET` is **redacted** (no
  botToken/smtpUrl/chatId/to, but `enabled`/`connected` kept); the n8n workflow
  authenticates with the same Bearer to receive the full config. `POST` merges
  into the stored config so a redacted round-trip never wipes credentials.
- Workflow 07 ("intelligence notifications") reads config + digest and delivers
  Telegram/email. After changing its JSON you must re-import it in n8n.

## Customs Risk Scoring (fork-critical)

The canonical 8-dimension model is **`src/services/customs-risk-scoring.ts`**:

```
RiskScore = 0.18·eventSeverity + 0.10·sourceConfidence + 0.18·tradeExposure
          + 0.14·routeCriticality + 0.12·commoditySensitivity + 0.10·escalationMomentum
          + 0.12·customsRelevance + 0.06·geophysicalImpact
```

`tests/customs-risk-scoring-parity.test.mjs` locks the canonical weights, the
n8n workflow 01 code node, and the sidecar `scoring.ts` together. **Never edit
one copy of the formula without the others** — extend the parity test instead.

## Environment Rules

- Never commit or print secrets. `.env*` are ignored local state; `.env.example`
  is the only tracked env file (its Convex/Dodo/Clerk sections are legacy).
- Seed credentials load only via `loadEnvFile()` (inert under tests, resolves the
  checkout root, `only:` narrows keys). Never hand-roll a `.env` reader.
- Redis seeders MUST write `seed-meta:<key>` for the health monitor.
- New data sources need bootstrap hydration in `api/bootstrap.js`, unless
  nothing in `src/` renders them (then register in `api/health.js`
  `STANDALONE_KEYS`). `tests/bootstrap.test.mjs` enforces the converse.

## Key Patterns

- **New panel**: extend `Panel` in `src/components/`, register in
  `src/config/panels.ts`, classify in `src/config/panel-tiers.ts`, wire loading
  in `src/app/data-loader.ts`.
- **New endpoint**: define proto → `make generate` → handler in
  `server/worldmonitor/<domain>/` → gateway, using `cachedFetchJson()`. Edge
  `api/*.js` must stay self-contained.
- **Circuit breakers**: `src/utils/circuit-breaker.ts`, one per data domain.
- **Notification settings UI**: `src/services/risk-notify-settings.ts` relies on
  the server `connected` flags because GET is redacted.

## Testing and Validation

- **Unit/integration**: `tests/*.test.{mjs,mts}` via `tsx --test` (`test:data`).
- **API/sidecar**: `npm run test:sidecar`.
- **DOM**: `npm run test:dom` — **known broken upstream baseline** (specs
  reference components removed during de-clouding, plus Vitest/Node
  `localStorage` friction). Only runs in the pre-push DOM partition.
- **E2E**: `e2e/*.spec.ts` (Playwright).
- Run targeted tests, not the whole 900+ suite, while iterating.

## CI and Pre-Push

CI: `.github/workflows/` — `typecheck.yml`, `lint-code.yml`, `lint.yml`
(markdown), `proto-check.yml`, `security-audit.yml`, `feed-validation.yml`,
`build-desktop.yml`, `docker-publish.yml`, `test.yml`, `deploy.yml`.

Pre-push (`.husky/pre-push`) runs state guards, then diff-scoped checks:

- Unicode safety, boundaries, Sentry coverage, **rate-limit policies**,
  **premium-fetch parity**, edge esbuild bundle, typechecks, change-scoped tests.
- **Safe HTML sink check is DEFERRED**: `scripts/enforce-safe-html.mjs` targets
  a newer upstream baseline (~149 `Panel.setContent`/innerHTML sinks here), so
  it is runnable but NOT wired into `lint`/pre-push. See the comment in
  `.husky/pre-push`.
- `scripts/` uses a fixed TypeScript via `tsx`; heavy checks (`test:data`,
  typechecks, edge-bundle) must run **sequentially** or they OOM (exit 137).
- On Windows, pre-push requires Git Bash; the `tests/prepush-changed-tests`
  assertions spawn `bash`/`.bin/tsx` and fail without it.

## Critical Conventions

- `fetch.bind(globalThis)` is BANNED. Use `(...args) => globalThis.fetch(...args)`.
- Edge Functions cannot use `node:http`, `node:https`, `node:zlib`.
- Always include a `User-Agent` header in server-side fetches.
- Yahoo Finance requests must be staggered (150ms delays).
- Prefer minimal, targeted diffs; run `npm run typecheck` and the relevant
  `tsx --test` files before finishing.
- **Merge authority is explicit**: never merge a PR or enable auto-merge unless
  the user asked for that specific action in the current conversation.

## External References

- [Architecture (system reference)](ARCHITECTURE.md)
- [Contributing guide](CONTRIBUTING.md)
- [Data sources catalog](docs/data-sources.mdx)
- [Health endpoints](docs/health-endpoints.mdx)
- [Adding endpoints guide](docs/adding-endpoints.mdx)
- [API reference (OpenAPI)](docs/api/)
- Upstream project: https://github.com/koala73/worldmonitor
