/**
 * Pure logic of the thesis six-layer chain (no DOM, no fetch): matches measured
 * trigger events to critical nodes and applies the gate rule of the model —
 * no trigger hitting a node, or no exposed goods, means no induced risk.
 *
 * Nothing here is a weighted score. The output is a qualitative state with the
 * evidence that produced it, so that every state can be traced to records.
 */
import { TRIGGER_WORKING_RULES, type ThesisNode } from '@/config/thesis-model';

export type TriggerKind = 'earthquake' | 'volcano' | 'flood' | 'cyclone' | 'drought' | 'wildfire' | 'other';

/** A measured trigger event, normalised from EMSC/USGS or GDACS records. */
export interface TriggerEvent {
  id: string;
  kind: TriggerKind;
  source: string;
  title: string;
  lat: number;
  lon: number;
  /** Epoch milliseconds. */
  time: number;
  /** Moment or local magnitude for earthquakes. */
  magnitude?: number;
  magnitudeType?: string;
  depthKm?: number;
  /** GDACS alert level for non-seismic triggers. */
  alertLevel?: 'red' | 'orange' | 'green' | null;
  url?: string;
}

export interface NodeTriggerMatch {
  event: TriggerEvent;
  distanceKm: number;
  significant: boolean;
}

export type ChainState = 'none' | 'monitor' | 'assess';

export interface NodeTransitStatus {
  dataAvailable: boolean;
  todayTotal: number;
  wowChangePct: number;
}

export interface NodeChain {
  node: ThesisNode;
  matches: NodeTriggerMatch[];
  transit: NodeTransitStatus | null;
  state: ChainState;
  /** Machine-readable reasons, rendered by the UI. */
  reasons: string[];
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a single event is a significant trigger under the working rules. */
export function isSignificant(event: TriggerEvent, rules = TRIGGER_WORKING_RULES): boolean {
  if (event.kind === 'earthquake') return (event.magnitude ?? 0) >= rules.significantMw;
  return event.alertLevel === 'red' || event.alertLevel === 'orange';
}

export function matchEventsToNode(
  node: Pick<ThesisNode, 'lat' | 'lon'>,
  events: readonly TriggerEvent[],
  rules = TRIGGER_WORKING_RULES,
): NodeTriggerMatch[] {
  const out: NodeTriggerMatch[] = [];
  for (const event of events) {
    if (!Number.isFinite(event.lat) || !Number.isFinite(event.lon)) continue;
    const distanceKm = haversineKm(node.lat, node.lon, event.lat, event.lon);
    if (distanceKm <= rules.radiusKm) out.push({ event, distanceKm, significant: isSignificant(event, rules) });
  }
  return out.sort((a, b) => Number(b.significant) - Number(a.significant) || b.event.time - a.event.time);
}

/**
 * Gate rule of the model, applied per node:
 *  - `none`    no trigger within the node zone: no induced customs risk;
 *  - `monitor` triggers present but none significant: signal only;
 *  - `assess`  a significant trigger hits the node: the analyst assesses an
 *              alert for the strategic goods exposed through it.
 */
export function buildNodeChain(
  node: ThesisNode,
  events: readonly TriggerEvent[],
  transit: NodeTransitStatus | null,
  rules = TRIGGER_WORKING_RULES,
): NodeChain {
  const matches = matchEventsToNode(node, events, rules);
  const reasons: string[] = [];
  let state: ChainState = 'none';
  if (matches.some((m) => m.significant)) {
    state = 'assess';
    reasons.push('significant-trigger');
  } else if (matches.length) {
    state = 'monitor';
    reasons.push('minor-trigger');
  } else {
    reasons.push('no-trigger');
  }
  if (node.kind === 'production' && node.goods.length === 0) reasons.push('no-goods');
  return { node, matches, transit, state, reasons };
}

export function buildChains(
  nodes: readonly ThesisNode[],
  events: readonly TriggerEvent[],
  transitByChokepoint: ReadonlyMap<string, NodeTransitStatus>,
  rules = TRIGGER_WORKING_RULES,
): NodeChain[] {
  return nodes.map((n) =>
    buildNodeChain(n, events, n.chokepointId ? transitByChokepoint.get(n.chokepointId) ?? null : null, rules),
  );
}

const GDACS_KIND: Record<string, TriggerKind> = {
  volcanoes: 'volcano',
  floods: 'flood',
  severeStorms: 'cyclone',
  drought: 'drought',
  wildfires: 'wildfire',
};

/** GDACS alert level from the seeded natural-event title prefix (red/orange circle emoji). */
export function gdacsAlertFromTitle(title: string): 'red' | 'orange' | null {
  if (title.startsWith('\u{1F534}')) return 'red';
  if (title.startsWith('\u{1F7E0}')) return 'orange';
  return null;
}

export interface NaturalEventLike {
  id: string;
  title: string;
  category: string;
  lat: number;
  lon: number;
  date: Date | number;
  sourceName?: string;
  sourceUrl?: string;
}

/** Non-seismic triggers from the natural-events feed (GDACS, EONET, NHC); earthquakes come from the catalogue. */
export function naturalEventsToTriggers(events: readonly NaturalEventLike[]): TriggerEvent[] {
  const out: TriggerEvent[] = [];
  for (const e of events) {
    const kind = GDACS_KIND[e.category];
    if (!kind) continue;
    const time = e.date instanceof Date ? e.date.getTime() : Number(e.date);
    out.push({
      id: e.id,
      kind,
      source: e.sourceName || 'GDACS',
      title: e.title.replace(/^[\u{1F534}\u{1F7E0}]\s*/u, ''),
      lat: e.lat,
      lon: e.lon,
      time: Number.isFinite(time) ? time : 0,
      alertLevel: gdacsAlertFromTitle(e.title),
      url: e.sourceUrl || undefined,
    });
  }
  return out;
}

export interface CatalogueQuake {
  id: string;
  time: number;
  lat: number;
  lon: number;
  depthKm: number | null;
  mag: number;
  magType: string;
  place: string;
  url?: string;
  source: string;
}

export function quakesToTriggers(quakes: readonly CatalogueQuake[]): TriggerEvent[] {
  return quakes.map((q) => ({
    id: q.id,
    kind: 'earthquake' as const,
    source: q.source,
    title: q.place,
    lat: q.lat,
    lon: q.lon,
    time: q.time,
    magnitude: q.mag,
    magnitudeType: q.magType,
    depthKm: q.depthKm ?? undefined,
    url: q.url,
  }));
}
