# Risk Sentinel

**Sistema di early-warning multimodale per la mitigazione dei rischi doganali, alimentato da AI e OSINT.**

> 🎓 Progetto di Dottorato di Ricerca — **Università degli Studi di Bari "Aldo Moro"**
> in collaborazione con **ADM – Agenzia delle Dogane e dei Monopoli**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![n8n](https://img.shields.io/badge/n8n-EA4B71?style=flat&logo=n8n&logoColor=white)](https://n8n.io/)

---

## Indice

- [Cos'è Risk Sentinel](#cosè-risk-sentinel)
- [Contesto Accademico](#contesto-accademico)
- [Architettura del Sistema](#architettura-del-sistema)
- [Risk Scoring Engine (8 Dimensioni)](#risk-scoring-engine-8-dimensioni)
- [Sorgenti Dati](#sorgenti-dati)
- [Pipeline n8n (Low-Code Data Ingestion)](#pipeline-n8n-low-code-data-ingestion)
- [Rotte Critiche e Commodity Monitorate](#rotte-critiche-e-commodity-monitorate)
- [Stack Tecnologico](#stack-tecnologico)
- [Quick Start](#quick-start)
- [Configurazione Variabili d'Ambiente](#configurazione-variabili-dambiente)
- [Deployment di Produzione (Contabo VPS)](#deployment-di-produzione-contabo-vps)
- [Self-Hosting Operations (stato operativo)](#self-hosting-operations-contabo-vps--stato-operativo)
- [Sincronizzazione con il repository upstream (koala73/worldmonitor)](#sincronizzazione-con-il-repository-upstream-koala73worldmonitor)
- [Struttura Repository](#struttura-repository)
- [Pannelli Disponibili](#pannelli-disponibili)
- [Roadmap e Next Steps](#roadmap-e-next-steps)
- [Riferimenti Bibliografici](#riferimenti-bibliografici)
- [Licenza e Attribuzione](#licenza-e-attribuzione)

---

## Cos'è Risk Sentinel

Risk Sentinel è un **sistema di situational awareness in tempo reale** progettato per monitorare, classificare e quantificare i rischi che incidono sulle operazioni doganali e sulle catene di approvvigionamento globali.

Il sistema integra **30+ sorgenti OSINT** (Open Source Intelligence) — tra cui dati geopolitici, sismici, climatici, di conflitto armato e di mercato — e li elabora attraverso un **motore di scoring a 8 dimensioni** per generare alert spiegabili e azionabili.

### Caratteristiche Principali

- 🌍 **Mappa globale duale** — Globe 3D (globe.gl + Three.js) e mappa 2D (deck.gl + MapLibre GL) con 45+ layer sovrapposti
- 🧠 **AI-Powered Synthesis** — Generazione narrativa spiegabile tramite LLM (OpenRouter)
- 📊 **86 pannelli informativi** — moduli componibili per geopolitica, finanza, climate, intelligence
- 🔄 **Pipeline n8n** — 5 workflow low-code per data ingestion con risk scoring integrato
- 🚢 **Critical Trade Routes Monitor** — monitoraggio real-time di Suez, Hormuz, Panama, Taiwan, Malacca, Gibilterra
- 📦 **Commodity Risk Tracker** — tracking prezzi e volatilità con codici HS doganali (8542, 7502, 2709, 1001, 3105)
- ⚡ **Cross-source correlation** — convergenza segnali militari, economici, climatici e infrastrutturali
- 🌐 **21 lingue** — supporto multilingua con feed nativi e layout RTL

---

## Contesto Accademico

### Il Problema

Le operazioni doganali sono sempre più esposte a rischi sistemici interconnessi: conflitti armati che bloccano rotte marittime (Houthi nel Mar Rosso), sanzioni economiche che alterano i flussi commerciali, eventi climatici estremi che distruggono raccolti e infrastrutture, e volatilità dei prezzi delle materie prime che impatta direttamente sui dazi e sulle classificazioni tariffarie.

Le Dogane necessitano di un sistema che:

1. **Anticipi** le disruption prima che impattino sui flussi commerciali
2. **Quantifichi** il rischio in modo trasparente e spiegabile
3. **Correli** eventi apparentemente scollegati (es. terremoto + chiusura porto + scarsità commodity)
4. **Supporti** le decisioni operative con alert azionabili

### La Soluzione

Risk Sentinel risponde a queste esigenze con un approccio **multimodale e multi-sorgente**, combinando:

- **Data Fusion**: aggregazione automatica di eventi geopolitici (GDELT), conflitti armati (ACLED), dati sismici (USGS), anomalie climatiche (Open-Meteo), e prezzi commodity (Yahoo Finance/Alpha Vantage)
- **Explainable Scoring**: algoritmo a 8 dimensioni con pesi calibrati e decomposizione trasparente del punteggio
- **Low-Code Orchestration**: pipeline n8n per rendere trasparente, visiva e riproducibile l'intera catena di elaborazione dati
- **Visual Intelligence**: interfaccia geo-spaziale che traduce i dati grezzi in consapevolezza situazionale

### Deliverable Accademici

| # | Deliverable | Stato |
|---|-------------|:-----:|
| D1 | Revisione sistematica della letteratura sui sistemi di early-warning per le dogane | 🔄 In corso |
| D2 | Progettazione del Risk Scoring Engine a 8 dimensioni | ✅ Completato |
| D3 | Implementazione del sistema Risk Sentinel (questa repository) | ✅ Completato |
| D4 | Pipeline n8n per data ingestion e risk scoring | ✅ Implementato |
| D5 | Sperimentazione su dati GDELT + ACLED con valutazione precisione/recall | 🔄 Prossimo |
| D6 | Validazione con operatori ADM (Agenzia delle Dogane e dei Monopoli) | 📋 Pianificato |
| D7 | Articolo su rivista internazionale (target: Decision Support Systems o GIScience) | 📋 Pianificato |
| D8 | Dissertazione di dottorato | 📋 Pianificato |

---

## Architettura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            SORGENTI DATI                               │
│  GDELT · USGS · Open-Meteo · ACLED · Yahoo Finance · UN Comtrade      │
└───────────┬──────────────┬──────────────┬──────────────┬───────────────┘
            │              │              │              │
            ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       n8n ORCHESTRATION LAYER                          │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ GDELT    │ │ USGS     │ │ Climate  │ │Commodity │ │ ACLED    │    │
│  │ Customs  │ │ Seismic  │ │ Anomaly  │ │ Prices   │ │ Conflict │    │
│  │ Intel    │ │ Impact   │ │ Detect   │ │ (HS)     │ │ Trade    │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘    │
│       │             │            │             │            │          │
│       └──────┬──────┴──────┬─────┴─────────────┘            │          │
│              ▼             ▼                                ▼          │
│     ┌────────────────────────────┐   ┌────────────────────────┐       │
│     │  RISK SCORING ENGINE       │   │  TRADE IMPACT SCORER   │       │
│     │  (8 dimensioni, pesi PhD)  │   │  (chokepoint proximity)│       │
│     └────────────┬───────────────┘   └──────────┬─────────────┘       │
│                  │                               │                     │
│                  ▼                               ▼                     │
│          ┌───────────────────────────────────────────┐                 │
│          │        POST /api/n8n/ingest               │                 │
│          └─────────────────┬─────────────────────────┘                 │
└────────────────────────────┼───────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       REDIS (Upstash)                                  │
│            Cache tiers: 5min · 10min · 30min · 2h · 24h               │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         API SELF-HOSTED (Node.js)                       │
│          local-api-server · 69+ endpoint · CORS · Rate limiting         │
│              servito da Nginx dentro il container Docker                │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND SPA (TypeScript + Vite)                   │
│                                                                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐          │
│  │ Globe 3D  │  │  Mappa 2D │  │ 86 Panels │  │ Alert Feed│          │
│  │ (globe.gl)│  │ (deck.gl) │  │ (modulari)│  │ (scored)  │          │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Risk Scoring Engine (8 Dimensioni)

Ogni evento rilevato dalle sorgenti dati viene valutato attraverso un **algoritmo multi-dimensionale con pesi calibrati**:

```
RiskScore = 0.18 × EventSeverity
          + 0.10 × SourceConfidence
          + 0.18 × TradeExposure
          + 0.14 × RouteCriticality
          + 0.12 × CommoditySensitivity
          + 0.10 × EscalationMomentum
          + 0.12 × CustomsRelevance
          + 0.06 × GeophysicalClimateImpact
```

### Dimensioni in Dettaglio

| # | Dimensione | Peso | Descrizione |
|---|-----------|:----:|-------------|
| 1 | **Event Severity** | 0.18 | Gravità intrinseca dell'evento (keyword-based: attack=100, tension=75, warning=50, concern=25) |
| 2 | **Source Confidence** | 0.10 | Affidabilità della fonte (Reuters/AP/BBC=85, altre=50) |
| 3 | **Trade Exposure** | 0.18 | Densità di keyword commerciali (trade, import, export, shipping, freight, port) |
| 4 | **Route Criticality** | 0.14 | Prossimità a rotte marittime critiche (Suez=0.95, Hormuz=0.90, Panama=0.85) |
| 5 | **Commodity Sensitivity** | 0.12 | Rilevanza per commodity strategiche con codici HS (semiconduttori=0.95, petrolio=0.90) |
| 6 | **Escalation Momentum** | 0.10 | Presenza di linguaggio escalatorio (intensify, worsen, surge, unprecedented) |
| 7 | **Customs Relevance** | 0.12 | Rilevanza diretta per operazioni doganali (tariff, duty, classification, valuation, clearance) |
| 8 | **Geophysical Impact** | 0.06 | Impatto geofisico/climatico (earthquake, tsunami, hurricane, flood, drought) |

### Soglie di Rischio

| Livello | Score | Colore | Azione Raccomandata |
|---------|:-----:|:------:|---------------------|
| **Critical** | 85–100 | 🔴 | Alert immediato — possibile blocco operativo, attivare contingency plan |
| **High** | 70–84 | 🟠 | Monitoraggio intensivo — preparare misure di mitigazione |
| **Elevated** | 50–69 | 🟡 | Vigilanza attiva — analisi approfondita necessaria |
| **Moderate** | 25–49 | 🔵 | Monitoraggio standard — inserimento nel report periodico |
| **Low** | 0–24 | ⚪ | Nessuna azione — filtrato dal sistema |

---

## Sorgenti Dati

| Sorgente | Tipo | Dato | Frequenza n8n | API |
|----------|------|------|:-------------:|-----|
| **GDELT** | Geopolitica | Articoli news globali con tone analysis | Ogni 2h | Doc API v2 |
| **USGS** | Geofisica | Terremoti M4.5+ globali | Ogni 1h | GeoJSON Feed |
| **Open-Meteo** | Clima | Anomalie temperatura/precipitazioni in 15 zone | Ogni 3h | Archive API |
| **ACLED** | Conflitti | Battaglie, esplosioni, violenza su civili (30gg) | Ogni 6h | REST API v3 |
| **Yahoo Finance** | Mercati | Prezzi real-time commodity (futures, ETF) | Ogni 30min | Chart API v8 |
| **Alpha Vantage** | Mercati | WTI, Brent, NG, Copper, Aluminum | Ogni 30min | Physical Commodity |
| **UN Comtrade** | Commercio | Flussi commerciali bilaterali per paese | Pianificato | REST API |
| **ICEWS** | Conflitti | Interazioni tra stati (escalation/cooperazione) | Pianificato | Dataverse |
| **FRED** | Macro | Indicatori macroeconomici (tassi, inflazione) | Varia | REST API |
| **PizzINT** | Intelligence | Anomalie traffico DC intelligence agencies | Varia | Dashboard API |

---

## Pipeline n8n (Low-Code Data Ingestion)

I flussi di elaborazione dati sono implementati come **workflow n8n importabili**, rendendo la pipeline:

- **Visiva**: ogni nodo è visibile nell'editor grafico
- **Spiegabile**: si può tracciare ogni trasformazione dall'input all'output
- **Riproducibile**: stesso input → stesso output (scoring deterministico)
- **Modificabile**: chiunque può adattare i parametri senza toccare codice

### Workflow Disponibili

I file JSON si trovano nella cartella [`n8n-workflows/`](./n8n-workflows/):

| # | Workflow | Sorgente | Funzione |
|---|----------|----------|----------|
| 01 | GDELT Customs Intelligence | GDELT Doc API | 3 query parallele → merge & dedup → Risk Scoring 8D → classificazione |
| 02 | USGS Seismic Trade Impact | USGS GeoJSON | Terremoti → proximity scoring su rotte/porti/siti nucleari |
| 03 | Climate Trade Anomalies | Open-Meteo | 15 zone → anomaly detection → trade impact assessment |
| 04 | Commodity Prices (HS) | Yahoo Finance | 14 commodity con codici HS → volatilità → alert level |
| 05 | ACLED Conflict Impact | ACLED API | Conflitti armati → proximity scoring a chokepoint marittimi |

Per istruzioni dettagliate su import e configurazione, vedi [`n8n-workflows/README.md`](./n8n-workflows/README.md).

---

## Rotte Critiche e Commodity Monitorate

### Rotte Marittime Strategiche

| Rotta | Criticality | Volume Stimato | Keyword di Detection |
|-------|:-----------:|----------------|----------------------|
| 🚢 Canale di Suez | 0.95 | 12% commercio mondiale | suez, red sea, bab el mandeb |
| ⛽ Stretto di Hormuz | 0.90 | 20% petrolio mondiale | hormuz, strait of hormuz |
| 🌎 Canale di Panama | 0.85 | 5% commercio mondiale | panama, panama canal |
| 🔧 Stretto di Taiwan | 0.85 | 90% chip avanzati | taiwan strait, taiwan |
| 🚢 Stretto di Malacca | 0.80 | 25% merci marittime | malacca |
| 🌊 Stretto di Gibilterra | 0.70 | Accesso Mediterraneo | gibraltar |

### Commodity Critiche per le Dogane

| Commodity | Sensitivity | Codice HS | Keyword |
|-----------|:-----------:|:---------:|---------|
| Semiconduttori | 0.95 | 8542 | semiconductor, chip, silicon, tsmc |
| Petrolio / Gas | 0.90 | 2709–2711 | oil, gas, lng, crude, energy |
| Nichel & Metalli Critici | 0.85 | 7501–7508 | nickel, copper, aluminum, lithium |
| Grano / Agricoltura / Concimi | 0.75 | 1001–1005, 3105 | grain, wheat, corn, fertilizer |
| Farmaceutici | 0.70 | 3004 | pharma, medicine, drug |
| Beni di Consumo | 0.60 | Vari | consumer, retail, goods, container |

---

## Stack Tecnologico

| Livello | Tecnologie |
|---------|-----------|
| **Frontend** | TypeScript, Vite, Vanilla JS (class-based components) |
| **Visualizzazione** | globe.gl + Three.js (3D), deck.gl + MapLibre GL (2D) |
| **AI / LLM** | OpenRouter (GPT-4, Claude, Mistral), Ollama (locale) |
| **Orchestrazione Dati** | n8n (5 workflow JSON importabili) |
| **Caching** | Redis (Upstash REST compatibile, self-hosted via `redis-rest` in Docker) — cache tiers: 5min/10min/30min/2h/24h |
| **Deployment** | **Docker Compose 100% self-hosted** (Nginx + Node.js API + Redis REST proxy), PWA |
| **API Contracts** | Protocol Buffers (sebuf framework) |
| **Testing** | node:test runner, Playwright E2E |

---

## Quick Start

### 🐳 Docker Compose (deployment consigliato — 100% self-hosted)

```bash
# 1. Clona il repository
git clone https://github.com/gstorelli/worldmonitor.git
cd worldmonitor

# 2. Copia le variabili d'ambiente e compila il file .env
cp .env.example .env
#   → genera valori casuali per REDIS_PASSWORD e REDIS_TOKEN:
#     openssl rand -hex 32

# 3. Avvia l'intero stack (SPA + API/ingestion + Redis)
docker compose up -d --build

# 4. Apri nel browser
open http://localhost:3000
```

Lo stack compose include **tre servizi**:

| Servizio | Ruolo |
|----------|-------|
| `worldmonitor` | Nginx (SPA statica) + Node.js `local-api-server` (tutti gli endpoint `/api/*`, inclusa l'ingestion n8n) |
| `redis` | Redis 7 locale (persistenza dati delle pipeline n8n) |
| `redis-rest` | Proxy Upstash-compatibile (`UPSTASH_REDIS_REST_URL` → Redis locale) |
| `ais-relay` | Relay AIS marittimo (opzionale) |

### 🧪 Sviluppo locale (Vite dev server)

```bash
# 1. Installa dipendenze
npm install

# 2. Avvia dev server
npm run dev

# 3. Apri nel browser
open http://localhost:5173
```

> **Nota**: Senza variabili d'ambiente configurate, molti pannelli mostreranno "dati non disponibili".
> Per popolare i dati, è necessario configurare Redis e le API keys, oppure attivare
> i workflow n8n con l'endpoint di ingestion (`POST /api/n8n/ingest`).

---

## Configurazione Variabili d'Ambiente

Crea un file `.env` nella root del progetto (vedi [`.env.example`](./.env.example) per l'elenco completo):

```env
# ─── Redis self-hosted (Docker Compose) — obbligatorio ───
REDIS_PASSWORD=openssl-rand-hex-32          # AUTH password del Redis locale
REDIS_TOKEN=openssl-rand-hex-32             # Bearer token del proxy redis-rest

# ─── Oppure Upstash Redis remoto (senza il servizio redis locale) ───
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# ─── n8n Ingestion (Risk Sentinel) ───
N8N_INGEST_SECRET=openssl-rand-hex-32       # Bearer token atteso da POST /api/n8n/ingest
RISK_SENTINEL_WEBHOOK_URL=                  # URL completo usato dai workflow n8n
                                            # (default: http://localhost:3000/api/n8n/ingest)

# ─── API Keys (opzionali, migliorano copertura dati) ───
OPENROUTER_API_KEY=your-key                 # LLM per AI insights
ACLED_ACCESS_TOKEN=your-token               # Conflict data (ACLED)
FRED_API_KEY=your-key                       # Macro indicators (FRED)
EIA_API_KEY=your-key                        # Energy data (EIA)
FINNHUB_API_KEY=your-key                    # Stock quotes
```

### Endpoint di Ingestion n8n (self-hosted)

I 5 workflow in [`n8n-workflows/`](./n8n-workflows/) inviano i payload a

```
POST http://<HOST>:3000/api/n8n/ingest
Authorization: Bearer <N8N_INGEST_SECRET>
```

Il filtro `/api/*` di Nginx inoltra le richieste al `local-api-server` Node.js, che
esegue l'handler `api/n8n/ingest.js` e scrive i dati trasformati su Redis (via
`UPSTASH_REDIS_REST_URL`). Le pipeline supportate: `customs-intelligence`,
`seismic-trade-impact`, `climate-trade-anomalies`, `commodity-customs-tracker`,
`conflict-trade-impact`.

---

## Sincronizzazione con il repository upstream (koala73/worldmonitor)

Risk Sentinel è un fork indipendente di [WorldMonitor](https://github.com/koala73/worldmonitor).
Il sync viene eseguito periodicamente con un merge di `upstream/main` nel branch di lavoro.

### Stato della sincronizzazione

| Aspetto | Stato |
|---------|:-----:|
| Backend/API (endpoint `/api/*`, caching Redis, seed scripts, proto) | ✅ Sincronizzato con `upstream/main` |
| Infrastruttura (Dockerfile, docker-compose, docker/*, deploy/*, CI) | ✅ Sincronizzato con `upstream/main` |
| Dati condivisi (`shared/*.json`, `data/`) | ✅ Sincronizzato (con commodity customs aggiunte) |
| SPA (`src/`) — dominio doganale, de-clouding, branding | 🛡️ Mantenuta come baseline del fork (protezione a priorità massima) |

### Regole di sync

- **Vengono adottati dall'upstream**: bug fix e performance su backend/API, nuovi
  endpoint, miglioramenti infrastrutturali, aggiornamenti di configurazione dati.
- **Vengono protette (mai sovrascritte)**: `api/n8n/ingest.js`, le 5 pipeline
  `n8n-workflows/`, il Risk Scoring Engine 8D (`src/services/CustomsRiskScorer.ts`),
  gli stub de-clouded (`entitlements.ts`, `api-keys.ts`, `mcp-clients.ts`), il
  branding Risk Sentinel e l'integrazione HS2 (`Hs2Picker`, `CommoditiesPanel`).
- Il blocco SPA (`src/`) è la **baseline convalidata** del fork: le sue dipendenze
  interne (barrel `@/services`, `@/config`, classi `Panel`) non vengono sostituite
  da refactoring upstream fino a che il fork non decide di migrarvi.

### Procedura

```bash
git remote add upstream https://github.com/koala73/worldmonitor.git   # una volta
git fetch upstream
git merge upstream/main --no-edit                                     # risolvere i conflitti
npm run typecheck:all
npm run test:sidecar
```

---

## Deployment di Produzione (Contabo VPS)

Risk Sentinel gira in produzione su un **Contabo VPS** dietro un reverse proxy
centralizzato basato su **`jwilder/nginx-proxy`** + **`nginx-proxy/acme-companion`**
(routing per dominio e certificati Let's Encrypt globali).

### Architettura di rete

```
Internet
   │  https://risksentinel.opencyber.org
   ▼
jwilder/nginx-proxy  (rete esterna "nginx-proxy", acme-companion per TLS)
   │  VIRTUAL_HOST risposto dal container worldmonitor (porta interna 8080)
   ▼
┌─ container worldmonitor ──────────────────────────────────────────────┐
│ Nginx (8080) → SPA statica + proxy /api/* → local-api-server (Node)  │
└────────────────────────────────────────────────────────────────────────┘
   │ rete interna "internal-net"
   ▼
redis ⇄ redis-rest (Upstash-compatibile) · ais-relay
```

- **Nessuna porta host esposta**: tutto il traffico entrante passa solo dalla
  rete `nginx-proxy` (`VIRTUAL_HOST` / `LETSENCRYPT_HOST` in `docker-compose.yml`).
- Redis, proxy `redis-rest` e relay AIS restano sulla rete isolata `internal-net`.
- La rete esterna deve esistere sull'host: `docker network create nginx-proxy`.

### Setup una tantum del server

```bash
# 1. (se non presente) rete esterna del proxy
docker network create nginx-proxy

# 2. checkout del repository nella DEPLOY_PATH (es. /srv/worldmonitor)
git clone https://github.com/gstorelli/worldmonitor.git /srv/worldmonitor
cd /srv/worldmonitor

# 3. ambiente di produzione
cp .env.example .env
$EDITOR .env
#    → obbligatori: REDIS_PASSWORD, REDIS_TOKEN (openssl rand -hex 32)
#    → consigliati: N8N_INGEST_SECRET, API_MCP_N8N e le API keys dati

# 4. avvio dello stack (si aggancia alla rete nginx-proxy)
docker compose up -d --build

# 5. verifica
curl https://risksentinel.opencyber.org/api/version
curl -X POST https://risksentinel.opencyber.org/api/n8n/ingest \
     -H "Authorization: Bearer $N8N_INGEST_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"pipeline":"customs-intelligence","alerts":[]}'
```

> ⚠️ **Non modificare la porta host nel compose**: `VIRTUAL_PORT=8080` indica al
> proxy la porta interna del container. Per test locali usa un override
> (`docker run -p 8080:8080 ...`) senza toccare il file di produzione.

### Deploy automatico (GitHub Actions)

Il workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) viene
eseguito a **ogni push sul branch `main`** (inclusi i push automatici di Kilo
Code): via SSH su Contabo esegue `git pull origin main`, `docker compose up -d
--build` e `docker image prune -f`.

**GitHub Secrets richiesti** (Settings → Secrets and variables → Actions):

| Secret | Descrizione |
|--------|-------------|
| `SERVER_HOST` | IP/hostname del VPS (es. `123.123.123.123`) |
| `SERVER_USER` | Utente SSH (es. `root` o utente con permessi docker) |
| `SSH_PRIVATE_KEY` | Chiave privata SSH (formato PEM) autorizzata sul VPS |
| `DEPLOY_PATH` | Percorso assoluto del checkout sul VPS (es. `/srv/worldmonitor`) |
| `SERVER_PORT` | *(opzionale)* porta SSH — **produzione: `56969`** (default `22`) |

### Deploy manuale (fallback)

Sul VPS (stesso set di comandi del workflow):

```bash
./scripts/deploy.sh /srv/worldmonitor
```

### Troubleshooting del deploy

| Sintomo | Causa probabile | Fix |
|---------|-----------------|-----|
| `503 Service Unavailable` sul dominio | Il proxy `nginx-proxy` non trova il container `worldmonitor` sulla rete esterna (container giù o rete mancante) | `docker network create nginx-proxy`; poi `./scripts/deploy.sh` |
| Workflow "Deploy to Contabo VPS" fallisce allo step SSH con **connection timed out** | La porta SSH del VPS non è raggiungibile dai runner GitHub (firewall) | Apri la porta SSH (22 o porta custom) verso le range dei runner GitHub — vedi sotto |
| Workflow fallisce allo step SSH con *Permission denied (publickey)* | Chiave privata in `SSH_PRIVATE_KEY` non corrisponde a una chiave autorizzata sul VPS | Installa `SERVER_USER`'s public key in `~/.ssh/authorized_keys` e riprova |
| `docker: 'compose' is not a docker command` | Host con solo Compose v1 | Installare il plugin v2 (`apt install docker-compose-v2`), oppure usare `docker-compose` (lo script prova entrambi) |
| `error while interpolating ... REDIS_TOKEN` | `.env` senza valori Redis | Non più bloccante: cala su default locali; in produzione però imposta `REDIS_PASSWORD`/`REDIS_TOKEN` |
| HTTPS senza certificato | acme-companion non ha ancora emesso il certificato per `risksentinel.opencyber.org` | Attendi l'emissione (DNS già puntato alla VPS); verifica `docker compose logs nginx-proxy`/`acme-companion` |

#### 🔥 Requisito precondizione: Firewall/SSH aperto verso GitHub Actions

Il deploy via GitHub Actions richiede che la porta SSH del VPS accetti connessioni
dai runner GitHub-hosted. Sintomo: `ssh: connect to host <IP> port 22: Connection
timed out` nel log del workflow.

```bash
# Esempio con ufw (adatta al tuo firewall)
sudo ufw allow 22/tcp          # SSH
sudo ufw allow 80,443/tcp      # http/https del proxy

# Verifica locale (usa la porta SSH reale, qui 56969)
ssh -p 56969 -o ConnectTimeout=10 root@<SERVER_HOST> hostname
```

Dopo aver aperto la porta, riavvia il deploy dal tab **Actions** del repository
(workflow "Deploy to Contabo VPS" → **Run workflow**) oppure con un nuovo push
su `main`.

### Integrazione n8n MCP

Il workspace MCP del progetto è configurato in [`.mcp/n8n-mcp.json`](.mcp/n8n-mcp.json)
per esporre l'istanza n8n esterna come server MCP:

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "type": "http",
      "url": "https://automata.opencyber.org/mcp-server/http",
      "headers": {
        "Authorization": "Bearer ${API_MCP_N8N}"
      }
    }
  }
}
```

- **Token**: variabile `API_MCP_N8N` (vedi `.env.example`). I client MCP che
  espandono le variabili d'ambiente la risolveranno automaticamente; se il tuo
  client non supporta l'espansione, sostituisci `${API_MCP_N8N}` con il token
  reale **senza committarlo** (il file è pensato come template).
- **CLI helper** per interagire con il server MCP da script/pipeline:

```bash
API_MCP_N8N=xxx node scripts/n8n-mcp.mjs list-tools
API_MCP_N8N=xxx node scripts/n8n-mcp.mjs call "esegui-workflow-customs" '{"source":"gdelt"}'
```

- **CORS**: l'origin di produzione `https://risksentinel.opencyber.org` (e i
  sottodomini `opencyber.org`) sono aggiunti agli allowlist di `api/_cors.js` e
  del sidecar API, così client web e integrazioni possono interrogare gli
  endpoint API; SPA e API condividono comunque lo stesso origin, quindi le
  chiamate interne non richiedono CORS.

---

## Self-Hosting Operations (Contabo VPS — stato operativo)

Questa sezione documenta lo stato operativo del deployment self-hosted e le
decisioni operative prese durante l'allestimento.

### Accesso API anonimo (modalità self-hosted)

Il fork è **de-clouded**: non ha gating premium. In modalità Docker l'env
`ALLOW_ANONYMOUS_API=true` (default nel compose) disabilita, nell'API layer:

1. il requisito di API key (`api/_api-key.js` → kind `anonymous-selfhosted`)
2. i tier gate premium (`server/gateway.ts`)
3. i check di entitlement (`server/_shared/entitlement-check.ts`)
4. l'auth per gli endpoint a quota-LLM diretta (es. `analyze-stock`)

Senza questo flag, il SPA (che non invia API key su tutti gli RPC) riceverebbe
`401 API key required` / `403 Authentication required` ovunque. Per ripristinare
l'auth obbligatoria: `ALLOW_ANONYMOUS_API=false` + `WORLDMONITOR_VALID_KEYS`.

### Domini API ripristinati dall'upstream

Durante il sync col fork erano stati eliminati i domini `market/v1`,
`prediction/v1`, `giving/v1`, `research/v1` (handler + proto + stub generati),
ma i pannelli del SPA continuavano a chiamarli (404). Ripristinati da
`upstream/main`: `api/{market,prediction,giving,research}`, `server/worldmonitor/{...}`,
`proto/worldmonitor/{...}`, `src/generated/{client,server}/worldmonitor/{...}`.

### Sidecar Risk Sentinel (SQLite) nel container

`/api/customs-events` falliva con `Cannot find module /app/database/sqlite.js`:
il Dockerfile non copiava i moduli del sidecar. Ora copia `database/` +
`services/`, e `better-sqlite3` è installato/compilato per Alpine nel
runtime (`docker/runtime-package.json`, `npm rebuild better-sqlite3`).
Rimosso anche il residuo `convex` dal runtime package.

### SPA de-clouded

- Rimossa l'iniezione di Vercel Analytics (`/_vercel/insights` → MIME error).
- Boundary geografiche ad alta risoluzione servite **same-origin** da
  `/data/country-boundary-overrides.geojson` (evita il CORS di
  maps.worldmonitor.app).

### Credenziali installate sul server (via SSH, nel `.env` del VPS)

| Variabile | Stato |
|-----------|-------|
| `REDIS_PASSWORD` / `REDIS_TOKEN` | ruotate a 64 hex casuali |
| `RELAY_SHARED_SECRET` | ruotato a 64 hex |
| `N8N_INGEST_SECRET` | generato e installato; i workflow n8n lo inviano come `Authorization: Bearer` |
| `WM_SESSION_SECRET` | 64 hex — abilita i session token anonimi del browser |
| `ALLOW_ANONYMOUS_API` | `true` (compose default) |

### Integrazione n8n via MCP

- Config MCP: [`.mcp/n8n-mcp.json`](.mcp/n8n-mcp.json) (server `automata.opencyber.org/mcp-server/http`, token `API_MCP_N8N`).
- CLI: `node scripts/n8n-mcp.mjs list-tools` / `call <tool> '<json>'`.
- I 6 workflow Risk Sentinel su n8n erano attivi ma il nodo "Push to Risk
  Sentinel API" era uno stub Code (solo log). Via MCP sono stati aggiunti i
  nodi HTTP reali (`POST https://risksentinel.opencyber.org/api/n8n/ingest`)
  con header `Authorization` e `sendHeaders:true`, poi pubblicati.
  **Pipeline provata end-to-end** (esecuzione → POST autenticato → Redis).

### Errori residui noti (sorgenti dati esterne)

| Sintomo | Causa |
|---------|-------|
| `/api/gpsjam` 503 | gpsjam.org non raggiungibile dal VPS — il pannello degrada |
| Polymarket "No markets returned" | API Polymarket bloccata/vuota verso il VPS |
| Military Flight Tracking "No flights" | adsb.lol/OpenSky vuoti al momento del fetch |
| `seismology:earthquakes:v1` vuoto da n8n | il nodo Process del workflow USGS in n8n non emette item — da correggere nell'editor n8n |

### Popolamento dati (seeding self-hosted)

I pannelli leggono dati da Redis. In upstream il cron Railway semina i ~170
dataset; in self-hosted si esegue **una volta** (e dopo ogni svuotamento Redis):

```bash
./scripts/seed-all.sh /srv/worldmonitor   # sul VPS
```

Lo script esegue tutti i `scripts/seed-*.mjs` in un container usa-e-getta sulla
rete interna, con `UPSTASH_REDIS_REST_*` derivate da `REDIS_TOKEN` e
`API_BASE_URL=http://worldmonitor:8080` (i seed derivati come insights/forecasts
si scaldano contro il gateway locale, non l'API cloud upstream).

Stato di copertura bootstrap: **19/25 dataset** popolati. I 6 mancanti:

| Dataset | Causa | Fix |
|---------|-------|-----|
| `outages`, `ddosAttacks`, `trafficAnomalies` | Richiedono `CLOUDFLARE_API_TOKEN` (Cloudflare Radar) | Inserire il token nel `.env` e rieseguire il seed |
| `chokepoints` | Dataset derivato dallo `scenario-worker` upstream, non da un seed | Non disponibile self-hosted (degradazione graziosa) |
| `socialVelocity`, `wsbTickers` | Sorgente Reddit — IP del VPS rate-limitato/bloccato | Degradazione graziosa; riprovare il seed periodicamente |
| Ritardi voli (AviationStack) | `AVIATIONSTACK_API` 403 → chiave invalida/scaduta o IP bloccato | Verificare/ruotare la chiave API nel `.env` |

### Diagnostica rapida

```bash
# console errori dal browser: F12 → Console (ora ~3 errori residui)
# container
docker compose ps && docker logs --tail 50 worldmonitor
# auth anonimo
curl -s -o /dev/null -w '%{http_code}\n' https://risksentinel.opencyber.org/api/economic/v1/get-macro-signals
# ingestion n8n (secret errato → 401; corretto → 200)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://risksentinel.opencyber.org/api/n8n/ingest \
  -H "Authorization: Bearer <N8N_INGEST_SECRET>" -H "Content-Type: application/json" \
  -d '{"pipeline":"customs-intelligence","alerts":[]}'
```

---

## Struttura Repository

```
.
├── src/                        # Frontend SPA (TypeScript)
│   ├── app/                    # Orchestrazione (data-loader, panel-layout, event-handlers)
│   ├── components/             # 86 pannelli UI (class-based, estendono Panel)
│   ├── config/                 # Configurazione pannelli, layer, mercati, varianti
│   ├── services/               # Business logic (120+ file, organizzati per dominio)
│   ├── types/                  # Type definitions
│   ├── utils/                  # Utilities condivise
│   └── workers/                # Web Workers (analysis, ML/ONNX)
├── api/                        # Endpoint API (Node.js, self-contained)
├── server/                     # Server-side code (Redis, rate-limit, gateway)
├── scripts/                    # Seed scripts per Redis (30+ file)
├── n8n-workflows/              # ← 5 workflow JSON + README
│   ├── 01-gdelt-customs-ingestion.json
│   ├── 02-usgs-seismic-ingestion.json
│   ├── 03-climate-anomalies-ingestion.json
│   ├── 04-commodity-prices-ingestion.json
│   ├── 05-acled-conflict-ingestion.json
│   └── README.md
├── shared/                     # JSON configs cross-platform
├── proto/                      # Protobuf definitions
├── docker/                     # Docker infra (nginx, supervisord, redis-rest)
├── Dockerfile                  # Immagine multi-stage (SPA + API server)
├── docker-compose.yml          # Stack self-hosted (web + redis + redis-rest + ais-relay)
├── tests/                      # Unit/integration tests
├── e2e/                        # Playwright E2E specs
├── blog-site/                  # Blog statico (Astro)
└── docs/                       # Documentazione (Mintlify)
```

---

## Pannelli Disponibili

Il sistema include **86 pannelli** organizzati per dominio. Quelli rilevanti per il dottorato:

### Intelligence & Geopolitica

| Pannello | Descrizione |
|----------|-------------|
| Global Map | Mappa globale con 45+ data layer sovrapposti |
| Live Intelligence | Feed GDELT con articoli classificati per topic (military, cyber, nuclear, sanctions) |
| Intel Feed | Aggregazione multi-sorgente di intelligence |
| Strategic Risk Overview | Panoramica rischi strategici per regione |
| AI Strategic Posture | Analisi AI della postura strategica globale |
| AI Insights | Sintesi narrativa AI degli eventi in corso |
| AI Forecasts | Previsioni geopolitiche AI-powered |
| Cross-Source Signals | Correlazione segnali cross-sorgente |
| Infrastructure Cascade | Monitoraggio cascate infrastrutturali |

### Commercio & Dogane

| Pannello | Descrizione |
|----------|-------------|
| Metals & Materials | Prezzi metalli e materiali critici |
| Energy Complex | Complesso energetico (petrolio, gas, carbone) |
| Markets | Panoramica mercati finanziari globali |
| Macro Stress | Indicatori di stress macroeconomico |
| Trade Policy | Politiche commerciali e tariffarie |
| Supply Chain | Anomalie nelle catene di approvvigionamento |
| Hormuz Trade Tracker | Monitoraggio stretto di Hormuz |
| Sanctions Pressure | Pressione sanzionatoria per paese |
| Commodity News | News su materie prime |

### Rischio Naturale

| Pannello | Descrizione |
|----------|-------------|
| Fires | Incendi rilevati da satellite (FIRMS) |
| Climate Anomalies | Anomalie climatiche per zona |
| Fuel Prices | Prezzi carburante per paese |

---

## Roadmap e Next Steps

### Fase 1 — Completata ✅

- [x] Fork da WorldMonitor e rebranding Risk Sentinel
- [x] Rimozione UI premium/Pro/locked
- [x] Integrazione sistema di pannelli completo (86 pannelli)
- [x] Progettazione Risk Scoring Engine (8 dimensioni)
- [x] Creazione 5 workflow n8n per data ingestion
- [x] Build pipeline funzionante (Docker Compose self-hosted)

### Fase 2 — Completata ✅ (Stabilizzazione & Commodity Tracker)

*In questa fase il progetto è stato completamente sganciato dall'infrastruttura commerciale originale, diventando un tool di ricerca 100% open e self-hosted.*

- [x] **Transizione Accademica & CI/CD**: Disinstallazione radicale dei pacchetti `convex` e `@dodopayments`. Creazione di stub mockati per i servizi cloud (`entitlements.ts`, `api-keys.ts`, `mcp-clients.ts`) in modo da far passare tutti i typecheck (`npm run typecheck:all`) e i test del sidecar (`npm run test:sidecar`).
- [x] **Endpoint di Ingestion n8n**: Consolidamento e standardizzazione dello script di ricezione webhook in `api/n8n/ingest.js`. Il sistema è ora pronto a ricevere il payload dai 5 workflow n8n e salvarlo su Redis.
- [x] **Persistenza Redis (Upstash)**: Integrazione del salvataggio dati elaborati da n8n in cache (tramite `UPSTASH_REDIS_REST_URL`), rendendo il sistema indipendente dai vecchi database Convex.
- [x] **Commodity Tracker (Filtri HS)**: Verticalizzazione del pannello `CommoditiesPanel` (Metals & Materials). È stato integrato il modulo `Hs2Picker` che permette di filtrare dinamicamente i dati di mercato in base ai codici doganali Harmonized System (es. 85 per semiconduttori, 27 per petrolio), agganciandosi al campo `hsCode` popolato dall'ingestion n8n.

### Fase 3 — In Corso 🔄 (Deployment, Validazione & RAG)

*Obiettivo attuale: rendere il sistema live e iniziare a raccogliere/validare i dati per il paper di ricerca, oltre a introdurre l'infrastruttura semantica (Knowledge Graph e RAG).*

- [ ] **Deployment Infrastruttura Live**:
  - [ ] Deploy dell'app web **self-hosted via Docker Compose** (`docker compose up -d`) su VPS/server dedicato.
  - [ ] Deploy di n8n su un server/VPS dedicato (es. Railway, DigitalOcean, oppure container n8n).
  - [ ] Configurazione dei Webhook n8n affinché puntino all'endpoint `POST /api/n8n/ingest` dell'app live (variabile `RISK_SENTINEL_WEBHOOK_URL`).
- [ ] **Validazione Dati Live**: Test in produzione dei pannelli con dati freschi inseriti su Redis dalle pipeline n8n.
- [ ] **Implementazione Ontologia Doganale (Knowledge Graph)**:
  - Entità: `EventoGeopolitico`, `EventoSismico`, `EventoClimatico`, `RottaCommerciale`, `CommoditySensibile`, `NodoLogistico`, `Paese`, `FlussoCommerciale`
  - Relazioni: `affects_route`, `involves_commodity`, `located_in`, `flows_between`, `transits_route`, `exposes_to`
- [ ] **Vector Search & RAG**: Integrazione Qdrant (embedded) e Retrieval-Augmented Generation su corpus di articoli storici per analisi trend.
- [ ] **Classificatore Semantico**: Costruzione del classificatore LLM-based per valutare automaticamente la *rilevanza doganale* dei testi analizzati.

### Fase 4 — Moduli Customs-Specifici

- [ ] **Critical Trade Routes Monitor** — overlay visivo su mappa delle rotte con status real-time
- [ ] **Country Exposure Index** — esposizione commerciale per paese (da UN Comtrade)
- [ ] **Alert Triage & Deduplication** — sistema anti-alert-fatigue con prioritizzazione intelligente
- [ ] **Commodity Matrix** — matrice rischio paese × commodity interattiva

### Fase 5 — Sperimentazione & Validazione

- [ ] Dataset di test: 1000+ eventi GDELT annotati manualmente per rilevanza doganale
- [ ] Metriche: Precision, Recall, F1-score dell'algoritmo di scoring
- [ ] Confronto con baseline (keyword-only, random forest, BERT classifier)
- [ ] User study con operatori ADM (task completion, satisfaction, trust)
- [ ] A/B testing: scoring 8D vs scoring semplificato (4D)

### Fase 6 — Disseminazione

- [ ] Articolo su rivista internazionale (target: *Decision Support Systems*, *GIScience*, o *Government Information Quarterly*)
- [ ] Presentazione a conferenza (target: EGOV, dg.o, ACM SIGSPATIAL)
- [ ] Dissertazione finale di dottorato
- [ ] Eventuale trasferimento tecnologico verso ADM

---

## Riferimenti Bibliografici

La progettazione di Risk Sentinel si basa sulle seguenti aree di ricerca:

1. **Early-Warning Systems**: Aven, T. (2016). *Risk assessment and risk management: Review of recent advances on their foundation*. European Journal of Operational Research.
2. **OSINT per Intelligence**: Pastor-Galindo, J. et al. (2020). *The not yet exploited goldmine of OSINT*. IEEE Access.
3. **Explainable AI**: Arrieta, A.B. et al. (2020). *Explainable Artificial Intelligence (XAI): Concepts, taxonomies, opportunities and challenges*. Information Fusion.
4. **Supply Chain Risk**: Ivanov, D. (2020). *Predicting the impacts of epidemic outbreaks on global supply chains*. Transportation Research.
5. **Customs Risk Management**: World Customs Organization (2018). *Risk Management Compendium*.
6. **GDELT Project**: Leetaru, K. & Schrodt, P.A. (2013). *GDELT: Global Data on Events, Tone, and Language*. ISA Annual Convention.
7. **Knowledge Graphs for Risk**: Noy, N.F. et al. (2019). *Industry-scale Knowledge Graphs: Lessons and Challenges*. ACM Queue.

---

## Licenza e Attribuzione

Questo progetto è un **fork** di [WorldMonitor](https://github.com/koala73/worldmonitor) di Elie Habib, rilasciato sotto licenza **AGPL-3.0**.

Il fork è stato realizzato per scopi di **ricerca accademica** nell'ambito di un dottorato di ricerca presso l'Università degli Studi di Bari "Aldo Moro", in collaborazione con l'Agenzia delle Dogane e dei Monopoli (ADM).

Le modifiche includono:

- Rimozione della logica premium/commerciale
- Aggiunta pipeline n8n per data ingestion trasparente
- Implementazione del Risk Scoring Engine a 8 dimensioni
- Rebranding e adattamento al contesto doganale

**Uso**: Ricerca accadeica e non commerciale — v. [LICENSE](LICENSE) per i termini completi.

---

<p align="center">
  <strong>Risk Sentinel</strong> — PhD Research<br>
  Università degli Studi di Bari "Aldo Moro" · ADM — Agenzia delle Dogane e dei Monopoli
</p>
