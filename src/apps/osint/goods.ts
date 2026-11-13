/**
 * OSINT "Beni strategici" tab: the measured layers per good, each with its
 * provenance. Pure functions, unit-tested in tests/osint-goods.test.mts.
 *
 *  - S (supply): EU27 extra-EU indicators of /api/osint/signals (euSupply):
 *    supplier HHI and node-origin share. S is computed by the engine
 *    (supplyFromIndicators) only for goods with production-node origins;
 *    otherwise only the HHI is shown.
 *  - C (customs): channels with an incentive AS OF now from the dated Policy
 *    register (customsAsOf); the undated fallback is shown as a provisional
 *    present-day value ('live'), always labelled as such.
 *
 * The layers are never combined into one number (no R0, F1, F2): the
 * protocol of Year 2 is a proposal, not approved.
 */

import { customsTerm, supplyFromIndicators } from '@/services/thesis/engine';
import { customsAsOf, toEngineCustoms, type CustomsMeasure, type CustomsProvenance, type CustomsRegistry } from '@/services/thesis/customs-registry';
import type { OsintEuSupplyProduct } from './model';

// --- Labels -------------------------------------------------------------------

/** Comext partner shares of Italy: the partner is the country the goods come from, EU members included. */
export const ITALY_SHARES_LABEL = 'Italia, paese di provenienza (intra-UE incluso)';
/** Basis of the supply indicators (kept apart from the Italy shares). */
export const EU_SUPPLY_LABEL = 'UE27, importazioni extra-UE';
/** Every Yahoo quote: a market price is an indirect indicator of the good, not a measure of supply. */
export const PRICE_LABEL = 'indicatore indiretto (quotazione di mercato)';
export const NO_QUOTE = 'nessuna quotazione disponibile';
export const NO_NODE_SHARE = 'quota dei nodi: non applicabile (nessun nodo produttivo)';
export const SUPPLY_MISSING = 'indicatori non calcolati per questo bene';
export const LAYERS_NOTE = 'Strati misurati mostrati separatamente: non sono combinati in un punteggio finché il protocollo dell’Anno 2 non è approvato.';

export const CUSTOMS_PROVENANCE_LABELS: Record<CustomsProvenance, string> = {
  registry: 'dal registro datato',
  fallback: 'valore provvisorio, senza data di entrata in vigore',
  none: 'misure non elencate: C non calcolabile',
};

export const CHANNEL_LABELS: Record<string, string> = {
  origin: 'origine',
  value: 'valore',
  classification: 'classificazione',
};

const fmtNum = (x: number, digits = 2): string => x.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtPct = (x: number): string => `${Math.round(x * 100)}%`;

/** "2025-01-01" → "01/01/2025", without time zones; anything else is returned as is. */
export function isoDateIt(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

// --- S ------------------------------------------------------------------------

export interface SupplyLayer {
  available: boolean;
  year: number | null;
  hhi: number | null;
  nodeOrigins: string[];
  nodeOriginShare: number | null;
  /** Engine S; null when the good has no node origins or an indicator is missing. */
  s: number | null;
  /** Why S is not shown, if it is not. */
  note: string | null;
}

export function supplyLayer(product: OsintEuSupplyProduct | null): SupplyLayer {
  const sup = product?.supply ?? null;
  if (!product || !sup) return { available: false, year: product?.year ?? null, hhi: null, nodeOrigins: [], nodeOriginShare: null, s: null, note: SUPPLY_MISSING };
  const base = { available: true, year: product.year, hhi: sup.hhi, nodeOrigins: [...sup.nodeOrigins], nodeOriginShare: sup.nodeOriginShare };
  if (!sup.nodeOrigins.length) return { ...base, nodeOriginShare: null, s: null, note: NO_NODE_SHARE };
  if (sup.hhi === null || sup.nodeOriginShare === null) return { ...base, s: null, note: 'S non calcolabile: indicatore mancante' };
  return { ...base, s: supplyFromIndicators(sup.nodeOriginShare, sup.hhi), note: null };
}

/** "HHI 0,31 · quota dalle origini dei nodi (CL) 42% → S = 0,37 · anno 2025". */
export function supplyText(l: SupplyLayer): string {
  if (!l.available) return SUPPLY_MISSING;
  const parts = [`HHI ${l.hhi !== null ? fmtNum(l.hhi) : 'n.d.'}`];
  if (l.nodeOrigins.length) parts.push(`quota dalle origini dei nodi (${l.nodeOrigins.join(', ')}) ${l.nodeOriginShare !== null ? fmtPct(l.nodeOriginShare) : 'n.d.'}`);
  const head = parts.join(' · ') + (l.s !== null ? ` → S = ${fmtNum(l.s)}` : '');
  return [head, l.note, `anno ${l.year ?? 'n.d.'}`].filter(Boolean).join(' · ');
}

// --- C ------------------------------------------------------------------------

export interface CustomsLayer {
  provenance: CustomsProvenance;
  label: string;
  channels: string[] | null;
  measures: CustomsMeasure[];
  /** Engine C (share of channels with an incentive); null when not computable. */
  c: number | null;
}

export function customsLayer(registry: CustomsRegistry | null, hs: string, now: number): CustomsLayer {
  const r = customsAsOf(registry, hs, now);
  // Live tab: the undated fallback is a provisional present-day value, labelled as such.
  const engine = toEngineCustoms(r, hs, { fallback: 'live' });
  return {
    provenance: r.provenance,
    label: CUSTOMS_PROVENANCE_LABELS[r.provenance],
    channels: engine.channels ? [...engine.channels] : null,
    measures: r.measures,
    c: customsTerm(engine, now),
  };
}

/** "2 canali su 3 (origine, classificazione) → C = 0,67". */
export function customsText(l: CustomsLayer): string {
  if (!l.channels || l.c === null) return CUSTOMS_PROVENANCE_LABELS.none;
  const list = l.channels.map((ch) => CHANNEL_LABELS[ch] ?? ch).join(', ');
  return `${l.channels.length} canal${l.channels.length === 1 ? 'e' : 'i'} su 3${list ? ` (${list})` : ''} → C = ${fmtNum(l.c)}`;
}

/** "eu-reg-x (verificata, in vigore dal 01/01/2025, scade il 19/11/2026, CELEX 32025R0395)". */
export function measureText(m: CustomsMeasure): string {
  const bits = [m.statusCode, `in vigore dal ${isoDateIt(m.inForceFrom)}`];
  if (m.expiresOn) bits.push(`scade il ${isoDateIt(m.expiresOn)}`);
  if (m.celex) bits.push(`CELEX ${m.celex}`);
  return `${m.id} (${bits.join(', ')})`;
}
