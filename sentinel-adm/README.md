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
| H · Operator workbench (5 workspaces: radar, legal, OSINT, screening, vault) | **Scaffold (functional UI shell)** | `app/api/main.py`, `app/ui/dashboard.py` |
| C · News harvesting (institutional RSS / press rooms) | **Staged** | planned (`app/radar/harvester.py`) |
| D · Maigret / Holehe / marketplace wrappers | **Staged** | executed by dedicated containers, console prepares jobs |
| — · ArchiveBox page acquisition into the shared volume | **Wired via compose** | `docker-compose.yml` |

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

## Quick start

```bash
cd sentinel-adm
cp .env.example .env          # set LLM_BASE_URL / LLM_API_KEY and thresholds
docker compose up -d --build
# API      http://localhost:8080/health
# UI       http://localhost:8501
# Yente    http://localhost:8000/healthz
```

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
3. **News radar & contagion** — fuzzy matcher and severity scoring (done); asynchronous harvester and zero-shot extraction (staged).
4. **OSINT & forensic vault** — vault, hashing, TSA (done); Maigret/Holehe wrappers and archival trigger (staged).
5. **Notifications & UI** — dispatcher (done); full workbench integration and end-to-end acceptance script (in progress).

## Operational notes

- **Secrets stay out of git**: `.env` is ignored; only `.env.example` is tracked.
- **TSA**: `TSA_URL` defaults to a public RFC 3161 provider; point it to a
  qualified TSA for judicial use. If `openssl` is unavailable the seal is
  recorded as `unavailable` and the vault stays verifiable by hash.
- **Yente data**: run `docker compose exec yente yente update` (or the bundled
  cron) to refresh OpenSanctions datasets.
- **ArchiveBox**: captures land in the shared `archivebox-data` volume; the
  vault imports them with `EvidenceVault.import_warc()`.
