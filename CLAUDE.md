# CLAUDE.md

@AGENTS.md

The file above is the engineering entry point (runtime, deploy, n8n, tests). This
file adds the **research context**: Risk Sentinel is the prototype of a PhD thesis,
and every change to the scoring, the data sources or the documentation must stay
consistent with the thesis model described here. When AGENTS.md and this file
disagree on research matters (model, weights, data sources, claims), this file wins;
on engineering matters, AGENTS.md wins.

Full model and module mapping: `docs/thesis/ARCHITECTURE-THESIS.md`.
Work plan for aligning the code: `docs/thesis/ALIGNMENT-PLAN.md`.

## The thesis in one sentence

Risk Sentinel anticipates how a **trigger** (first of all an earthquake or a volcanic
eruption) that hits a **critical node** (maritime chokepoint, port or hub, production
area) creates scarcity of a **strategic good**, and how — through Europe's **supply
vulnerability** and a set of **modulators** — this becomes a **risk for EU customs
controls**, before the goods arrive. PhD in Earth Sciences (UniBA, Dept. of Earth and
Geoenvironmental Sciences), in agreement with ADM (Italian Customs and Monopolies
Agency).

## The six-layer model

```
Trigger → Critical node → Strategic good → Supply vulnerability → Customs vulnerability → Customs risk
            ▲ modulators act on layers 2–5          ▲ signals cut across all layers
```

- **Trigger**: an event with a date and an area that interrupts a node, physically or
  functionally. All triggers use the same descriptors (intensity, area, duration,
  frequency). Core: earthquakes and eruptions (deepest analysis). Others: floods,
  droughts, cyclones; anthropic: physical blockade, accident, sudden export ban.
- **Critical node**: chokepoints, ports/hubs, production areas.
- **Strategic good**: identified by detailed HS/CN code and by EU criticality.
- **Supply vulnerability** (bridge): import dependence, supplier concentration,
  substitutability. Uses the existing EU method (Reg. (EU) 2024/1252, CRMA).
- **Customs vulnerability** (original contribution): office capacity, obsolescence
  of risk profiles, incentive to misdeclare.
- **Customs risk**: an alert before arrival (goods, origins, time window).
- **Modulator**: a lasting condition that does not interrupt anything by itself
  (tariffs, anti-dumping, sanctions, producer-country policy, geopolitical context).
  Rule: *dated event = trigger; lasting condition = modulator.*
- **Signals**: measured physical data, vessel traffic, news/OSINT, customs data. They
  anticipate and corroborate; **they never measure the hazard**.

**Rule of the model**: no trigger hitting a node, or no exposed goods → no induced
risk. Any formula that yields a positive score with zero hazard is non-compliant.

## Non-negotiable rules for agents

1. **Weights are provisional, not results.** The 8 weights in
   `src/services/customs-risk-scoring.ts` (0.18, 0.10, 0.18, 0.14, 0.12, 0.10, 0.12,
   0.06) came from early LLM-assisted drafts and have no justification. Do not call
   them "canonical", "PhD spec" or "validated" in new code, comments or docs. The
   same applies to the route/commodity constants (Suez 0.95, HS 8542 = 0.95, keyword
   classes 100/75/50/25) and to the Comtrade concentration thresholds (0.45/0.60/0.75).
   Year 2 compares a uniform-weights baseline with F1 (hazard-gated) and F2
   (multiplicative) via Global Sensitivity Analysis; weights, if any, will be a result.
2. **No invented numbers.** No market shares, percentages, accuracy, precision/recall
   or F1 values without a source in the repo or a real measurement. Use
   `[SOURCE NEEDED – …]` or `[SPERIMENTAZIONE ANNO 2 – …]` placeholders instead.
3. **Describe what exists in the present tense, and only that.** Corroboration rule,
   knowledge graph, constrained LLM components and the 7-stage pipeline are designed,
   not implemented.
4. **GDELT is a signal, not a hazard measure.** Do not extend keyword scoring as a
   proxy for physical intensity. Physical triggers must come from measured catalogues
   and feeds.
5. **One engine, two instances.** *Risk Sentinel Open* (this repository, public)
   uses only open data and is where thesis results live. *Risk Sentinel ADM* (ADM
   servers, Year 3, after formal agreement) adds connectors to internal data. No ADM
   internal data, no real declarations, no personal data in this repository — ever.
   The engine consumes **standard indicators** that can be computed at two resolutions
   (public: member state × month × CN8; ADM: office × day × declaration).
6. **Pilot = Customs Office of Bari only** (shadow mode, Year 3). Never add Genoa or
   Malpensa, not even as examples.
7. **Data sources**: prefer the scientific reference source, ideally European or
   international (ISC-GEM, EMSC, INGV, GDACS, Copernicus, EM-DAT, Eurostat Comext,
   ISTAT); keep USGS as cross-check or where it is the recognised state of the art.
   Respect licences: ISC-GEM is CC-BY-SA 3.0; EM-DAT forbids redistributing records —
   only aggregates may appear in the public instance. ACLED is excluded: its EULA forbids
   any use with AI/ML/LLM systems, so it cannot feed Risk Sentinel; conflict events come
   from UCDP (licence terms to be verified before citing them in the thesis).
8. **Bab el-Mandeb is its own node**, not an alias of Suez.
9. `sentinel-adm` is a separate product, not part of the thesis; it has been moved
   out of this repository (branch `archive/sentinel-adm`). Do not reintroduce it.

## Language

Code, comments, commit messages and agent docs: English. User-facing UI strings and
`README.md`: Italian (current convention). Thesis chapters are written elsewhere.
