/**
 * Thesis model registry: the critical nodes, strategic goods and modulators of
 * the six-layer model (see CLAUDE.md and docs/thesis/ARCHITECTURE-THESIS.md).
 *
 * Rules for this file:
 *  - every figure carries its source; a fact without a verified source is a
 *    `todo` entry, never a number;
 *  - nothing here is a weight or a score: the thresholds below are working
 *    choices of the thesis, documented as such, to be calibrated in Year 2.
 */
import { NODE_HAZARDS, NODE_HAZARD_RADIUS_KM, type NodeHazard } from './node-hazards';

/** Bilingual text: the UI picks `it` or `en` from the active language. */
export interface LocalText {
  it: string;
  en: string;
}

export interface SourcedFact {
  text: LocalText;
  /** Short citation shown to the user (author/institution, year). */
  source?: string;
  url?: string;
  /** `todo` = a placeholder the thesis still has to fill. */
  status: 'verified' | 'todo';
}

/**
 * Working thresholds of the trigger layer. They match the choices used for the
 * hazard statistics of Chapter 1 (radius 300 km, Mw >= 6 as "significant") and
 * are NOT validated parameters.
 */
export const TRIGGER_WORKING_RULES = {
  radiusKm: NODE_HAZARD_RADIUS_KM,
  significantMw: 6,
  /** Live catalogue window (days) requested from /api/thesis/triggers. */
  windowDays: 30,
  minMagnitude: 4.5,
} as const;

export interface ThesisNode extends NodeHazard {
  /** Id in the supply-chain chokepoint registry (IMF PortWatch transits). */
  chokepointId: string | null;
  /** HS headings of strategic goods produced in the node (production areas only). */
  goods: string[];
}

const CHOKEPOINT_IDS: Record<string, string> = {
  suez: 'suez',
  'bab-el-mandeb': 'bab_el_mandeb',
  hormuz: 'hormuz_strait',
  malacca: 'malacca_strait',
  'taiwan-strait': 'taiwan_strait',
  panama: 'panama',
  gibraltar: 'gibraltar',
};

const NODE_GOODS: Record<string, string[]> = {
  antofagasta: ['7403'],
  morowali: ['7502'],
  'weda-bay': ['7502'],
  hsinchu: ['8542'],
  tainan: ['8542'],
};

export const THESIS_NODES: readonly ThesisNode[] = NODE_HAZARDS.map((n) => ({
  ...n,
  chokepointId: CHOKEPOINT_IDS[n.id] ?? null,
  goods: NODE_GOODS[n.id] ?? [],
}));

export interface StrategicGood {
  hs: string;
  label: LocalText;
  /** Detailed subheadings relevant to controls. */
  detail?: LocalText;
  /** EU criticality (CRMA status or equivalent). */
  criticality: SourcedFact[];
  /** Supply vulnerability evidence (dependence, concentration). */
  supply: SourcedFact[];
  /** Modulators in force: trade defence, sanctions, producer-country policy. */
  modulators: SourcedFact[];
  /** Production-area nodes of the perimeter. */
  nodes: string[];
  /** First chains of the Bari pilot. */
  pilot?: boolean;
}

const CRMA = 'Reg. (UE) 2024/1252; JRC RMIS';
const CRMA_URL = 'https://rmis.jrc.ec.europa.eu/critical-and-strategic-materials';
const USGS_MCS = 'USGS, Mineral Commodity Summaries 2026';
const USGS_MCS_URL = 'https://pubs.usgs.gov/periodicals/mcs2026/';
const ADSP = 'AdSP Mare Adriatico Meridionale, 7/11/2025';
const ADSP_URL = 'https://www.assoporti.it/media/16487/adsp-mare-adriatico-meridiodale-cs-07112025.pdf';

const todo = (it: string, en: string): SourcedFact => ({ text: { it, en }, status: 'todo' });

export const STRATEGIC_GOODS: readonly StrategicGood[] = [
  {
    hs: '8542',
    label: { it: 'Circuiti integrati (chip)', en: 'Integrated circuits (chips)' },
    detail: { it: '8542.31 processori · .32 memorie · .33 amplificatori · .39 altri', en: '8542.31 processors · .32 memories · .33 amplifiers · .39 other' },
    criticality: [
      {
        text: { it: 'Tier 1 della List of Common High Priority Items (versione febbraio 2024)', en: 'Tier 1 of the List of Common High Priority Items (February 2024 version)' },
        source: 'European Commission, 2024',
        url: 'https://finance.ec.europa.eu/publications/list-common-high-priority-items_en',
        status: 'verified',
      },
      {
        text: { it: 'Non è una materia prima: fuori dal CRMA; dipendenza da valutare con il metodo SWD(2021) 352', en: 'Not a raw material: outside the CRMA; dependence to be assessed with the SWD(2021) 352 method' },
        source: 'European Commission, SWD(2021) 352',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021SC0352',
        status: 'verified',
      },
    ],
    supply: [
      {
        text: { it: 'Import extra-UE 2024: 37,6 mld €; Taiwan 21,8%, Malesia 17,5%, Cina 11,7%', en: 'Extra-EU imports 2024: EUR 37.6 bn; Taiwan 21.8%, Malaysia 17.5%, China 11.7%' },
        source: 'Eurostat Comext DS-045409 (own calculation)',
        status: 'verified',
      },
      {
        text: { it: 'Capacità produttiva sotto i 10 nm: 92% a Taiwan, 8% in Corea del Sud (2019)', en: 'Manufacturing capacity below 10 nm: 92% Taiwan, 8% South Korea (2019)' },
        source: 'BCG & SIA, 2021',
        url: 'https://www.semiconductors.org/wp-content/uploads/2021/05/BCG-x-SIA-Strengthening-the-Global-Semiconductor-Value-Chain-April-2021_1.pdf',
        status: 'verified',
      },
    ],
    modulators: [
      {
        text: { it: 'Sanzioni alla Russia: voci HS 8542 prioritarie contro l’aggiramento (origine, duplice uso)', en: 'Russia sanctions: HS 8542 prioritised against circumvention (origin, dual use)' },
        source: 'European Commission, 2024',
        url: 'https://finance.ec.europa.eu/publications/list-common-high-priority-items_en',
        status: 'verified',
      },
      todo('Dazio convenzionale UE: da verificare in TARIC (atteso 0%, accordo ITA)', 'EU conventional duty: to be checked in TARIC (expected 0%, ITA agreement)'),
    ],
    nodes: ['hsinchu', 'tainan'],
  },
  {
    hs: '7403',
    label: { it: 'Rame raffinato', en: 'Refined copper' },
    detail: { it: 'da valutare anche i concentrati (HS 2603)', en: 'concentrates (HS 2603) also to be assessed' },
    criticality: [
      { text: { it: 'Materia prima strategica e critica (CRMA)', en: 'Strategic and critical raw material (CRMA)' }, source: CRMA, url: CRMA_URL, status: 'verified' },
    ],
    supply: [
      { text: { it: 'Cile: 5,3 dei 23 Mt di rame estratti nel mondo nel 2025', en: 'Chile: 5.3 of the 23 Mt of copper mined worldwide in 2025' }, source: USGS_MCS, url: USGS_MCS_URL, status: 'verified' },
      todo('Dipendenza UE per origine: da calcolare su Comext', 'EU dependence by origin: to be computed on Comext'),
    ],
    modulators: [todo('Misure in vigore: da censire (TARIC, difesa commerciale)', 'Measures in force: to be listed (TARIC, trade defence)')],
    nodes: ['antofagasta'],
  },
  {
    hs: '7502',
    label: { it: 'Nichel greggio', en: 'Unwrought nickel' },
    detail: { it: 'da valutare i prodotti intermedi (ferronichel, matte)', en: 'intermediate products (ferronickel, matte) to be assessed' },
    criticality: [
      { text: { it: 'Nichel di grado batteria: materia prima strategica e critica (CRMA)', en: 'Battery-grade nickel: strategic and critical raw material (CRMA)' }, source: CRMA, url: CRMA_URL, status: 'verified' },
    ],
    supply: [
      { text: { it: 'Indonesia: 2,6 dei 3,9 Mt di nichel prodotti nel mondo nel 2025', en: 'Indonesia: 2.6 of the 3.9 Mt of nickel produced worldwide in 2025' }, source: USGS_MCS, url: USGS_MCS_URL, status: 'verified' },
    ],
    modulators: [
      { text: { it: 'Indonesia: divieto di export del minerale di nichel dal 1° gennaio 2020', en: 'Indonesia: nickel ore export ban since 1 January 2020' }, source: 'Al Jazeera, 2/9/2019', status: 'verified' },
      { text: { it: 'WTO DS592 (ricorso UE): il panel ha giudicato il divieto contrario alle regole (30/11/2022); appello dell’Indonesia', en: 'WTO DS592 (EU complaint): panel found the ban inconsistent (30/11/2022); appealed by Indonesia' }, source: 'WTO DS592', url: 'https://www.wto.org/english/tratop_e/dispu_e/cases_e/ds592_e.htm', status: 'verified' },
      { text: { it: 'Antidumping UE sull’acciaio inox laminato a freddo da India e Indonesia (prodotto a valle)', en: 'EU anti-dumping on cold-rolled stainless steel from India and Indonesia (downstream product)' }, source: 'Reg. di esecuzione (UE) 2021/2012', status: 'verified' },
    ],
    nodes: ['morowali', 'weda-bay'],
  },
  {
    hs: '7601',
    label: { it: 'Alluminio greggio', en: 'Unwrought aluminium' },
    criticality: [
      { text: { it: 'Bauxite / allumina / alluminio: materia prima strategica e critica (CRMA)', en: 'Bauxite / alumina / aluminium: strategic and critical raw material (CRMA)' }, source: CRMA, url: CRMA_URL, status: 'verified' },
    ],
    supply: [todo('Dipendenza UE per origine: da calcolare su Comext', 'EU dependence by origin: to be computed on Comext')],
    modulators: [todo('Misure in vigore: da censire', 'Measures in force: to be listed')],
    nodes: [],
  },
  {
    hs: '2709',
    label: { it: 'Greggio', en: 'Crude oil' },
    detail: { it: 'sottovoci e derivati (2710) da dettagliare nel Cap. 3', en: 'subheadings and derivatives (2710) to be detailed in Ch. 3' },
    criticality: [todo('Fuori dal CRMA: indicatore di fornitura da costruire (SWD(2021) 352)', 'Outside the CRMA: supply indicator to be built (SWD(2021) 352)')],
    supply: [todo('Dipendenza UE e Italia per origine e rotta: da calcolare (Comext, PortWatch)', 'EU and Italian dependence by origin and route: to be computed (Comext, PortWatch)')],
    modulators: [todo('Sanzioni e price cap: da censire con fonte', 'Sanctions and price cap: to be listed with sources')],
    nodes: [],
  },
  {
    hs: '2711',
    label: { it: 'Gas naturale e GNL', en: 'Natural gas and LNG' },
    criticality: [todo('Fuori dal CRMA: indicatore di fornitura da costruire (SWD(2021) 352)', 'Outside the CRMA: supply indicator to be built (SWD(2021) 352)')],
    supply: [todo('Dipendenza UE e Italia per origine e rotta: da calcolare', 'EU and Italian dependence by origin and route: to be computed')],
    modulators: [todo('Misure in vigore: da censire', 'Measures in force: to be listed')],
    nodes: [],
  },
  {
    hs: '1001',
    label: { it: 'Grano', en: 'Wheat' },
    criticality: [todo('Fuori dal CRMA: indicatore di fornitura da costruire (SWD(2021) 352)', 'Outside the CRMA: supply indicator to be built (SWD(2021) 352)')],
    supply: [
      { text: { it: 'Porto di Bari, gen–set 2025: rinfuse solide oltre 1,7 Mt (+30%), trainate dai cereali (+40%)', en: 'Port of Bari, Jan–Sep 2025: solid bulk above 1.7 Mt (+30%), driven by cereals (+40%)' }, source: ADSP, url: ADSP_URL, status: 'verified' },
      todo('Flussi dell’Ufficio di Bari per HS e origine: dato ADM (Anno 3)', 'Bari office flows by HS and origin: ADM data (Year 3)'),
    ],
    modulators: [todo('Misure in vigore: da censire', 'Measures in force: to be listed')],
    nodes: [],
    pilot: true,
  },
  {
    hs: '3105',
    label: { it: 'Fertilizzanti', en: 'Fertilisers' },
    criticality: [todo('Fuori dal CRMA: indicatore di fornitura da costruire (SWD(2021) 352)', 'Outside the CRMA: supply indicator to be built (SWD(2021) 352)')],
    supply: [
      { text: { it: 'Porto di Bari, gen–set 2025: prodotti chimici +27%', en: 'Port of Bari, Jan–Sep 2025: chemical products +27%' }, source: ADSP, url: ADSP_URL, status: 'verified' },
      todo('Flussi dell’Ufficio di Bari per HS e origine: dato ADM (Anno 3)', 'Bari office flows by HS and origin: ADM data (Year 3)'),
    ],
    modulators: [todo('Misure in vigore: da censire', 'Measures in force: to be listed')],
    nodes: [],
    pilot: true,
  },
];

export function getStrategicGood(hs: string): StrategicGood | undefined {
  return STRATEGIC_GOODS.find((g) => g.hs === hs);
}

export function localText(text: LocalText, lang: string): string {
  return lang.toLowerCase().startsWith('it') ? text.it : text.en;
}
