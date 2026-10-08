# Piano di allineamento della piattaforma al modello della tesi

*8 ottobre 2026 · riferito al commit `7679177` di `gstorelli/worldmonitor`*

Questo piano porta il codice di Risk Sentinel dal motore attuale (v0: parole chiave su GDELT) al modello a sei strati della tesi. Le fasi vanno eseguite in ordine. Ogni fase è un **branch separato con una pull request**: ogni push su `main` ricostruisce la produzione (vedi `AGENTS.md`), quindi niente lavoro sperimentale direttamente su `main`.

**Stato all'8 ottobre 2026.** Fatte nella PR `thesis/phase-0-alignment`: la Fase 0 completa; i punti 1 e 2 della Fase 1 (Bab el-Mandeb autonomo, "taiwan" da solo non attiva più lo stretto, con test comportamentale); un pannello *Pericoli dei nodi critici* con i dati ISC-GEM e GVP (anticipa parte delle Fasi 2 e 7). Resta della Fase 1 il test di parità comportamentale tra n8n e sidecar.

Le fasi 0 e 1 sono pulizia e non cambiano il comportamento della piattaforma. Dalla fase 2 in poi si aggiungono capacità nuove, sempre *accanto* al motore v0, che resta visibile finché la validazione dell'Anno 2 non dice altro.

---

## Fase 0 — Igiene della documentazione (subito, basso rischio)

**Perché.** README, AGENTS.md e i commenti nel codice presentano come "specifica PhD" o "canonici" i pesi e le costanti nati da chat con LLM. Contengono anche cifre senza fonte. La repo è pubblica e la commissione può leggerla.

**Cosa fare**

1. Aggiungere `CLAUDE.md` nella radice e la cartella `docs/thesis/` (fatto in questa PR).
2. `README.md`:
   - tabella "Rotte Marittime Strategiche": togliere le cifre senza fonte ("12% commercio mondiale", "20% petrolio mondiale", "90% chip avanzati", "25% merci marittime") o sostituirle con cifre citate (Verschuur et al. 2025, IMF PortWatch);
   - aggiungere Bab el-Mandeb come rotta autonoma;
   - tabella dei deliverable: D2 "Progettazione del Risk Scoring Engine a 8 dimensioni — Completato" diventa "Motore v0 provvisorio implementato; modello a sei strati in costruzione"; D5 "precisione/recall su GDELT + ACLED" diventa "validazione retrospettiva su 4 scenari storici (Anno 2)";
   - sostituire "pesi PhD" con "pesi provvisori (v0)".
3. `AGENTS.md`, sezione *Customs Risk Scoring*: "canonical 8-dimension model" diventa "provisional v0 model (weights not validated; see CLAUDE.md)". La regola tecnica di parità resta.
4. `src/services/customs-risk-scoring.ts` (righe 2 e 58), `src/services/CustomsRiskScorer.ts` (riga 20), `tests/customs-risk-scoring-parity.test.mjs` (riga 94), il codice e le note del nodo di scoring in `n8n-workflows/01-gdelt-customs-ingestion.json`: "PhD spec" e "canonical" diventano "provisional v0 weights, not validated".
5. `n8n-workflows/README.md` (riga 65) e `README.md` (riga 116): stessa correzione ("specifica PhD", "pesi PhD" diventano "provvisorio, v0").

**Nota.** Secondo il commento in `CustomsRiskScorer.ts`, la repo aveva in origine un modello a **pesi uniformi** (0,125 × 8), poi sostituito perché "contraddiceva la specifica PhD". È proprio il riferimento neutro previsto per l'Anno 2: nella Fase 4 torna come baseline, insieme a F1 e F2.

**Criterio di accettazione.** `grep -rn "PhD spec\|pesi PhD\|specifica PhD" --include=*.{md,ts,mjs,js,json}` non restituisce più risultati fuori da `docs/thesis/`; i test restano verdi.

## Fase 1 — Correzioni del motore v0 senza cambiarne la natura

1. **Bab el-Mandeb come nodo autonomo**: separarlo da Suez nel workflow n8n 01 (`ROUTE_KEYWORDS`) e aggiungere la zona nel workflow 02 (`CRITICAL_TRADE_ZONES`). Estendere `tests/customs-risk-scoring-parity.test.mjs` e `tests/n8n-workflows-contract.test.mjs`. Dopo il merge, i JSON vanno reimportati in n8n e **pubblicati** (vedi AGENTS.md, sezione n8n MCP).
2. **"taiwan" da solo** non deve attivare lo Stretto di Taiwan: richiedere "strait" o una co-occorrenza con termini marittimi.
3. **Test di parità comportamentale**: aggiungere casi in cui lo stesso articolo viene valutato dalla copia n8n e dal sidecar, e il punteggio deve coincidere. Oggi si confrontano solo pesi e soglie.

**Criterio di accettazione.** Nuovi test verdi; nessun cambio di pesi.

## Fase 2 — Registro dei nodi critici

1. Un unico registro (`shared/` o `src/config/`) con stretti, porti e **aree produttive**: Antofagasta (rame), Morowali e Weda Bay (nichel), Hsinchu e Tainan (chip). Per ogni nodo:
   - coordinate del punto di riferimento;
   - tipo e beni strategici collegati (CN8);
   - limite di placca più vicino (Bird 2003);
   - campo `hazardZone`, oggi un raggio di 300 km, in futuro un poligono su base geologica.
2. Il registro alimenta i workflow 02 e 03 e le analisi offline, così che le coordinate siano le stesse ovunque.

**Criterio di accettazione.** Test che verifica che n8n 02, il motore e lo script di analisi leggano gli stessi nodi.

## Fase 3 — Lo strato dell'innesco da dati misurati

1. Un modulo `trigger-events` che, per ogni nodo, legge i feed già raccolti:
   - `seismology:earthquakes:v1` (USGS);
   - `natural:events:v1` (GDACS, EONET);
   - anomalie di Open-Meteo;
   e produce eventi normalizzati con le stesse grandezze per tutti gli inneschi: tipo, intensità, distanza, profondità, area, inizio, durata stimata e fonte.
2. Aggiungere **EMSC** come fonte europea in tempo reale, con USGS come controllo incrociato.
3. Vulcani: un feed sull'attività settimanale [VERIFY – verificare il feed ufficiale del Weekly Volcanic Activity Report di Smithsonian/USGS] e livelli GDACS.
4. GDELT resta, ma etichettato come **segnale**: non entra nel campo "intensità".

**Criterio di accettazione.** Per un terremoto di prova vicino a un nodo, il modulo restituisce un evento con tutte le grandezze compilate; per un articolo GDELT senza evento fisico, nessun innesco.

## Fase 4 — Motore v1 in parallelo (non visibile come risultato)

1. Calcolare **in parallelo** al v0, senza mostrarle nella UI come punteggio ufficiale, tre formulazioni:
   - **baseline a pesi uniformi**;
   - **F1 hazard-gated**: rischio nullo se non c'è innesco sul nodo;
   - **F2 moltiplicativa**: pericolo × esposizione × vulnerabilità.
2. Salvare input e output con data, per la validazione dell'Anno 2.
3. Test obbligatorio: **pericolo nullo implica rischio nullo per F1 e F2** (la regola del modello).

**Criterio di accettazione.** Il test sulla regola del modello è verde; il v0 è invariato.

## Fase 5 — Indicatori pubblici di vulnerabilità (Comext)

1. Ingestione di **Eurostat Comext** per i codici CN8 del perimetro (import UE e Italia, per paese partner e mese). Comext ha un'API e file bulk [VERIFY – endpoint e limiti].
2. Calcolo degli indicatori standard di `ARCHITECTURE-THESIS.md` §3:
   - HHI dei fornitori;
   - spostamento delle origini;
   - valori unitari;
   - origini terze improvvise;
   - divario speculare (con Comtrade).
3. In `api/customs/comtrade.js` le soglie 0,45/0,60/0,75 vanno sostituite da HHI con soglie documentate, oppure dalla sola misura senza soglie finché non saranno validate.
4. Per ogni bene, aggiungere la criticità UE (CRMA, allegati I e II) come dato statico con fonte.

**Criterio di accettazione.** Gli indicatori sono ricalcolabili da file pubblici e coperti da test su dati di esempio sintetici, dichiarati come tali.

## Fase 6 — Banco di prova retrospettivo "as-of"

1. Uno script che ricostruisce gli input disponibili a una data (*as-of*) e fa girare v0, baseline, F1 e F2.
2. Quattro scenari: Ever Given/Suez 2021, Hualien 2024, siccità di Panama 2023-24, Mar Rosso 2023-24 (scenario di controllo).
3. Output: la finestra di anticipo tra l'innesco e il movimento degli indicatori pubblici, per ogni formulazione.
4. Gli esiti vanno nella tesi, non nella UI.

## Fase 7 — Analisi offline dei pericoli nella repo

1. Cartella `research/hazard-stats/` con lo script `analisi_pericoli_nodi.py` (già prodotto) e un README che spiega dove scaricare i file di ISC-GEM, GVP ed EM-DAT.
2. **Non committare i dati EM-DAT**, perché la licenza lo vieta. ISC-GEM è CC-BY-SA, ma il file è grande: meglio lasciarlo fuori e documentare lo scaricamento.
3. Aggiungere declustering (es. Gardner-Knopoff [VERIFY – riferimento]) e stima della magnitudo di completezza.

---

## Come usare Claude Code

1. Copia `CLAUDE.md` e `docs/thesis/` nella repo, su un branch (`git switch -c thesis/alignment-docs`), apri una PR e fai il merge dopo averla letta. Da quel momento ogni sessione di Claude Code parte già con il contesto della tesi.
2. Una fase per volta, una sessione per fase. Prompt di esempio:

   > Leggi CLAUDE.md e docs/thesis/ALIGNMENT-PLAN.md. Esegui la Fase 0 su un nuovo branch `thesis/phase-0`. Non toccare la logica di calcolo. Alla fine mostra il diff, lancia i test pertinenti e apri una PR senza fare il merge.

3. Kilo Code e DeepSeek possono continuare a lavorare sulla repo: `CLAUDE.md` e `AGENTS.md` valgono come riferimento comune per tutti gli agenti.

## Da decidere (Giuseppe)

- **`sentinel-adm/`**: deciso l'8 ottobre, spostato fuori dalla repo (branch `archive/sentinel-adm`, PR dedicata).
- **Password della piattaforma**: cambiarla, perché è passata in chat.
