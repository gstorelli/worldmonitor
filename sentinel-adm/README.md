# SENTINEL-ADM

Early Warning and Legal Intelligence platform for the Italian Customs and
Monopolies Agency (ADM) — Inter-Regional Directorate for Puglia, Molise and
Basilicata.

This is a **separate platform** from the Risk Sentinel dashboard: its own
Python services, its own containers, its own data. It runs on-premise with no
GPU requirement and no software licensing fees.

## What is implemented today

| Subsystem | Status | Where |
| --- | --- | --- |
| A · Edge privacy masking (CF, P.IVA, IBAN, targhe, email, telefoni, indirizzi, nomi contestuali) | **Implemented + tested** | `app/privacy/sanitizer.py` |
| A · Abstracted inference gateway (OpenAI-compatible, JSON-schema enforced, mask → infer → restore) | **Implemented + tested** | `app/llm/adapter.py` |
| B · Dynamic legal engine (URN:LEX, Normattiva, EUR-Lex CELEX, alias TULD/TUA/D.Lgs 74/2000/L. 401/89/CP/TULPS) | **Implemented + tested** | `app/legal/` |
| C · Ripple-effect matching (normalised token-sort Levenshtein, grey-zone review, severity scoring) | **Implemented + tested** | `app/radar/fuzzy.py` |
| G · Notification dispatch (flash + "Il Mattinale Antifrode", webhook/Telegram/Apprise) | **Implemented + tested** | `app/notify/dispatch.py` |
| H · Operator workbench (2 workspaces) + HTTP surface | **Implemented** (services tested; Streamlit shell) | `app/api/`, `app/ui/dashboard.py` |
| C · News harvesting (RSS 2.0 / Atom, dedupe, failure isolation) | **Implemented + tested** | `app/radar/harvester.py` |
| C · Entity extraction (zero-shot via gateway + deterministic offline fallback) | **Implemented + tested** | `app/radar/extraction.py` |
| C · Contagion pipeline (watchlist store, ripple alerts, digest, flash policy) | **Implemented + tested** | `app/radar/pipeline.py`, `app/radar/watchlist.py` |
| All · End-to-end acceptance scenario (offline, enforced in CI) | **Implemented** | `scripts/acceptance.py` |
| Ops · Production front-ends (jwilder/nginx-proxy profile, standalone Caddy TLS), resource limits, bootstrap, verified backup, cron example | **Implemented** | `docker-compose.yml`, `deploy/`, `scripts/*.sh` |

The deterministic engines are **stdlib-only**: they run and are tested without
FastAPI or Streamlit installed.

## Architecture

```
FastAPI core (app/api/main.py)
  ├── privacy/sanitizer.py     deterministic masking (session dictionary, no persistence)
  ├── llm/adapter.py           OpenAI-compatible client, JSON-schema enforcement
  ├── legal/acts.py + urnlex.py canonical acts → URN:LEX → Normattiva / EUR-Lex
  ├── radar/fuzzy.py           fuzzy watchlist matching + ripple severity
  ├── radar/harvester.py       RSS/Atom ingestion
  ├── radar/extraction.py      entity extraction (model + offline fallback)
  └── notify/dispatch.py       flash alerts + daily brief
Streamlit workbench (app/ui/dashboard.py) — 2 workspaces over the API
```

## HTTP surface

All handlers are thin wrappers over `app/api/services.py` (which is unit
tested): the logic is reachable from the UI, from scripts and from tests.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | config snapshot |
| POST | `/privacy/mask`, `/privacy/unmask` | session-scoped masking round trip |
| POST | `/legal/qualify` · GET `/legal/catalog` | legal qualification + canonical acts |
| GET | `/radar/feeds` · POST `/radar/scan` | configured feeds; harvest → extract → contagion alerts |
| GET/POST/DELETE | `/watchlist` | local watchlist management |

## Quick start (development)

```bash
cd sentinel-adm
cp .env.example .env          # set LLM_BASE_URL / LLM_API_KEY and thresholds
docker compose up -d --build
# API      http://127.0.0.1:8080/health
# UI       http://127.0.0.1:8501
```

Published ports bind to `127.0.0.1` by default; widen `SENTINEL_BIND_IP` only on
a trusted development LAN.

## Production deployment

Target: a small dedicated host is enough — the platform is two Python
containers (API + Streamlit workbench) plus the reverse proxy; plan ~1-2 GB RAM
and a few GB of disk. No screening index or archiving service is required.

```bash
git clone <repo> /srv/sentinel-adm && cd /srv/sentinel-adm/sentinel-adm
# Choose the front-end mode: jwilder (shared nginx-proxy) or prod (own TLS).
SENTINEL_BASIC_AUTH_PASSWORD='...' ./scripts/bootstrap.sh jwilder
```

What `bootstrap.sh` does, idempotently: creates `.env` from the template,
generates the Caddy basic-auth hash into it (mandatory for both production
profiles), creates the external `nginx-proxy` network in jwilder mode, seeds
`data/watchlist/watchlist.json` from the example, starts the selected profile
and waits for `/health`.

**Front-end modes** — basic auth is enforced in every mode and the API is never
published directly:

| Scenario | Command | Settings |
| --- | --- | --- |
| Behind jwilder/nginx-proxy (same pattern as worldmonitor) | `bootstrap.sh jwilder` | `SENTINEL_VIRTUAL_HOST`, `LETSENCRYPT_EMAIL`; external `nginx-proxy` network (created once) |
| Standalone, public domain (ACME TLS) | `bootstrap.sh prod` | `SENTINEL_DOMAIN`, `SENTINEL_ACME_EMAIL`, `SENTINEL_CADDYFILE=Caddyfile` |
| Standalone, internal/LAN (local CA) | `bootstrap.sh prod` | `SENTINEL_CADDYFILE=Caddyfile.internal`; install the CA on clients (`docker compose --profile prod cp proxy:/data/caddy/pki/authorities/local/root.crt ./sentinel-adm-ca.crt`) |

In jwilder mode only `sentinel-router` joins the external network and declares
`VIRTUAL_HOST` / `VIRTUAL_PORT=80` / `LETSENCRYPT_HOST` / `LETSENCRYPT_EMAIL`:
TLS and the certificate are handled by nginx-proxy + acme-companion, while the
router applies basic auth and splits `/api/*` (API) from `/` (workbench). The
`prod` and `jwilder` profiles are alternatives — never run both.

The workbench is served at `/` and the API under `/api/*` (e.g.
`curl https://<domain>/api/health`), both authenticated.

**Operations**

```bash
./scripts/backup.sh                 # tar.gz + SHA-256 sidecar + retention (default 14)
BACKUP_DIR=/var/backups/sentinel-adm BACKUP_RETENTION=30 ./scripts/backup.sh
# deploy/crontab.example            # ready-made daily cron entries
```

**Pre-go-live checklist**

- [ ] `LLM_BASE_URL` / `LLM_API_KEY` set (a dedicated OpenRouter key is
      recommended so spend is attributable per platform).
- [ ] Basic-auth credentials distributed to the operators; TLS verified.
- [ ] Real watchlist loaded in `data/watchlist/watchlist.json`.
- [ ] First `backup.sh` run and its `.sha256` verified.
- [ ] `docker compose --profile prod ps` shows every service healthy.

## Tests

No third-party dependency is required:

```bash
cd sentinel-adm
python -m unittest discover -s tests -t . -v
```

CI runs the same command on every push touching `sentinel-adm/`
(`.github/workflows/sentinel-adm-ci.yml`), one job per test module so failures
are localised. When a module fails, the full output is published to the
`ci-diagnostics` branch (`sentinel-adm/.ci/last-failure.log`) because Actions
logs require authentication — that file is readable from outside the runner.

## Acceptance criteria mapping

| Criterion | How it is met |
| --- | --- |
| Isolation & zero leakage | `SanitizedInference` masks before the call and restores only locally; `PrivacyMasker` is session-scoped and never persisted |
| Normative precision | URN/URL generation is deterministic; acts with unverified metadata return *needs review* instead of a link (`tle` today) |
| Local operational autonomy | Every deterministic engine runs on-prem in the two containers; external connectivity is only needed for news scraping and inference |
| Clean execution | `docker compose up -d` with healthchecks on the API |

## Milestones

1. **Foundation** — compose stack, volumes, config models (done).
2. **Security & LegalTech core** — sanitizer, inference adapter, URN:LEX (done).
3. **News radar & contagion** — harvester, entity extraction (model + offline fallback), watchlist store, ripple alerts (done).
4. **Notifications & UI** — dispatcher, HTTP surface and acceptance scenario (done); the Streamlit workbench is wired to the new endpoints and expanded as the services grow.

## Operational notes

- **Secrets stay out of git**: `.env` is ignored; only `.env.example` is tracked.
- **State**: the only persistent state is `data/watchlist/watchlist.json`
  (bind-mounted into the API container); the verified backup covers it.
- **Notifications**: flash policy and the daily brief are dispatched through
  `app/notify/dispatch.py` (webhook, Telegram, SMTP via Apprise).
