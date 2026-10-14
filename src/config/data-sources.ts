/**
 * Risk Sentinel — where the data of each panel and workspace section come from.
 *
 * Shown to the user by the "Fonti" icon (src/components/source-info.ts). Every
 * entry is traced in the code on 14/10/2026: `url` is the address the seeder
 * or endpoint actually calls (or the DOI of a static dataset), `code` is the
 * file that calls it, so anyone can check the claim. When the code does not
 * declare a source, the entry says so instead of guessing.
 *
 * Keep it in step with the code: when a panel changes source, change it here.
 * tests/data-sources.test.mts checks that every panel of the thesis view and
 * every workspace section has an entry.
 */

import type { Feed } from '@/types';
import { STRATEGIC_GOODS, type SourcedFact } from './thesis-model';
import { POLICY_SCENARIOS, RESPONSE_ACTIONS } from './thesis-response';

export interface DataSource {
  /** What the panel shows from this source. */
  what: string;
  /** The source, as exactly as the code identifies it (institution, dataset, service). */
  source: string;
  /** Address called by the code, or the dataset page/DOI. */
  url?: string;
  /** Repository file that fetches or holds the data. */
  code?: string;
  note?: string;
}

// --- Shared entries -----------------------------------------------------------

const EMSC_TRIGGERS: DataSource = {
  what: 'Terremoti degli ultimi 30 giorni con magnitudo ≥ 4,5 (inneschi sismici)',
  source: 'EMSC – European-Mediterranean Seismological Centre, servizio FDSN event',
  url: 'https://www.seismicportal.eu/fdsnws/event/1/query',
  code: 'api/thesis/_catalogue.js',
  note: 'Se EMSC non risponde: USGS, servizio FDSN event (earthquake.usgs.gov/fdsnws/event/1/query). Se l’endpoint della tesi non risponde: feed USGS M4.5+ degli ultimi 7 giorni.',
};

const GDACS: DataSource = {
  what: 'Eventi naturali: vulcani, alluvioni, cicloni, siccità, incendi',
  source: 'GDACS – Global Disaster Alert and Coordination System, elenco eventi',
  url: 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP',
  code: 'scripts/seed-natural-events.mjs',
};

const EONET: DataSource = {
  what: 'Eventi naturali (stesso elenco)',
  source: 'NASA EONET v3 – Earth Observatory Natural Event Tracker',
  url: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  code: 'scripts/seed-natural-events.mjs',
};

const NHC: DataSource = {
  what: 'Cicloni tropicali (stesso elenco)',
  source: 'NOAA National Hurricane Center, servizio cartografico NHC_tropical_weather',
  url: 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer',
  code: 'scripts/seed-natural-events.mjs',
};

const PORTWATCH: DataSource = {
  what: 'Transiti giornalieri di navi nei chokepoint',
  source: 'IMF PortWatch, dataset Daily Chokepoints Data',
  url: 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query',
  code: 'scripts/seed-portwatch.mjs; riassunti in scripts/ais-relay.cjs',
};

const THESIS_REGISTRY: DataSource = {
  what: 'Nodi critici, beni esposti e regola del modello (nessun innesco → nessun rischio)',
  source: 'Registro della tesi (Cap. 1 e 3)',
  code: 'src/config/thesis-model.ts',
  note: 'Le fonti dei dati sui beni sono nel pannello Beni strategici.',
};

const N8N_DIGEST: DataSource[] = [
  {
    what: 'Temi “Attività sismica” e “Chokepoint”',
    source: 'USGS, feed GeoJSON dei terremoti M4.5+ dell’ultimo giorno (workflow n8n 02)',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
    code: 'n8n-workflows/02-usgs-seismic-ingestion.json',
  },
  {
    what: 'Tema “Commodity e dogane”: prezzi',
    source: 'Yahoo Finance, API dei grafici (workflow n8n 04)',
    url: 'https://query1.finance.yahoo.com/v8/finance/chart/',
    code: 'n8n-workflows/04-commodity-prices-ingestion.json',
  },
  {
    what: 'Tema “Commodity e dogane”: notizie',
    source: 'GDELT Project, DOC 2.0 API (workflow n8n 01)',
    url: 'https://api.gdeltproject.org/api/v2/doc/doc',
    code: 'n8n-workflows/01-gdelt-customs-ingestion.json',
    note: 'Il workflow 01 non esiste nell’istanza n8n (log di n8n-sync del 14/10/2026): oggi questo tema riceve solo i prezzi. GDELT è un segnale, non una misura del pericolo.',
  },
  {
    what: 'Tema “Concentrazione del commercio (HS4)”',
    source: 'UN Comtrade, dati bilaterali HS4 (workflow n8n 10, che legge /api/customs/comtrade)',
    url: 'https://comtradeapi.un.org/',
    code: 'n8n-workflows/10-comtrade-materializer.json; scripts/seed-comtrade-bilateral-hs4.mjs',
  },
  {
    what: 'Tema “Anomalie climatiche”',
    source: 'Open-Meteo, Historical Weather API (workflow n8n 03)',
    url: 'https://archive-api.open-meteo.com/v1/archive',
    code: 'n8n-workflows/03-climate-anomalies-ingestion.json',
  },
  {
    what: 'Tema “Monitor normativo UE”',
    source: 'EUR-Lex, ricerca (workflow n8n 06)',
    url: 'https://eur-lex.europa.eu/search.html',
    code: 'n8n-workflows/06-policy-monitor.json',
  },
];

// --- Sources derived from the thesis registries ------------------------------

function factSources(facts: Iterable<SourcedFact>, what: string, code: string): DataSource[] {
  const seen = new Map<string, DataSource>();
  for (const fact of facts) {
    if (fact.status !== 'verified' || !fact.source) continue;
    const key = `${fact.source}|${fact.url ?? ''}`;
    if (!seen.has(key)) seen.set(key, { what, source: fact.source, url: fact.url, code });
  }
  return [...seen.values()];
}

function strategicGoodsFacts(): SourcedFact[] {
  return STRATEGIC_GOODS.flatMap((g) => [...g.criticality, ...g.supply, ...g.modulators]);
}

function responseFacts(): SourcedFact[] {
  return [...RESPONSE_ACTIONS.map((a) => a.basis), ...POLICY_SCENARIOS.map((s) => s.basis)];
}

// --- Panels -------------------------------------------------------------------

export const PANEL_SOURCES: Record<string, DataSource[]> = {
  'risk-chain': [EMSC_TRIGGERS, GDACS, EONET, NHC, PORTWATCH, THESIS_REGISTRY],
  'trigger-monitor': [EMSC_TRIGGERS, GDACS, EONET, NHC, THESIS_REGISTRY],
  'node-hazards': [
    {
      what: 'Terremoti Mw ≥ 6 e ≥ 7 entro 300 km dal nodo, 1922-2021 (repliche incluse)',
      source: 'ISC-GEM Global Instrumental Earthquake Catalogue v12.1, International Seismological Centre (2025), CC-BY-SA 3.0',
      url: 'https://doi.org/10.31905/D808B825',
      code: 'src/config/node-hazards.ts (calcolo in research/hazard-stats/)',
    },
    {
      what: 'Eruzioni confermate dal 1922 e VEI massimo',
      source: 'Smithsonian Institution, Global Volcanism Program, Volcanoes of the World (vulcani olocenici v5.4.0; eruzioni confermate al 24/04/2026, VOTW v5.3.5)',
      url: 'https://doi.org/10.5479/si.GVP.VOTW5-2026.5.4',
      code: 'src/config/node-hazards.ts',
      note: 'Il DOI si riferisce alla versione 5.4.0 (elenco dei vulcani).',
    },
    {
      what: 'Distanza dal limite di placca più vicino',
      source: 'Bird (2003), modello di placche PB2002',
      url: 'https://doi.org/10.1029/2001GC000252',
      code: 'src/config/node-hazards.ts',
      note: 'Valori calcolati offline, come nella Tab. 3.4 della tesi.',
    },
  ],
  'strategic-goods': factSources(strategicGoodsFacts(), 'Criticità UE, fornitura e misure dei beni (fonte indicata voce per voce)', 'src/config/thesis-model.ts'),
  'response-outlook': [
    {
      what: 'Risposte suggerite (proof of concept): regole del prototipo, nessun dato esterno',
      source: 'Configurazione della tesi',
      code: 'src/config/thesis-response.ts',
    },
    ...factSources(responseFacts(), 'Base giuridica o fattuale delle risposte e degli scenari', 'src/config/thesis-response.ts'),
  ],
  'supply-chain': [
    { ...PORTWATCH, what: 'Scheda Chokepoint: transiti giornalieri' },
    {
      what: 'Scheda Chokepoint: avvisi alla navigazione',
      source: 'NGA (National Geospatial-Intelligence Agency, USA), Maritime Safety Information, broadcast warnings',
      url: 'https://msi.nga.mil/api/publications/broadcast-warn?output=json&status=A',
      code: 'server/worldmonitor/maritime/v1/list-navigational-warnings.ts',
    },
    {
      what: 'Scheda Chokepoint: flussi di petrolio di riferimento',
      source: 'EIA (U.S. Energy Information Administration), World Oil Transit Chokepoints',
      code: 'scripts/seed-chokepoint-baselines.mjs; scripts/seed-chokepoint-flows.mjs',
      note: 'Valori fissi nel seeder; il punteggio di disturbo e il livello di minaccia per chokepoint sono quelli dell’upstream WorldMonitor (server/worldmonitor/supply-chain/v1/_scoring.mjs).',
    },
    {
      what: 'Schede Noli e Indicatori',
      source: 'FRED, Federal Reserve Bank of St. Louis: serie PCU483111483111 e TSIFRGHT',
      url: 'https://api.stlouisfed.org/fred/series/observations',
      code: 'scripts/seed-supply-chain-trade.mjs',
    },
    {
      what: 'Scheda Noli: noli container',
      source: 'Shanghai Shipping Exchange: indici SCFI e CCFI',
      url: 'https://en.sse.net.cn/currentIndex',
      code: 'scripts/seed-supply-chain-trade.mjs',
    },
    {
      what: 'Scheda Noli: rinfuse secche',
      source: 'Indici Baltic BDI, BCI, BPI, BSI, BHSI, letti dalla pagina di handybulk.com (fonte secondaria)',
      url: 'https://www.handybulk.com/baltic-dry-index/',
      code: 'scripts/seed-supply-chain-trade.mjs',
    },
    {
      what: 'Scheda Minerali: produzione 2024 per paese',
      source: 'Valori fissi nel codice ereditato da WorldMonitor: il codice non dichiara la fonte',
      code: 'server/worldmonitor/supply-chain/v1/_minerals-data.ts',
      note: '[DA VERIFICARE] fonte da individuare prima di usare questi valori.',
    },
    {
      what: 'Scheda Stress: indice di stress dei noli',
      source: 'Yahoo Finance, quotazioni di armatori ed ETF del trasporto marittimo',
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/',
      code: 'scripts/ais-relay.cjs (Shipping Stress Index)',
    },
  ],
  climate: [
    {
      what: 'Anomalie di temperatura e precipitazione per zona climatica',
      source: 'Open-Meteo, Historical Weather API',
      url: 'https://archive-api.open-meteo.com/v1/archive',
      code: 'scripts/seed-climate-anomalies.mjs; scripts/_open-meteo-archive.mjs',
      note: 'Le normali di riferimento 1991-2020 vengono dalla stessa API (scripts/seed-climate-zone-normals.mjs).',
    },
  ],
  commodities: [
    {
      what: 'Quotazioni delle materie prime',
      source: 'Yahoo Finance, API dei grafici',
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/',
      code: 'scripts/seed-commodity-quotes.mjs',
    },
    {
      what: 'Scheda Cambi: cambi dell’euro',
      source: 'BCE, ECB Data Portal, dataset EXR',
      url: 'https://data-api.ecb.europa.eu/service/data/EXR',
      code: 'scripts/seed-ecb-fx-rates.mjs',
    },
  ],
  'trade-policy': [
    {
      what: 'Schede Restrizioni, Dazi, Flussi, Barriere',
      source: 'WTO Timeseries API: indicatori TP_A_0010, TP_A_0160, TP_A_0430, ITS_MTV_AX, ITS_MTV_AM',
      url: 'https://api.wto.org/timeseries/v1',
      code: 'scripts/seed-supply-chain-trade.mjs',
      note: 'La scheda Dazi è fissa sulla coppia USA (840) – Cina (156): issue #91.',
    },
    {
      what: 'Scheda Entrate: entrate doganali degli USA',
      source: 'U.S. Treasury, Monthly Treasury Statement, Table 9',
      url: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_9',
      code: 'scripts/seed-supply-chain-trade.mjs',
    },
    {
      what: 'Dazio effettivo degli USA',
      source: 'FRED: serie B235RC1Q027SBEA e A255RC1Q027SBEA (BEA)',
      url: 'https://fred.stlouisfed.org/series/B235RC1Q027SBEA',
      code: 'scripts/seed-supply-chain-trade.mjs',
    },
    {
      what: 'Scheda Comtrade: flussi commerciali per paese',
      source: 'UN Comtrade, API pubblica',
      url: 'https://comtradeapi.un.org/public/v1',
      code: 'scripts/seed-trade-flows.mjs',
    },
  ],
  'sanctions-pressure': [
    {
      what: 'Designazioni e liste delle sanzioni',
      source: 'U.S. Treasury, OFAC Sanctions List Service: lista SDN e lista consolidata (non-SDN), formato avanzato XML',
      url: 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/sdn_advanced.xml',
      code: 'scripts/seed-sanctions-pressure.mjs',
      note: 'Solo sanzioni USA: le misure UE mancano (issue #92).',
    },
  ],
  'gdelt-intel': [
    {
      what: 'Articoli per tema e andamento di tono e volume',
      source: 'GDELT Project, DOC 2.0 API',
      url: 'https://api.gdeltproject.org/api/v2/doc/doc',
      code: 'scripts/seed-gdelt-intel.mjs',
      note: 'GDELT è un segnale, non una misura del pericolo.',
    },
  ],
  'alert-feed': [
    ...N8N_DIGEST.map((s) => ({ ...s, note: s.note ?? 'Dal digest delle notifiche (/api/notify/digest).' })),
  ],
  map: [
    { ...THESIS_REGISTRY, what: 'Livello Nodi critici', note: undefined },
    { ...GDACS, what: 'Livello Eventi naturali' },
    { ...EONET, what: 'Livello Eventi naturali' },
    { ...NHC, what: 'Livello Eventi naturali' },
    {
      what: 'Terremoti sulla mappa (ultima settimana, M4.5+)',
      source: 'USGS, feed GeoJSON 4.5_week',
      url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
      code: 'scripts/seed-earthquakes.mjs',
      note: 'I pannelli degli inneschi usano invece EMSC.',
    },
    {
      what: 'Livelli Vie d’acqua strategiche e Rotte commerciali',
      source: 'Coordinate fisse nel codice ereditato da WorldMonitor: il codice non dichiara la fonte',
      code: 'src/config/geo.ts; src/config/trade-routes.ts',
    },
  ],
};

// --- News panels: the RSS feeds of their FEEDS category -----------------------

function feedAddress(feed: Feed): string | undefined {
  const raw = typeof feed.url === 'string' ? feed.url : Object.values(feed.url)[0];
  if (!raw) return undefined;
  // Feeds go through the server RSS proxy (`/api/rss-proxy?url=…`): show the
  // original address.
  try {
    const parsed = new URL(raw, 'https://risksentinel.invalid');
    const inner = parsed.searchParams.get('url');
    return inner ?? (raw.startsWith('http') ? raw : undefined);
  } catch {
    return undefined;
  }
}

function newsSources(category: string, catalog: Record<string, unknown>): DataSource[] {
  const feeds = catalog[category];
  if (!Array.isArray(feeds)) return [];
  return (feeds as Feed[]).map((feed) => ({
    what: 'Notizie (feed RSS)',
    source: feed.name,
    url: feedAddress(feed),
    code: 'src/config/feeds.ts',
  }));
}

/**
 * Sources of a dashboard panel: the registry first, then the RSS feeds of a
 * news category. `feeds` is the FEEDS catalogue (src/config/feeds.ts), passed
 * in by the caller so this module stays free of the Vite-only feed config.
 */
export function getPanelSources(panelId: string, feeds: Record<string, unknown> = {}): DataSource[] {
  // A news panel whose key clashes with another panel is created as `<key>-news`.
  return PANEL_SOURCES[panelId] ?? newsSources(panelId.replace(/-news$/, ''), feeds);
}

// --- Standalone workspaces (OSINT, Research, Policy) -------------------------

export const WORKSPACE_SOURCES: Record<string, DataSource[]> = {
  'osint.nodes': [
    { ...EMSC_TRIGGERS, what: 'Colonna Inneschi: terremoti entro il raggio di lavoro dal nodo' },
    { ...GDACS, what: 'Colonna Inneschi: eventi naturali vicino al nodo' },
    { ...EONET, what: 'Colonna Inneschi: eventi naturali vicino al nodo' },
    { ...NHC, what: 'Colonna Inneschi: cicloni tropicali vicino al nodo' },
    { ...PORTWATCH, what: 'Colonna Transiti: navi transitate oggi e variazione sulla settimana' },
    {
      what: 'Colonna Clima: anomalia di temperatura e precipitazione degli ultimi 7 giorni nella zona monitorata più vicina (entro il raggio di lavoro)',
      source: 'Open-Meteo, Historical Weather API (workflow n8n 03, 15 zone)',
      url: 'https://archive-api.open-meteo.com/v1/archive',
      code: 'n8n-workflows/03-climate-anomalies-ingestion.json; api/osint/signals.js',
    },
    { ...THESIS_REGISTRY, what: 'Colonna Catena: regola del modello (nessun innesco → nessun rischio)' },
  ],
  'osint.goods': [
    {
      what: 'Colonna Prezzo: futures sul bene; i titoli e gli ETF quotati sono segnati come indicatori indiretti',
      source: 'Yahoo Finance, API dei grafici; simboli e codici HS in shared/commodities.json',
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/',
      code: 'scripts/seed-commodity-quotes.mjs; api/osint/signals.js',
    },
    {
      what: 'Colonna Fornitori: quote dei primi tre paesi fornitori dell\u2019Italia per codice HS4',
      source: 'UN Comtrade, dati bilaterali HS4 (importatore: Italia)',
      url: 'https://comtradeapi.un.org/',
      code: 'scripts/seed-comtrade-bilateral-hs4.mjs; api/osint/signals.js',
    },
    {
      what: 'Colonna Misure: voci del registro Policy con lo stesso codice HS',
      source: 'Registro normativo del portale (fonti primarie voce per voce)',
      code: 'data/policy-registry.json',
    },
  ],
  'osint.feed': [
    { ...EMSC_TRIGGERS, what: 'Terremoti vicino ai nodi, dal più recente' },
    { ...GDACS, what: 'Eventi naturali vicino ai nodi' },
    { ...EONET, what: 'Eventi naturali vicino ai nodi' },
    { ...NHC, what: 'Cicloni tropicali vicino ai nodi' },
  ],
  'research.library': [
    {
      what: 'Bibliografia: metadati, strato del modello e livello di verifica',
      source: 'Bibliografia della tesi (thesis/references.bib) e registro delle fonti verificate (docs/FONTI_VERIFICATE.md), repository privato risk-sentinel-thesis',
      code: 'scripts/build-research-bibliography.mjs → data/zotero-sources.json',
    },
  ],
  'research.coverage': [
    {
      what: 'Copertura per strato e livello di verifica',
      source: 'Calcolata dalla bibliografia della tesi (stessa fonte della scheda Bibliografia)',
      code: 'src/apps/research/coverage.ts',
    },
  ],
  'research.news': [
    {
      what: 'Articoli recenti per parola chiave',
      source: 'OpenAlex, Works API',
      url: 'https://api.openalex.org/works',
      code: 'api/research/papers.js',
      note: 'Con la chiave OpenAlex del server si interroga prima OpenAlex, poi Crossref; senza chiave l’ordine è invertito.',
    },
    {
      what: 'Articoli recenti per parola chiave',
      source: 'Crossref, REST API',
      url: 'https://api.crossref.org/works',
      code: 'api/research/papers.js',
    },
  ],
  'research.calls': [
    {
      what: 'Conferenze e scadenze',
      source: 'Siti ufficiali di ciascuna conferenza (link nella scheda); una scadenza compare solo se verificata sul sito ufficiale',
      code: 'src/apps/research/calls.json',
    },
  ],
  'research.zotero': [
    {
      what: 'Libreria personale',
      source: 'Zotero Web API, libreria dell’utente configurata sul server',
      url: 'https://api.zotero.org/',
      code: 'api/zotero/library.js; api/zotero/items.js',
    },
    {
      what: 'Ricerca dei metadati per DOI o titolo',
      source: 'Crossref, REST API',
      url: 'https://api.crossref.org/works',
      code: 'api/research/doi.js',
    },
  ],
  'research.notes': [
    {
      what: 'Note personali',
      source: 'Scritte dall’utente e salvate sul server di Risk Sentinel (nessuna fonte esterna)',
      code: 'src/apps/research/state.ts (/api/prefs/research)',
    },
  ],
  'policy.registry': [
    {
      what: 'Registro normativo',
      source: 'Fonti primarie indicate voce per voce, con lo stato di verifica: EUR-Lex, data.europa.eu, Gazzetta Ufficiale, siti della Commissione europea e del SEAE, WTO',
      code: 'data/policy-registry.json',
    },
  ],
  'policy.goods': [
    {
      what: 'Colonna Misure: voci del registro normativo con lo stesso codice HS, con stato di verifica',
      source: 'Registro normativo del portale (fonti primarie voce per voce)',
      code: 'data/policy-registry.json; src/apps/policy/model.ts',
    },
    {
      what: 'Colonna Atti UE recenti: atti degli ultimi 30 giorni che nominano il bene nel titolo',
      source: 'Ufficio delle pubblicazioni dell\u2019UE, endpoint SPARQL (CELLAR)',
      url: 'https://publications.europa.eu/webapi/rdf/sparql',
      code: 'scripts/seed-policy-eu-acts.mjs',
    },
  ],
  'policy.monitor': [
    {
      what: 'Regolamenti, decisioni e direttive UE degli ultimi 30 giorni (titolo in italiano), filtrati per beni della tesi e misure commerciali',
      source: 'Ufficio delle pubblicazioni dell\u2019UE, endpoint SPARQL (CELLAR), la base dati di EUR-Lex',
      url: 'https://publications.europa.eu/webapi/rdf/sparql',
      code: 'scripts/seed-policy-eu-acts.mjs; scripts/_policy-eu-acts.mjs',
      note: 'Il collegamento a un bene è una parola chiave nel titolo. Il workflow n8n 06 (ricerca EUR-Lex) non trova nulla: EUR-Lex risponde alle richieste automatiche con una verifica anti-bot.',
    },
  ],
};
