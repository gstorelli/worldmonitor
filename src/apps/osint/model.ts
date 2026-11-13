/**
 * OSINT workspace model: the signal layer of the thesis model, tied to the
 * critical nodes and strategic goods. Pure functions, unit-tested in
 * tests/osint-model.test.mts; the workspace only renders their output.
 *
 * Signals anticipate and corroborate an impact on a node or a good; they never
 * measure a hazard (CLAUDE.md, rule 4).
 */

import type { ThesisNode, StrategicGood } from '@/config/thesis-model';
import { PROTOCOL_V0_1 } from '@/config/thesis-protocol';
import { sequencesGardnerKnopoff } from '@/services/thesis/engine';
import type { NodeChain, TriggerEvent } from '@/services/thesis/risk-chain';
import { haversineKm } from '@/services/thesis/risk-chain';

export interface OsintQuote {
  symbol: string;
  price: number | null;
  change: number | null;
}

export interface OsintClimateZone {
  zone: string;
  lat: number;
  lon: number;
  tempDelta: number | null;
  precipDelta: number | null;
  severity: string;
  type: string;
  period: string;
}

export interface OsintComtradeProduct {
  hs4: string;
  year: number | null;
  description: string;
  suppliers: Array<{ iso2: string | null; code: number | null; share: number | null }>;
}

/** v2: ERA5 daily mean of the last 7 days minus the zone's monthly normal (values only, no thresholds). */
export interface OsintEra5Zone {
  zone: string;
  lat: number;
  lon: number;
  tempDelta: number | null;
  precipDelta: number | null;
  period: string;
}

export interface OsintEuSupplyProduct {
  hs4: string;
  year: number | null;
  extraEuEur: number | null;
  supply: { hhi: number | null; nodeOrigins: string[]; nodeOriginShare: number | null } | null;
}

export interface OsintSource {
  status: string;
  fetchedAt: string | null;
  source: string;
}

export interface OsintSignalsPayload {
  generatedAt: string;
  status: Record<string, string>;
  quotes: OsintQuote[];
  /** v1 (n8n workflow 03), kept by the API for one release; no longer rendered. */
  climate?: OsintClimateZone[];
  comtradeIT: { reporter: string; fetchedAt: string | null; products: OsintComtradeProduct[] };
  climateEra5?: { baseline: string | null; sourceVersion: string | null; zones: OsintEra5Zone[] };
  euSupply?: { reporter: string; basis: string; products: OsintEuSupplyProduct[] };
  sources?: Record<string, OsintSource>;
}

export interface CommodityMeta {
  symbol: string;
  name: string;
  hsCode?: string;
}

export interface PolicyEntryLike {
  id: string;
  title: string;
  goods?: string[];
  role?: string;
  status?: string;
}

// --- Nodes --------------------------------------------------------------------

/** Nearest zone within `radiusKm` of the node, if any (ERA5 zones in the Signals tab). */
export function climateZoneForNode<Z extends { lat: number; lon: number }>(node: Pick<ThesisNode, 'lat' | 'lon'>, zones: readonly Z[], radiusKm: number): { zone: Z; distanceKm: number } | null {
  let best: { zone: Z; distanceKm: number } | null = null;
  for (const zone of zones) {
    const d = haversineKm(node.lat, node.lon, zone.lat, zone.lon);
    if (d <= radiusKm && (!best || d < best.distanceKm)) best = { zone, distanceKm: d };
  }
  return best;
}

export interface NodeRow {
  node: ThesisNode;
  state: NodeChain['state'];
  triggers: { count: number; significant: number; maxMagnitude: number | null; latest: TriggerEvent | null };
}

export function buildNodeRows(chains: readonly NodeChain[]): NodeRow[] {
  return chains.map((chain) => {
    const events = chain.matches.map((m) => m.event);
    const magnitudes = events.map((e) => e.magnitude).filter((m): m is number => typeof m === 'number');
    const latest = events.reduce<TriggerEvent | null>((acc, e) => (!acc || e.time > acc.time ? e : acc), null);
    return {
      node: chain.node,
      state: chain.state,
      triggers: {
        count: chain.matches.length,
        significant: chain.matches.filter((m) => m.significant).length,
        maxMagnitude: magnitudes.length ? Math.max(...magnitudes) : null,
        latest,
      },
    };
  });
}

/**
 * Header counts. Nodes overlap (Taiwan Strait, Hsinchu and Tainan, see
 * src/config/node-hazards.ts), so an event reaching several nodes counts once.
 */
export function distinctTriggerCounts(chains: readonly NodeChain[]): { nodesHit: number; events: number; significant: number } {
  const events = new Set<string>();
  const significant = new Set<string>();
  for (const chain of chains) {
    for (const m of chain.matches) {
      events.add(m.event.id);
      if (m.significant) significant.add(m.event.id);
    }
  }
  return { nodesHit: chains.filter((c) => c.matches.length > 0).length, events: events.size, significant: significant.size };
}

// --- Signals (anticipate or corroborate; never a trigger) -----------------------

export interface SignalNodeRow {
  node: ThesisNode;
  transit: NodeChain['transit'];
  era5: { zone: OsintEra5Zone; distanceKm: number } | null;
}

export function buildSignalNodeRows(chains: readonly NodeChain[], era5Zones: readonly OsintEra5Zone[], radiusKm: number): SignalNodeRow[] {
  return chains.map((chain) => ({ node: chain.node, transit: chain.transit, era5: climateZoneForNode(chain.node, era5Zones, radiusKm) }));
}

export function buildSupplyRows(goods: readonly StrategicGood[], products: readonly OsintEuSupplyProduct[]): Array<{ good: StrategicGood; product: OsintEuSupplyProduct | null }> {
  return goods.map((good) => ({ good, product: products.find((p) => p.hs4 === good.hs) ?? null }));
}

// --- Provenance ---------------------------------------------------------------

export const SOURCE_UNAVAILABLE = 'fonte non disponibile';

/** Only a 'hit' is a usable source; a 'miss', an 'error' or no record at all is not. */
export function isSourceAvailable(src: OsintSource | undefined | null): boolean {
  return src?.status === 'hit';
}

/** "aggiornato il 12/11/2026" for a hit, otherwise "fonte non disponibile". */
export function provenanceStatus(src: OsintSource | undefined | null): string {
  if (!src || !isSourceAvailable(src)) return SOURCE_UNAVAILABLE;
  const d = src.fetchedAt ? new Date(src.fetchedAt) : null;
  return d && Number.isFinite(d.getTime())
    ? `aggiornato il ${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}`
    : 'data di aggiornamento n.d.';
}

/** "Eurostat Comext DS-045409, aggiornato il 12/11/2026" or "fonte non disponibile". */
export function provenanceText(src: OsintSource | undefined | null): string {
  return src && isSourceAvailable(src) ? `${src.source}, ${provenanceStatus(src)}` : SOURCE_UNAVAILABLE;
}

/** Window of the earthquake catalogue actually loaded (EMSC 30 days, or the 7-day USGS fallback). */
export function quakeWindowLabel(s: { quakeWindowDays: number; quakeSource: string | null }): string {
  if (!s.quakeSource || !(s.quakeWindowDays > 0)) return 'catalogo dei terremoti non disponibile';
  return `terremoti degli ultimi ${s.quakeWindowDays} giorn${s.quakeWindowDays === 1 ? 'o' : 'i'} (${s.quakeSource})`;
}

// --- Goods --------------------------------------------------------------------

export interface PriceSignal {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  /** Futures on the good itself (`=F`) or a listed share/ETF used as an indirect indicator. */
  kind: 'futures' | 'proxy';
}

export interface GoodRow {
  good: StrategicGood;
  prices: PriceSignal[];
  imports: OsintComtradeProduct | null;
  measures: PolicyEntryLike[];
}

export function priceKind(symbol: string): PriceSignal['kind'] {
  return symbol.endsWith('=F') ? 'futures' : 'proxy';
}

export function buildGoodRows(
  goods: readonly StrategicGood[],
  quotes: readonly OsintQuote[],
  commodityMeta: readonly CommodityMeta[],
  comtrade: readonly OsintComtradeProduct[],
  policy: readonly PolicyEntryLike[],
): GoodRow[] {
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  return goods.map((good) => ({
    good,
    prices: commodityMeta
      .filter((m) => m.hsCode === good.hs)
      .map((m) => {
        const q = quoteBySymbol.get(m.symbol);
        return { symbol: m.symbol, name: m.name, price: q?.price ?? null, change: q?.change ?? null, kind: priceKind(m.symbol) };
      }),
    imports: comtrade.find((p) => p.hs4 === good.hs) ?? null,
    measures: policy.filter((e) => Array.isArray(e.goods) && e.goods.includes(good.hs)),
  }));
}

// --- Labels -------------------------------------------------------------------

/** Country name for a supplier; Comtrade aggregates without ISO code keep their numeric code. */
export function supplierLabel(s: { iso2: string | null; code: number | null }, displayNames?: { of(code: string): string | undefined }): string {
  if (s.iso2) {
    try {
      return displayNames?.of(s.iso2) ?? s.iso2;
    } catch {
      return s.iso2;
    }
  }
  return s.code !== null ? `codice Comtrade ${s.code}` : 'n.d.';
}

/** "Libia 21%, Azerbaigian 17%, Kazakistan 16%". */
export function importSentence(product: OsintComtradeProduct, displayNames?: { of(code: string): string | undefined }): string {
  return product.suppliers
    .filter((s) => typeof s.share === 'number')
    .map((s) => `${supplierLabel(s, displayNames)} ${Math.round((s.share as number) * 100)}%`)
    .join(', ');
}

// --- Trigger feed -------------------------------------------------------------

export interface SequenceRow {
  id: string;
  mainshock: TriggerEvent;
  memberCount: number;
  /** Latest member, epoch ms: the feed is sorted on it, newest first. */
  lastTime: number;
  /** Nodes reached by at least one member, nearest distance first. */
  nodes: Array<{ name: string; distanceKm: number; significant: boolean }>;
  significant: boolean;
  text: string;
}

function eventText(e: TriggerEvent): string {
  if (e.kind !== 'earthquake') return `${KIND_LABELS[e.kind] ?? e.kind}${e.alertLevel ? ` (allerta ${e.alertLevel})` : ''}`;
  const type = e.magnitudeType ? e.magnitudeType : 'tipo di magnitudo n.d.';
  return `Terremoto M${e.magnitude?.toFixed(1) ?? '?'} (${type})${e.depthKm != null ? `, ${Math.round(e.depthKm)} km di profondità` : ''}`;
}

/**
 * One row per Gardner-Knopoff sequence (engine.sequencesGardnerKnopoff) of the
 * events that reach at least one node, with the nodes it reaches. The grouping
 * is provisional (#144).
 */
export function buildSequenceRows(chains: readonly NodeChain[], limit = 30, foreshockFraction = PROTOCOL_V0_1.foreshockFraction): SequenceRow[] {
  const events = new Map<string, TriggerEvent>();
  const reach = new Map<string, Array<{ name: string; distanceKm: number; significant: boolean }>>();
  for (const chain of chains) {
    for (const m of chain.matches) {
      events.set(m.event.id, m.event);
      const list = reach.get(m.event.id) ?? [];
      list.push({ name: chain.node.name, distanceKm: m.distanceKm, significant: m.significant });
      reach.set(m.event.id, list);
    }
  }
  return sequencesGardnerKnopoff([...events.values()], foreshockFraction)
    .map((seq) => {
      const byNode = new Map<string, { name: string; distanceKm: number; significant: boolean }>();
      for (const e of seq.members) {
        for (const r of reach.get(e.id) ?? []) {
          const prev = byNode.get(r.name);
          byNode.set(r.name, { name: r.name, distanceKm: Math.min(prev?.distanceKm ?? Infinity, r.distanceKm), significant: Boolean(prev?.significant) || r.significant });
        }
      }
      const nodes = [...byNode.values()].sort((a, b) => a.distanceKm - b.distanceKm);
      const n = seq.members.length;
      return {
        id: seq.id,
        mainshock: seq.mainshock,
        memberCount: n,
        lastTime: Math.max(...seq.members.map((e) => e.time)),
        nodes,
        significant: nodes.some((x) => x.significant),
        text: `${eventText(seq.mainshock)} — ${seq.mainshock.title}${n > 1 ? ` · ${n} eventi nella sequenza` : ''}`,
      };
    })
    .sort((a, b) => b.lastTime - a.lastTime)
    .slice(0, limit);
}

const KIND_LABELS: Record<string, string> = {
  earthquake: 'Terremoto',
  volcano: 'Eruzione vulcanica',
  flood: 'Alluvione',
  cyclone: 'Ciclone',
  drought: 'Siccità',
  wildfire: 'Incendio',
};
