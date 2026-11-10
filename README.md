# Risk Sentinel

**Prototipo di un sistema di early-warning per il rischio doganale indotto da eventi naturali e antropici sui nodi critici del commercio.**

> 🎓 Progetto di Dottorato di Ricerca in *Earth processes and management of resources and risks for a resilient society and territory*, **Università degli Studi di Bari "Aldo Moro"**, Dipartimento di Scienze della Terra e Geoambientali, in convenzione con **ADM – Agenzia delle Dogane e dei Monopoli**.
>
> In produzione su <https://risksentinel.opencyber.org> (accesso con utenza). Fork self-hosted di [WorldMonitor](https://github.com/koala73/worldmonitor), AGPL-3.0.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Questo README descrive il prototipo **com'è oggi**. Ciò che è progettato ma non ancora implementato è indicato come tale. Le istruzioni per chi sviluppa (agenti compresi) sono in [`AGENTS.md`](AGENTS.md) e [`CLAUDE.md`](CLAUDE.md); il modello della tesi e la sua corrispondenza con il codice sono in [`docs/thesis/`](docs/thesis/).

---

## Indice

- [L'idea in breve](#lidea-in-breve)
- [Il modello a sei strati](#il-modello-a-sei-strati)
- [Le applicazioni del portale](#le-applicazioni-del-portale)
- [Cosa esiste e cosa è progettato](#cosa-esiste-e-cosa-è-progettato)
- [Lo score v0 (provvisorio)](#lo-score-v0-provvisorio)
- [Fonti dati e licenze](#fonti-dati-e-licenze)
- [Modelli linguistici](#modelli-linguistici)
- [Architettura e stack](#architettura-e-stack)
- [Avvio rapido](#avvio-rapido)
- [Deploy e operazioni sulla VPS](#deploy-e-operazioni-sulla-vps)
- [Workflow n8n](#workflow-n8n)
- [Sincronizzazione con WorldMonitor](#sincronizzazione-con-worldmonitor)
- [Licenza e attribuzione](#licenza-e-attribuzione)

---

## L'idea in breve

Un terremoto, un'eruzione, una siccità o il blocco di uno stretto colpiscono un **nodo critico** (uno stretto marittimo, un porto, un'area produttiva). Ne nasce la scarsità di un **bene strategico**; attraverso la vulnerabilità di fornitura dell'Europa e una serie di modulatori (dazi, sanzioni, politiche dei paesi produttori), la scarsità si traduce in **rischio per i controlli doganali dell'UE**, prima che le merci arrivino. Risk Sentinel vuole anticipare questa catena.

È un dottorato in Scienze della Terra: la caratterizzazione geologica, sismica e vulcanica dei nodi è il cuore del progetto. La geopolitica entra come innesco solo quando interrompe un nodo, altrimenti come modulatore. Il sistema è pensato come complemento proattivo dei sistemi doganali di analisi dei rischi, non come loro sostituto.

## Il modello a sei strati

```
Innesco → Nodo critico → Bene strategico → Vulnerabilità di fornitura → Vulnerabilità doganale → Rischio doganale
              ▲ i modulatori agiscono sugli strati 2–5          ▲ i segnali attraversano tutti gli strati
```

| Strato | Cosa è | Esempi nel perimetro |
|---|---|---|
| Innesco | Evento datato, con un'area, che interrompe un nodo fisicamente o funzionalmente | Terremoti ed eruzioni (nucleo), alluvioni, siccità, cicloni; blocco di uno stretto, incidente, divieto di export improvviso |
| Nodo critico | Stretto, porto o hub, area produttiva | Suez, Bab el-Mandeb, Hormuz, Malacca, Taiwan, Panama, Gibilterra; Antofagasta (rame), Morowali e Weda Bay (nichel), Hsinchu e Tainan (chip) |
| Bene strategico | Bene identificato per codice HS e per criticità UE | 8542, 2709, 2711, 7502, 7403, 7601, 1001, 3105 |
| Vulnerabilità di fornitura | Dipendenza dall'import, concentrazione dei fornitori, sostituibilità | Metodo UE esistente (Reg. (UE) 2024/1252, CRMA; dipendenze strategiche della Commissione) |
| Vulnerabilità doganale | Degrado della funzione di controllo: capacità degli uffici, obsolescenza dei profili di rischio, incentivo alla falsa dichiarazione | Contributo originale della tesi |
| Rischio doganale | Allerta prima dell'arrivo: merci, origini, finestra temporale | — |

**Regola del modello**: senza un innesco che colpisca un nodo, o senza beni esposti, non c'è rischio indotto. Un **modulatore** è una condizione che dura e non interrompe nulla da sola (evento datato = innesco; condizione che dura = modulatore). I **segnali** (dati fisici misurati, traffico navale, notizie e OSINT, dati doganali) anticipano e confermano, ma non misurano mai il pericolo.

## Le applicazioni del portale

Il portale ospita più applicazioni; si sceglie con il selettore nell'intestazione o con `?app=<id>`.

| App | `?app=` | Contenuto |
|---|---|---|
| **Risk Sentinel** (predefinita) | `thesis` | Vista della tesi: Catena di rischio, Monitor inneschi, Pericoli dei nodi, Beni strategici, Risposta e scenari (proof of concept), mappa con i nodi critici; come contesto supply chain, clima, commodity, politica commerciale, sanzioni, GDELT come segnale, feed degli alert |
| **Full dashboard** | `customs` | Tutti i pannelli ereditati da WorldMonitor: contesto e segnali, non risultati della tesi |
| **OSINT** | `osint` | Notizie e intelligence da fonti aperte, raggruppate per tema |
| **Research** | `research` | Bibliografia della tesi (generata dal repository della tesi: metadati, strato del modello, livello di verifica), copertura della letteratura per strato, note di lettura, sedi e conferenze |
| **Policy** | `policy` | Registro normativo: misure UE usate come modulatori nel Cap. 3 e atti di contesto, ciascuno con stato di verifica |

## Cosa esiste e cosa è progettato

| Componente | Stato |
|---|---|
| Inneschi sismici in diretta: EMSC (USGS di riserva), ultimi 30 giorni, M ≥ 4,5 (`api/thesis/triggers.js`); eventi GDACS ed EONET | **Implementato** |
| Associazione evento → nodo: regola di lavoro provvisoria (raggio 300 km, evento significativo Mw ≥ 6) e regola del modello (nessun innesco → nessun rischio) in `src/services/thesis/risk-chain.ts` | **Implementato** (regola provvisoria) |
| Registro di nodi, beni e fatti con fonte: `src/config/thesis-model.ts` | **Implementato** |
| Risposta e scenari: suggerimenti amministrativi solo dietro la regola del modello; dazi e misure di difesa commerciale solo come direzione dell'incentivo | **Proof of concept** |
| Regola basata sull'intensità prevista sul nodo | Proposta, PR #12 (non unita) |
| Caratterizzazione statistica del pericolo dei nodi (completezza dei cataloghi, declustering, zone) | Ramo `cap3-hazard-characterisation`, PR #11 (non unita); su `main` solo `research/hazard-stats/analisi_pericoli_nodi.py` |
| Estrazioni Comext, PortWatch, TARIC | Ramo `thesis-data-extract` |
| Score doganale v0 a 8 dimensioni | Nel codice, **provvisorio** (vedi sotto); il workflow n8n 01 che lo calcola non è attivo nell'istanza n8n |
| Regola di corroborazione, knowledge graph, componenti LLM vincolati, pipeline in 7 fasi | **Progettati, non implementati** |
| Pilota in shadow-mode presso l'Ufficio delle Dogane di Bari | Anno 3 |

Gli scenari storici su cui il motore sarà provato nell'Anno 2 sono Ever Given/Suez 2021, terremoto di Hualien 2024, siccità di Panama 2023-24 e Mar Rosso 2023-24 (scenario di controllo).

## Lo score v0 (provvisorio)

`src/services/customs-risk-scoring.ts` contiene uno score a 8 dimensioni raggruppate in quattro componenti (Hazard, Exposure, Vulnerability, Evidence). Le dimensioni si assegnano con parole chiave sui titoli delle notizie GDELT e con tabelle fisse per rotte e merci.

- **I pesi (0,18 · 0,10 · 0,18 · 0,14 · 0,12 · 0,10 · 0,12 · 0,06) e le costanti** (per esempio Suez 0,95, HS 8542 = 0,95) vengono da bozze iniziali assistite da LLM e **non hanno giustificazione**: non sono un risultato e non sono "ancorati alla letteratura". La letteratura giustifica la struttura pericolo-esposizione-vulnerabilità, non i numeri.
- **Limite strutturale**: una somma pesata dà uno score positivo anche con pericolo nullo, in contrasto con la regola del modello.
- **Piano dell'Anno 2**: confronto tra un riferimento a pesi uniformi, una formulazione con soglia sul pericolo (F1) e una moltiplicativa (F2), con analisi di sensibilità globale sugli scenari storici. Eventuali pesi saranno un risultato della tesi.

## Fonti dati e licenze

Si preferisce la fonte scientifica di riferimento, possibilmente europea o internazionale; USGS resta come controllo incrociato.

| Ambito | Fonti usate nel portale |
|---|---|
| Sismica e vulcanica | EMSC, USGS; cataloghi ISC-GEM e INGV per le analisi della tesi (ISC-GEM: CC-BY-SA 3.0) |
| Altri pericoli naturali | GDACS, NASA EONET, Open-Meteo, NASA FIRMS |
| Conflitti (segnale o modulatore) | UCDP (token in `.env`) |
| Commercio e traffico | IMF PortWatch (solo aggregati), UN Comtrade, AIS; Eurostat Comext e TARIC per le schede dei beni, con valori estratti fuori linea (ramo `thesis-data-extract`) |
| Normativa | EUR-Lex |
| Notizie (segnale) | GDELT, feed RSS curati |

- **ACLED è escluso** in ogni forma: la sua licenza vieta l'uso con sistemi di IA/ML/LLM, anche accademico, e nell'ottobre 2026 ACLED ha rifiutato l'accesso al progetto.
- **EM-DAT** vieta la ridistribuzione dei record: nel portale pubblico compaiono solo aggregati.
- **Nessun dato interno ADM**, nessuna dichiarazione reale e nessun dato personale entra in questo repository. Un'eventuale istanza ADM (Anno 3) userà lo stesso motore con connettori interni, su server ADM.

## Modelli linguistici

Nella vista della tesi **nessun pannello usa un LLM**: il nucleo del modello è fatto di dati strutturati e regole, e un LLM non misura mai il pericolo. Gli LLM servono la dashboard ereditata, le notifiche e alcuni testi di contesto (sintesi delle notizie, brief).

- I modelli si scelgono in un solo punto, `scripts/_llm-models.mjs`, tramite OpenRouter: livello **veloce** `anthropic/claude-haiku-5.5` (classificazione, estrazione, testi brevi) e livello **qualità** `mistralai/mistral-large-4-0` (sintesi narrative, digest, brief, secondo giudice).
- Tutti gli usi sono **solo testo**.
- Gli usi di mercato ereditati (analisi titoli, market implications, sintesi AI del brief di mercato) sono **spenti**.
- La catena dei provider è `ollama → openrouter → generic`; Groq non è più usato.

## Architettura e stack

```
EMSC · USGS · GDACS · EONET · UCDP · GDELT · Comext · …
        │  seeder (scripts/seed-*.mjs, cron sulla VPS)      workflow n8n (automata.opencyber.org)
        ▼                                                        │ POST /api/n8n/ingest
      Redis  ◄──────────────────────────────────────────────────┘
        │
        ▼
  API Node self-hosted (local-api-server.mjs) ── servita da nginx nel container
        │
        ▼
  SPA TypeScript (Vite, Preact, deck.gl, globe.gl)
```

| Livello | Tecnologie |
|---|---|
| Frontend | TypeScript, Vite, Preact; mappe deck.gl + MapLibre GL e globe.gl |
| API | Node (`src-tauri/sidecar/local-api-server.mjs`) dietro nginx, contratti Protocol Buffers (sebuf) |
| Dati | Redis con proxy REST compatibile Upstash (`redis-rest`) |
| Orchestrazione | Seeder Node schedulati via cron; n8n per ingestion, monitor normativo e notifiche |
| Deploy | Docker Compose su VPS Contabo, dietro `jwilder/nginx-proxy` + acme-companion |
| Test | `node:test` (via `tsx`), Playwright |

## Avvio rapido

**Stack completo (Docker Compose)**

```bash
git clone https://github.com/gstorelli/worldmonitor.git && cd worldmonitor
cp .env.example .env      # REDIS_PASSWORD e REDIS_TOKEN: openssl rand -hex 32
docker compose up -d --build
```

Servizi: `worldmonitor` (nginx + API Node + watchdog), `redis`, `redis-rest`, `ais-relay`. L'autenticazione è attiva per impostazione predefinita (`AUTH_REQUIRED=true`): il primo amministratore si crea con `POST /api/auth/bootstrap` usando il bearer `N8N_INGEST_SECRET`, gli altri utenti da Impostazioni → Admin o con `scripts/create-user.sh`.

**Sviluppo locale**

```bash
npm ci          # Node 24 (.nvmrc)
npm run dev     # senza Redis e seed molti pannelli restano vuoti: è previsto
```

Controlli principali: `npm run typecheck`, `npm run typecheck:api`, `npm run lint`, e i test mirati con `npx tsx --test tests/<file>`.

## Deploy e operazioni sulla VPS

- **Ogni push su `main` ripubblica la produzione** (`.github/workflows/deploy.yml`: SSH, `git pull --ff-only`, `docker compose up -d --build`, controllo di salute su `/api/version`). Si lavora su un ramo, si apre una PR e si unisce solo dopo revisione.
- **Il `.env` reale vive solo sulla VPS** e non va mai nel repository; `.env.example` documenta le chiavi.
- **Watchdog**: dentro il container, `docker/api-watchdog.sh` interroga `/api/sidecar-health?deep=1` ogni 30 secondi e riavvia l'API dopo 3 fallimenti consecutivi. Introdotto dopo il fermo del 12-13/10/2026.
- **Popolamento dei dati**: i seeder girano in container usa-e-getta sulla rete interna (`scripts/seed-all.sh`), schedulati dal crontab della VPS per livelli (`scripts/seed-cron.sh`):

  | Livello | Contenuto | Cadenza |
  |---|---|---|
  | `quotes` | quotazioni e commodity | 20 minuti |
  | `intel` | sintesi delle notizie → previsioni → correlazioni | ogni ora |
  | `signals` | GDELT, segnali incrociati, chokepoint, cambi | ogni ora |
  | `thesis` | inneschi della vista tesi: terremoti, GDACS/EONET, anomalie climatiche | ogni ora |
  | `context` | pannelli di contesto della vista tesi (politica commerciale, shipping) | 6 ore |
  | `slow` | sanzioni e UCDP | 6 ore |
  | `full` | tutto il resto | settimanale |

  Un rebuild non ripopola Redis. Il riepilogo di ogni giro va nei log di `~/riskseed-logs/`; l'output completo di ogni seeder va in `/tmp/seed-all.*.log` sulla VPS.
- **Diagnostica**: `docker compose ps`, `docker logs --tail 100 worldmonitor`, `/api/health` (stato di ogni dataset), `/api/version`.

## Workflow n8n

I JSON sono in [`n8n-workflows/`](n8n-workflows/) e si importano a mano nell'istanza n8n (dettagli nel [README della cartella](n8n-workflows/README.md)). Le pipeline scrivono solo su chiavi dedicate `risk_sentinel:n8n:*` e su `policy:monitor:v1`, mai sulle chiavi dei seeder.

| # | Workflow | Note |
|---|---|---|
| 01 | GDELT customs ingestion | Calcola lo score v0; **non presente** nell'istanza n8n |
| 02 | USGS seismic | Attivo; non alimenta lo scoring |
| 03 | Climate anomalies (Open-Meteo) | Attivo; non alimenta lo scoring |
| 04 | Commodity prices | Attivo; non alimenta lo scoring |
| 06 | Policy monitor (EUR-Lex) | Alimenta l'app Policy |
| 07 | Intelligence notifications | Consegna i digest via Telegram ed email |
| 10 | UN Comtrade concentration materializer | Concentrazione dei fornitori; stato nell'istanza da verificare |
| 05, 08, 09 | Legacy | Disattivati (05 è ACLED, escluso) |

## Sincronizzazione con WorldMonitor

Risk Sentinel diverge molto dall'originale: tolti Convex, Dodo Payments e Clerk (restano stub in `src/services/`), aggiunte l'autenticazione self-hosted, le app e la vista della tesi. Dall'upstream si adottano correzioni e miglioramenti di backend e infrastruttura; non si sovrascrivono mai l'ingestion n8n, le app del fork, la vista della tesi e la configurazione dei modelli.

```bash
git remote add upstream https://github.com/koala73/worldmonitor.git   # una volta
git fetch upstream && git merge upstream/main     # su un ramo, poi PR
npm run typecheck:all && npm run test:sidecar
```

## Licenza e attribuzione

Risk Sentinel è un fork di [WorldMonitor](https://github.com/koala73/worldmonitor) di **Elie Habib**, distribuito sotto **AGPL-3.0**; il fork ne conserva licenza e attribuzione (v. [LICENSE](LICENSE)). È sviluppato per ricerca accademica e uso non commerciale.

Mappe: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, © [OpenFreeMap](https://openfreemap.org), basemap [Protomaps](https://protomaps.com). Ogni fonte dati resta soggetta alla propria licenza (vedi [Fonti dati e licenze](#fonti-dati-e-licenze) e [`docs/data-sources.mdx`](docs/data-sources.mdx)).

---

<p align="center">
  <strong>Risk Sentinel</strong> — Dottorato di Ricerca<br>
  Università degli Studi di Bari "Aldo Moro" · ADM — Agenzia delle Dogane e dei Monopoli
</p>
