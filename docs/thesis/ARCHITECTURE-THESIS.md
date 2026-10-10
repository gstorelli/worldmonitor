# Risk Sentinel — thesis architecture

Status as of 8 October 2026 (commit `7679177`). This document maps the thesis model
onto the code that exists today and onto what still has to be built. It is the
technical reference for Chapter 4 of the thesis. Engineering details live in
`AGENTS.md` and `ARCHITECTURE.md`; research rules live in `CLAUDE.md`.

The **response** element (future outlook) sits after layer 6: administrative responses
(risk profiles, attention notes, EU risk-information sharing) are part of the thesis
outlook and of the shadow-mode log of the Bari pilot; tariff measures are outside the
customs mandate and enter only as scenarios on modulators and as policy implications.

Legend: **Implemented** = in the code and running. **Collected, not linked** = data
is ingested and stored, but the customs score does not use it. **Designed** =
specified, not implemented. **To build** = not started.

## 1. Layers → code

| Layer | What it needs | What exists today | Status |
|---|---|---|---|
| 1. Trigger | Measured events with intensity, area, duration, frequency | USGS M4.5+ feed (`seismology:earthquakes:v1`, n8n 02); GDACS + NASA EONET + NOAA (`natural:events:v1`); Open-Meteo anomalies (n8n 03); UCDP conflict events (`scripts/seed-ucdp-events.mjs`; ACLED is excluded by its licence); century statistics (ISC-GEM, GVP) shown in the *Critical node hazards* panel (`src/config/node-hazards.ts`), reproducible with `research/hazard-stats/` | Collected, not linked to the score |
| 2. Critical node | Registry of chokepoints, ports, production areas with coordinates and geology | `src/config/chokepoint-registry.ts`, `server/_shared/chokepoint-registry.ts`; PortWatch chokepoints and ports (`portwatch:chokepoints:ref:v1`, `supply_chain:portwatch:v1`, `supply_chain:portwatch-ports:v1:*`, `portwatch:disruptions:active:v1`) | Chokepoints and ports: implemented (inherited from WorldMonitor). Production areas: to build |
| 3. Strategic good | HS/CN codes at detailed level, EU criticality | `data/hs-commodity-map.json`; HS4 list in `scripts/seed-comtrade-bilateral-hs4.mjs`; HS2 exposure (`supply-chain:exposure:*`) | Partially implemented (HS4 level, no CRMA criticality) |
| 4. Supply vulnerability | Import dependence, supplier concentration, substitutability | Single-supplier share from UN Comtrade (`api/customs/comtrade.js`, `comtrade:bilateral-hs4:<ISO2>:v1`) with arbitrary thresholds 0.45/0.60/0.75 | Partially implemented; needs HHI / CRMA method and documented thresholds |
| 5. Customs vulnerability | Indicators for capacity, profile obsolescence, misdeclaration incentive | None in the open instance | To build (public indicators, §3) |
| 6. Customs risk | Hazard-gated combination, alert with goods/origins/window | `src/services/customs-risk-scoring.ts` (weighted sum of 8 keyword-based dimensions, mirrored in n8n 01 and `src-tauri/sidecar/services/scoring.ts`) | Implemented as a provisional v0; does not comply with the model rule (positive score with zero hazard) |
| Modulators | Tariffs, trade defence, sanctions, export bans | Policy monitor (EUR-Lex, n8n 06, `policy:monitor:v1`); trade-policy panels inherited from WorldMonitor | Partially implemented (news-level, not measure-level) |
| Signals | News/OSINT, vessel traffic, physical feeds | GDELT (n8n 01), UCDP, AIS relay, intelligence feeds, PortWatch | Implemented |
| Response (outlook) | What an administration could do with an alert: administrative responses inside the customs mandate; tariff and trade-defence changes as "what if" scenarios on modulators | *Response outlook (PoC)* panel (`response-outlook`): registry `src/config/thesis-response.ts`, pure logic `src/services/thesis/response.ts` (gate rule; incentive direction per misdeclaration channel, no magnitudes) | Proof of concept, not validated; never applied to controls |

## 2. The current scoring engine (v0) and its known limits

`RiskScore = Σ wᵢ · dᵢ` over 8 dimensions, each on 0–100, alert bands ≥85/70/50/25.

What the code does (n8n workflow 01, every 2 h, on GDELT article titles):

- event severity, escalation and customs relevance are **keyword classes** on the title;
- trade exposure is a **count of trade words**;
- route criticality and commodity sensitivity are **fixed constants** looked up by keyword;
- source confidence is a **list of nine outlets** (85) versus everything else (50);
- geophysical impact is 70 if the title contains a hazard word, 5 otherwise.

Known limits, to be stated in Chapter 4:

1. **No measured physical data** enters the score.
2. **Zero-hazard floor**: an article with no hazard word still scores > 0 because
   source confidence (≥ 50), escalation (≥ 15) and the other floors are summed.
3. **Keyword aliasing**: "red sea" and "bab el mandeb" map to *Suez*; "taiwan" alone
   maps to *Taiwan Strait*.
4. **Parity is partial**: `tests/customs-risk-scoring-parity.test.mjs` locks weights
   and bands across the three copies, not the extraction rules, so the same input can
   score differently in n8n and in the sidecar.
5. **Constants without justification**: weights, route/commodity values, keyword
   classes, Comtrade thresholds.

## 3. Standard indicators (one engine, two instances)

The engine consumes indicators, never raw sources. Each indicator has a single
definition and two resolutions.

| Indicator | Layer | Open instance (public) | ADM instance (Year 3) |
|---|---|---|---|
| Trigger intensity at node | 1–2 | Catalogue/feed event within the node zone (Mw, depth, VEI, GDACS level) | same |
| Node disruption | 2 | PortWatch transits/port calls vs baseline | same |
| Supplier concentration (HHI) | 4 | Comext CN8 × partner × month, per member state | AIDA declarations, per office |
| Origin shift | 5 (profiles) | Change in partner shares for the same CN8 after the trigger | same, per office × day |
| Unit-value anomaly | 5 (incentive) | Value/quantity vs historical series, per CN8 × partner | per declaration line |
| Mirror gap | 5 (incentive) | EU imports from X vs X's exports to the EU (Comtrade) | — |
| Sudden third origins | 5 (incentive) | Fast growth of a new partner for the same CN8 | same |
| Port volume pressure | 5 (capacity) | Port statistics (e.g. AdSP), PortWatch port calls | office workload |

Public anomalies indicate **pressure, not fraud**.

## 4. Instances

- **Risk Sentinel Open** — this repository and `risksentinel.opencyber.org`. Open data
  only. Reproducible. All thesis results.
- **Risk Sentinel ADM** — same engine plus ADM connectors on ADM servers. Not started;
  waits for Year 3 and a formal agreement with ADM. Never developed in this repository
  with real data.
- `sentinel-adm` (legal intelligence and watchlist radar) is a **different product**,
  not the ADM instance of the thesis; it has been moved out of this repository.

## 5. Data sources (thesis choices)

Earthquakes, century statistics: ISC-GEM v12.1 (doi:10.31905/D808B825). Real time:
EMSC, INGV; USGS as cross-check (already ingested). Volcanoes: Smithsonian GVP.
Impacts: EM-DAT (aggregates only). Multi-hazard alerts: GDACS (already ingested),
Copernicus EMS. Trade: Eurostat Comext, ISTAT; UN Comtrade for mirror data (already
ingested at HS4). Criticality: Reg. (EU) 2024/1252 (CRMA), JRC RMIS. Vessel traffic:
IMF PortWatch (already ingested).
