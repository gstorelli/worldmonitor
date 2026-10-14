/**
 * OSINT workspace model: the signal layer of the thesis model, tied to the
 * critical nodes and strategic goods. Pure functions, unit-tested in
 * tests/osint-model.test.mts; the workspace only renders their output.
 *
 * Signals anticipate and corroborate an impact on a node or a good; they never
 * measure a hazard (CLAUDE.md, rule 4).
 */

import type { ThesisNode, StrategicGood } from '@/config/thesis-model';
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

export interface OsintSignalsPayload {
  generatedAt: string;
  status: Record<string, string>;
  quotes: OsintQuote[];
  climate: OsintClimateZone[];
  comtradeIT: { reporter: string; fetchedAt: string | null; products: OsintComtradeProduct[] };
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

// --- Climate --------------------------------------------------------------------

/** "Normal" in the Open-Meteo pipeline: no anomaly to report. */
export function isClimateAnomaly(zone: OsintClimateZone): boolean {
  return Boolean(zone.severity) && !/NORMAL$/.test(zone.severity);
}

/** Nearest monitored climate zone within `radiusKm` of the node, if any. */
export function climateZoneForNode(node: Pick<ThesisNode, 'lat' | 'lon'>, zones: readonly OsintClimateZone[], radiusKm: number): { zone: OsintClimateZone; distanceKm: number } | null {
  let best: { zone: OsintClimateZone; distanceKm: number } | null = null;
  for (const zone of zones) {
    const d = haversineKm(node.lat, node.lon, zone.lat, zone.lon);
    if (d <= radiusKm && (!best || d < best.distanceKm)) best = { zone, distanceKm: d };
  }
  return best;
}

// --- Nodes --------------------------------------------------------------------

export interface NodeRow {
  node: ThesisNode;
  state: NodeChain['state'];
  triggers: { count: number; significant: number; maxMagnitude: number | null; latest: TriggerEvent | null };
  transit: NodeChain['transit'];
  climate: { zone: OsintClimateZone; distanceKm: number } | null;
}

export function buildNodeRows(chains: readonly NodeChain[], zones: readonly OsintClimateZone[], radiusKm: number): NodeRow[] {
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
      transit: chain.transit,
      climate: climateZoneForNode(chain.node, zones, radiusKm),
    };
  });
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

// --- Feed ---------------------------------------------------------------------

export interface FeedItem {
  time: number;
  nodeName: string;
  text: string;
  url?: string;
  source: string;
  significant: boolean;
}

/** Recent events near the nodes, newest first (one entry per event and node). */
export function buildFeed(chains: readonly NodeChain[], limit = 30): FeedItem[] {
  const items: FeedItem[] = [];
  for (const chain of chains) {
    for (const m of chain.matches) {
      const e = m.event;
      const what = e.kind === 'earthquake'
        ? `Terremoto M${e.magnitude?.toFixed(1) ?? '?'}${e.depthKm != null ? `, ${Math.round(e.depthKm)} km di profondità` : ''}`
        : `${KIND_LABELS[e.kind] ?? e.kind}${e.alertLevel ? ` (allerta ${e.alertLevel})` : ''}`;
      items.push({
        time: e.time,
        nodeName: chain.node.name,
        text: `${what} a ${Math.round(m.distanceKm)} km — ${e.title}`,
        url: e.url,
        source: e.source,
        significant: m.significant,
      });
    }
  }
  return items.sort((a, b) => b.time - a.time).slice(0, limit);
}

const KIND_LABELS: Record<string, string> = {
  earthquake: 'Terremoto',
  volcano: 'Eruzione vulcanica',
  flood: 'Alluvione',
  cyclone: 'Ciclone',
  drought: 'Siccità',
  wildfire: 'Incendio',
};
