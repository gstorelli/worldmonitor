# SENTINEL-ADM

Tactical OSINT, Early Warning and Legal Intelligence platform for the Italian
Customs and Monopolies Agency (ADM) — Inter-Regional Directorate for Puglia,
Molise and Basilicata.

This is a **separate platform** from the Risk Sentinel dashboard: its own
Python services, its own containers, its own data. It runs on-premise with no
GPU requirement and no software licensing fees.

## What is implemented today

| Subsystem | Status | Where |
| --- | --- | --- |
| A · Edge privacy masking (CF, P.IVA, IBAN, targhe, email, telefoni, indirizzi, nomi contestuali) | **Implemented + tested** | `app/privacy/sanitizer.py` |
| A · Abstracted inference gateway (OpenAI-compatible, JSON-schema enforced, mask → infer → restore) | **Implemented + tested** | `app/llm/adapter.py` |
| B · Dynamic legal engine (URN:LEX, Normattiva, EUR-Lex CELEX, alias TULD/TUA/D.Lgs 74/2000/L. 401/89/CP/TULPS) | **Implemented + tested** | `app/legal/` |
| E · Local sanctions screening (Yente REST client, flash threshold) | **Implemented + tested** | `app/sanctions/yente_client.py` |
| C · Ripple-effect matching (normalised token-sort Levenshtein, grey-zone review, severity scoring) | **Implemented + tested** | `app/radar/fuzzy.py` |
| F · Forensic vault (WARC + SHA-256 sidecar + manifest + RFC 3161 sealing via OpenSSL) | **Implemented + tested** | `app/forensics/evidence.py` |
| G · Notification dispatch (flash + "Il Mattinale Antifrode", webhook/Telegram/Apprise) | **Implemented + tested** | `app/notify/dispatch.py` |
| H · Operator workbench (5 workspaces) + full HTTP surface | **Implemented** (services tested; Streamlit shell) | `app/api/`, `app/ui/dashboard.py` |
| C · News harvesting (RSS 2.0 / Atom, dedupe, failure isolation) | **Implemented + tested** | `app/radar/harvester.py` |
| C · Entity extraction (zero-shot via gateway + deterministic offline fallback) | **Implemented + tested** | `app/radar/extraction.py` |
| C · Contagion pipeline (watchlist store, ripple alerts, digest, flash policy) | **Implemented + tested** | `app/radar/pipeline.py`, `app/radar/watchlist.py` |
| D · Maigret / Holehe wrappers (validated argv, job specs, parsers, toolbox container) | **Implemented + tested** | `app/osint/wrappers.py`, `osint-toolbox/` |
| D · Institutional registry dorking (PVP, OpenCoesione, BDAP, ANAC, Gazzetta) | **Implemented + tested** | `app/osint/dorking.py` |
| F · ArchiveBox capture → vault import → RFC 3161 sealing | **Implemented + tested** | `app/forensics/archivebox.py` |
| All · End-to-end acceptance scenario (offline, enforced in CI) | **Implemented** | `scripts/acceptance.py` |
| Ops · Production front-ends (jwilder/nginx-proxy profile, standalone Caddy TLS), resource limits, bootstrap, verified backup, Yente refresh, cron example | **Implemented** | `docker-compose.yml`, `deploy/`, `scripts/*.sh` |
| D · Telegram / marketplace ingestion | **Staged** | planned (`app/osint/marketplaces.py`) |

The deterministic engines are **stdlib-only**: they run and are tested without
FastAPI, Streamlit, Yente or ArchiveBox installed.

## Architecture

```
FastAPI core (app/api/main.py)
  ├── privacy/sanitizer.py     deterministic masking (session dictionary, no persistence)
  ├── llm/adapter.py           OpenAI-compatible client, JSON-schema enforcement
  ├── legal/acts.py + urnlex.py canonical acts → URN:LEX → Normattiva / EUR-Lex
  ├── sanctions/yente_client.py local Yente engine (OpenSanctions data)
  ├── radar/fuzzy.py           fuzzy watchlist matching + ripple severity
  ├── forensics/evidence.py    WARC vault, SHA-256 sidecar, RFC 3161 TSA
  └── notify/dispatch.py       flash alerts + daily brief
Streamlit workbench (app/ui/dashboard.py) — 5 workspaces over the API
Yente container (OpenSanctions) — local screening, never external
ArchiveBox container — ISO 28500 WARC capture into the shared volume
```

## HTTP surface

All handlers are thin wrappers over `app/api/services.py` (which is unit
tested): the logic is reachable from the UI, from scripts and from tests.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | config snapshot + Yente/evidence reachability |
| POST | `/privacy/mask`, `/privacy/unmask` | session-scoped masking round trip |
| POST | `/legal/qualify` · GET `/legal/catalog` | legal qualification + canonical acts |
| GET | `/radar/feeds` · POST `/radar/scan` | configured feeds; harvest → extract → contagion alerts |
| GET/POST/DELETE | `/watchlist` | local watchlist management |
| POST | `/sanctions/screen` | Yente screening |
| POST | `/osint/dorks` · POST `/osint/job` | registry dorks; reconnaissance job specs (never executed by the API) |
| GET | `/evidence` · `/evidence/{id}/verify` | evidence list + integrity check |
| POST | `/evidence/capture` · `/evidence/import` · `/evidence/seal/{id}` | ArchiveBox capture, WARC import, RFC 3161 sealing |

## Quick start (development)

```bash
cd sentinel-adm
cp .env.example .env          # set LLM_BASE_URL / LLM_API_KEY and thresholds
docker compose up -d --build
# API      http://127.0.0.1:8080/health
# UI       http://127.0.0.1:8501
# Yente    http://127.0.0.1:8000/healthz
```

Published ports bind to `127.0.0.1` by default; widen `SENTINEL_BIND_IP` only on
a trusted development LAN.

## Production deployment

Target: a dedicated host (recommended, so the OpenSanctions index and the
ArchiveBox images cannot starve the Risk Sentinel stack). No GPU; plan ~4-8 GB
RAM and 40-80 GB disk.

```bash
git clone <repo> /srv/sentinel-adm && cd /srv/sentinel-adm/sentinel-adm
# Choose the front-end mode: jwilder (shared nginx-proxy) or prod (own TLS).
SENTINEL_BASIC_AUTH_PASSWORD='...' ./scripts/bootstrap.sh jwilder
./scripts/yente-update.sh                                   # OpenSanctions data (multi-GB, first run)
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
./scripts/yente-update.sh           # dataset refresh (schedule it)
# deploy/crontab.example            # ready-made daily cron entries
```

**Pre-go-live checklist**

- [ ] `LLM_BASE_URL` / `LLM_API_KEY` set (a dedicated OpenRouter key is
      recommended so spend is attributable per platform).
- [ ] Basic-auth credentials distributed to the operators; TLS verified.
- [ ] `yente update` completed and `docker compose exec yente yente status` healthy.
- [ ] Real watchlist loaded in `data/watchlist/watchlist.json`.
- [ ] First `backup.sh` run and its `.sha256` verified.
- [ ] Retention/authorisation policy for evidence and dossiers agreed (GDPR);
      point `TSA_URL` at a qualified TSA for judicial use.
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
| Local operational autonomy | Yente, ArchiveBox and the evidence vault run on-prem; external connectivity is only needed for news scraping and inference |
| Forensic admissibility | Every capture has a `capture.warc`, a SHA-256 sidecar and a manifest; `verify()` recomputes the digest and detects tampering; RFC 3161 sealing stores the `.tsq`/`.tsr` pair |
| Clean execution | `docker compose up -d` with healthchecks on API, Yente and ArchiveBox |

## Milestones

1. **Foundation** — compose stack, volumes, config models (done).
2. **Security, LegalTech, Sanctions core** — sanitizer, inference adapter, URN:LEX, Yente client (done).
3. **News radar & contagion** — harvester, entity extraction (model + offline fallback), watchlist store, ripple alerts (done); Telegram/marketplace ingestion (staged).
4. **OSINT & forensic vault** — vault, hashing, TSA, Maigret/Holehe wrappers, dorking, ArchiveBox import (done); live capture triggering from the UI (staged).
5. **Notifications & UI** — dispatcher, HTTP surface and acceptance scenario (done); the Streamlit workbench is wired to the new endpoints and expanded as the services grow.

## Operational notes

- **Secrets stay out of git**: `.env` is ignored; only `.env.example` is tracked.
- **TSA**: `TSA_URL` defaults to a public RFC 3161 provider; point it to a
  qualified TSA for judicial use. If `openssl` is unavailable the seal is
  recorded as `unavailable` and the vault stays verifiable by hash.
- **Yente data**: run `docker compose exec yente yente update` (or the bundled
  cron) to refresh OpenSanctions datasets.
- **ArchiveBox**: captures land in the shared `archivebox-data` volume; the
  vault imports them with `EvidenceVault.import_warc()`.
