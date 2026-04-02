# Risk Sentinel — n8n Workflows

Questa cartella contiene i workflow n8n per l'ingestion e il risk scoring dei dati utilizzati da Risk Sentinel. Ogni file JSON può essere importato direttamente nell'interfaccia di n8n.

## Panoramica dei Workflow

| # | File | Sorgente | Frequenza | Funzione |
|---|------|----------|-----------|----------|
| 01 | `01-gdelt-customs-ingestion.json` | GDELT Doc API | Ogni 2h | Intelligence doganale + Risk Scoring a 8 dimensioni |
| 02 | `02-usgs-seismic-ingestion.json` | USGS GeoJSON | Ogni 1h | Terremoti M4.5+ con impatto su rotte commerciali |
| 03 | `03-climate-anomalies-ingestion.json` | Open-Meteo Archive | Ogni 3h | Anomalie climatiche in 15 zone critiche per il commercio |
| 04 | `04-commodity-prices-ingestion.json` | Yahoo Finance | Ogni 30min | Prezzi commodity con codici HS doganali |
| 05 | `05-acled-conflict-ingestion.json` | ACLED API | Ogni 6h | Conflitti armati con prossimità ai chokepoint marittimi |

## Come Importare

1. Apri la dashboard n8n (`http://tuo-server:5678`)
2. Vai su **Workflows → Import from File**
3. Seleziona il file `.json` desiderato
4. Configura le **variabili d'ambiente** (vedi sotto)
5. Attiva il workflow

## Variabili d'Ambiente Richieste

Configura queste variabili nella sezione **Settings → Environment Variables** di n8n:

| Variabile | Descrizione | Obbligatoria |
|-----------|-------------|:------------:|
| `RISK_SENTINEL_WEBHOOK_URL` | URL dell'endpoint di ingestion di Risk Sentinel (default: `http://localhost:3100/api/n8n/ingest`) | ✅ |

### Credenziali per Workflow Specifici

- **Workflow 05 (ACLED)**: Richiede credenziali ACLED configurate come **Header Auth** in n8n:
  - Tipo: `Header Auth`
  - Header Name: `Authorization`
  - Header Value: `Bearer <il_tuo_token_ACLED>`
  - Per ottenere un token: registrati su [acleddata.com](https://acleddata.com)

## Architettura del Risk Scoring (Workflow 01)

Il workflow GDELT implementa l'algoritmo di scoring a **8 dimensioni** definito nella specifica PhD:

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

### Soglie di Rischio

| Livello | Score | Azione |
|---------|:-----:|--------|
| Critical | 85–100 | Alert immediato, possibile blocco operativo |
| High | 70–84 | Monitoraggio intensivo, preparazione contingency |
| Elevated | 50–69 | Vigilanza attiva, analisi approfondita |
| Moderate | 25–49 | Monitoraggio standard |
| Low | 0–24 | Filtrato (non inoltrato) |

### Rotte Critiche Monitorate

- 🚢 **Canale di Suez** (criticality: 0.95)
- ⛽ **Stretto di Hormuz** (criticality: 0.90)
- 🌎 **Canale di Panama** (criticality: 0.85)
- 🔧 **Stretto di Taiwan** (criticality: 0.85)
- 🚢 **Stretto di Malacca** (criticality: 0.80)
- 🌊 **Gibilterra** (criticality: 0.70)

### Commodity Sensibili (con Codici HS)

| Commodity | Sensitivity | Codice HS |
|-----------|:-----------:|:---------:|
| Semiconduttori | 0.95 | 8542 |
| Petrolio/Gas | 0.90 | 2709-2711 |
| Nichel & Metalli Critici | 0.85 | 7501-7508 |
| Grano/Concimi | 0.75 | 1001-1005, 3105 |
| Farmaceutici | 0.70 | 3004 |

## Integrazione con Risk Sentinel

Tutti i workflow inviano i dati elaborati ad un endpoint REST:

```
POST {RISK_SENTINEL_WEBHOOK_URL}
Content-Type: application/json

{
  "source": "gdelt|usgs|open-meteo|yahoo-finance|acled",
  "pipeline": "customs-intelligence|seismic-trade-impact|...",
  "alerts": [...],
  "summary": { ... },
  "processedAt": "2026-04-03T00:00:00.000Z"
}
```

L'endpoint di ingestion nel backend Risk Sentinel riceve questi payload e li persiste in Redis per il consumo da parte del frontend.

## Spiegabilità (Explainability)

Ogni alert prodotto dal Risk Scoring Engine include una decomposizione completa del punteggio per dimensione (`dimensions` object), consentendo:

- **Trasparenza**: l'utente vede *perché* un evento ha un certo score
- **Auditabilità**: ogni dimensione è tracciabile alla keyword o alla metrica che l'ha attivata
- **Riproducibilità**: lo stesso input produce sempre lo stesso output (scoring deterministico)

Questo soddisfa il requisito di **Explainable AI** del progetto di dottorato.
