/**
 * Response layer of the thesis model — FUTURE OUTLOOK, PROOF OF CONCEPT.
 *
 * The six-layer chain ends with a customs-risk alert (goods, origins, time
 * window). This file adds what an administration could do with it, on two
 * levels with very different status:
 *
 *  1. Administrative response (inside the customs mandate): review of risk
 *     profiles, attention notes to offices, sharing of risk information at EU
 *     level. Rule-based suggestions, shown only when a significant trigger hits
 *     a node with exposed goods; in the Bari pilot they would only be logged
 *     (shadow mode), never applied.
 *  2. Policy outlook (outside the customs mandate): tariff and trade-defence
 *     changes are MODULATORS of the model. They are explored as "what if"
 *     scenarios on the incentive to misdeclare (direction only, no magnitude),
 *     never as recommendations. A modulator alone creates no induced risk.
 *
 * Nothing here is validated. No weights, no scores, no invented figures: every
 * legal or factual basis is a SourcedFact, verified or explicitly `todo`.
 */
import type { LocalText, SourcedFact } from './thesis-model';

/** The three ways a scarce good can be misdeclared at the frontier. */
export type MisdeclarationChannel = 'origin' | 'value' | 'classification';

export const CHANNELS: readonly MisdeclarationChannel[] = ['origin', 'value', 'classification'];

/** Administrative level of a suggested response. */
export type ResponseLevel = 'office' | 'national' | 'eu';

export interface ResponseAction {
  id: string;
  level: ResponseLevel;
  /** Channel addressed; `capacity` = the office-capacity component of customs vulnerability. */
  channel: MisdeclarationChannel | 'capacity';
  /** `{hs}` is replaced with the HS heading. */
  text: LocalText;
  basis: SourcedFact;
}

const UCC_46: SourcedFact = {
  text: { it: 'Controlli basati sull’analisi dei rischi', en: 'Risk-based customs controls' },
  source: 'Reg. (UE) 952/2013 (CDU), art. 46',
  url: 'https://eur-lex.europa.eu/eli/reg/2013/952/oj',
  status: 'verified',
};

const CDC: SourcedFact = {
  text: { it: 'Profili di rischio centrali e locali nel Circuito Doganale di Controllo', en: 'Central and local risk profiles in the customs control circuit (CDC)' },
  source: 'ADM, Libro Blu 2022; Circolare 19/2025',
  status: 'verified',
};

const CRMS: SourcedFact = {
  text: { it: 'Scambio di informazioni di rischio tra Stati membri (CRMS)', en: 'Exchange of risk information between Member States (CRMS)' },
  source: 'DG TAXUD, Customs Risk Management Framework',
  url: 'https://taxation-customs.ec.europa.eu/customs/customs-risk-management/customs-risk-management-framework-crmf_en',
  status: 'verified',
};

const ADM_NOTE: SourcedFact = {
  text: {
    it: 'Forma e canale di una nota o circolare di attenzione agli uffici: da definire con ADM',
    en: 'Form and channel of an attention note or circular to offices: to be defined with ADM',
  },
  status: 'todo',
};

/** Suggested responses by channel. Generic and rule-based: the PoC does not rank them. */
export const RESPONSE_ACTIONS: readonly ResponseAction[] = [
  {
    id: 'origin-profile',
    level: 'office',
    channel: 'origin',
    text: {
      it: 'Rivedere i profili di rischio sull’origine per HS {hs}: origini terze comparse di recente, trasbordi, prove dell’origine',
      en: 'Review origin risk profiles for HS {hs}: recently appearing third origins, transhipment, proofs of origin',
    },
    basis: CDC,
  },
  {
    id: 'value-profile',
    level: 'office',
    channel: 'value',
    text: {
      it: 'Confrontare il valore dichiarato per HS {hs} con i valori unitari recenti (Comext) prima dello svincolo',
      en: 'Compare declared values for HS {hs} with recent unit values (Comext) before release',
    },
    basis: UCC_46,
  },
  {
    id: 'classification-profile',
    level: 'office',
    channel: 'classification',
    text: {
      it: 'Verificare la classificazione tra HS {hs} e le voci contigue (prodotti intermedi o sostitutivi)',
      en: 'Check classification between HS {hs} and neighbouring headings (intermediate or substitute products)',
    },
    basis: UCC_46,
  },
  {
    id: 'capacity-check',
    level: 'national',
    channel: 'capacity',
    text: {
      it: 'Valutare la capacità degli uffici che possono ricevere flussi deviati di HS {hs}',
      en: 'Assess the capacity of the offices likely to receive diverted flows of HS {hs}',
    },
    basis: CDC,
  },
  {
    id: 'attention-note',
    level: 'national',
    channel: 'origin',
    text: {
      it: 'Nota di attenzione agli uffici su HS {hs} per la finestra di arrivo stimata',
      en: 'Attention note to offices on HS {hs} for the estimated arrival window',
    },
    basis: ADM_NOTE,
  },
  {
    id: 'crms-share',
    level: 'eu',
    channel: 'origin',
    text: {
      it: 'Condividere l’informazione di rischio su HS {hs} con gli altri Stati membri',
      en: 'Share the risk information on HS {hs} with the other Member States',
    },
    basis: CRMS,
  },
];

/**
 * Channels through which scarcity of each good is most likely to turn into
 * misdeclaration, with the modulator that motivates them. Goods whose measures
 * are not yet listed get no channel: the PoC says so instead of guessing.
 */
export interface GoodChannels {
  hs: string;
  channels: MisdeclarationChannel[];
  why: LocalText;
}

export const GOOD_CHANNELS: readonly GoodChannels[] = [
  {
    hs: '8542',
    channels: ['origin', 'classification'],
    why: {
      it: 'Voci prioritarie contro l’aggiramento delle sanzioni: il rischio passa da origine, uso finale e classificazione, non dal dazio',
      en: 'Priority items against sanctions circumvention: the risk runs through origin, end use and classification, not through the duty',
    },
  },
  {
    hs: '7502',
    channels: ['origin', 'classification'],
    why: {
      it: 'Il divieto di export indonesiano sposta il prodotto tra codici (minerale, intermedi, inox); l’antidumping UE sull’inox crea differenziali tra origini',
      en: 'Indonesia’s export ban shifts the product between codes (ore, intermediates, stainless steel); EU anti-dumping on stainless steel creates differentials between origins',
    },
  },
];

/** Kinds of measure change explored by the policy outlook. */
export type MeasureKind = 'origin-specific' | 'erga-omnes-duty' | 'export-restriction';
export type MeasureChange = 'introduce' | 'remove' | 'raise' | 'lower';

export interface PolicyScenario {
  id: string;
  hs: string;
  kind: MeasureKind;
  change: MeasureChange;
  label: LocalText;
  basis: SourcedFact;
}

/** Scenarios built on measures already documented in the registry; none is a forecast. */
export const POLICY_SCENARIOS: readonly PolicyScenario[] = [
  {
    id: 'inox-ad-expiry',
    hs: '7502',
    kind: 'origin-specific',
    change: 'remove',
    label: {
      it: 'L’antidumping UE sull’inox laminato a freddo da India e Indonesia scade senza rinnovo',
      en: 'The EU anti-dumping duty on cold-rolled stainless steel from India and Indonesia expires without renewal',
    },
    basis: { text: { it: 'Misura in vigore (prodotto a valle del nichel)', en: 'Measure in force (downstream of nickel)' }, source: 'Reg. di esecuzione (UE) 2021/2012', status: 'verified' },
  },
  {
    id: 'indonesia-ban-lifted',
    hs: '7502',
    kind: 'export-restriction',
    change: 'remove',
    label: {
      it: 'L’Indonesia revoca il divieto di export del minerale di nichel',
      en: 'Indonesia lifts its nickel ore export ban',
    },
    basis: { text: { it: 'Divieto dal 2020; contenzioso WTO DS592', en: 'Ban since 2020; WTO dispute DS592' }, source: 'WTO DS592', url: 'https://www.wto.org/english/tratop_e/dispu_e/cases_e/ds592_e.htm', status: 'verified' },
  },
  {
    id: 'chpl-extension',
    hs: '8542',
    kind: 'origin-specific',
    change: 'introduce',
    label: {
      it: 'Nuove restrizioni UE sulle voci 8542 verso origini o destinazioni a rischio di aggiramento',
      en: 'New EU restrictions on 8542 items towards origins or destinations at risk of circumvention',
    },
    basis: { text: { it: 'Voci 8542.31-39 nel Tier 1 della lista UE', en: 'Items 8542.31-39 in Tier 1 of the EU list' }, source: 'European Commission, 2024', url: 'https://finance.ec.europa.eu/publications/list-common-high-priority-items_en', status: 'verified' },
  },
  {
    id: 'tariff-suspension',
    hs: '*',
    kind: 'erga-omnes-duty',
    change: 'lower',
    label: {
      it: 'Sospensione tariffaria autonoma UE per una materia prima strategica in caso di scarsità',
      en: 'EU autonomous tariff suspension for a strategic raw material in case of scarcity',
    },
    basis: {
      text: {
        it: 'Competenza UE sulla tariffa doganale comune (Consiglio su proposta della Commissione): da verificare sul TFUE prima di citarla',
        en: 'EU competence on the Common Customs Tariff (Council on a Commission proposal): to be checked in the TFEU before citing',
      },
      status: 'todo',
    },
  },
];
