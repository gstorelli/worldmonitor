/**
 * Loads the measured inputs of the thesis chain once and shares them between
 * the thesis panels: earthquake catalogue (EMSC, USGS fallback), non-seismic
 * GDACS triggers and IMF PortWatch transits at the straits.
 */
import { toApiUrl } from '../runtime';
import { fetchEarthquakes } from '../earthquakes';
import { fetchNaturalEvents } from '../eonet';
import { fetchChokepointStatus } from '../supply-chain';
import { THESIS_NODES } from '@/config/thesis-model';
import {
  buildChains,
  naturalEventsToTriggers,
  quakesToTriggers,
  type CatalogueQuake,
  type NodeChain,
  type NodeTransitStatus,
  type TriggerEvent,
} from './risk-chain';

export interface ThesisSnapshot {
  loadedAt: number;
  quakeSource: string | null;
  quakeWindowDays: number;
  quakeCount: number;
  naturalCount: number;
  transitAvailable: number;
  events: TriggerEvent[];
  chains: NodeChain[];
  errors: string[];
}

interface TriggersResponse {
  source: string | null;
  windowDays: number;
  quakes: CatalogueQuake[];
}

const TTL_MS = 5 * 60_000;
let inflight: Promise<ThesisSnapshot> | null = null;
let last: ThesisSnapshot | null = null;
const listeners = new Set<(s: ThesisSnapshot) => void>();

async function loadQuakes(errors: string[]): Promise<{ quakes: CatalogueQuake[]; source: string | null; windowDays: number }> {
  try {
    const res = await fetch(toApiUrl('/api/thesis/triggers'), { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const body = (await res.json()) as TriggersResponse;
      if (Array.isArray(body.quakes) && body.source) return { quakes: body.quakes, source: body.source, windowDays: body.windowDays };
    }
    errors.push(`triggers HTTP ${res.status}`);
  } catch (err) {
    errors.push(`triggers: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Fallback: the dashboard's USGS feed (M4.5+, last 7 days).
  try {
    const list = await fetchEarthquakes();
    const quakes: CatalogueQuake[] = list
      .filter((q) => q.location)
      .map((q) => ({
        id: `usgs-${q.id}`,
        time: Number(q.occurredAt),
        lat: q.location!.latitude,
        lon: q.location!.longitude,
        depthKm: q.depthKm,
        mag: q.magnitude,
        magType: '',
        place: q.place,
        url: q.sourceUrl,
        source: 'USGS',
      }));
    return { quakes, source: 'USGS (7 gg)', windowDays: 7 };
  } catch (err) {
    errors.push(`earthquakes: ${err instanceof Error ? err.message : String(err)}`);
    return { quakes: [], source: null, windowDays: 0 };
  }
}

async function load(): Promise<ThesisSnapshot> {
  const errors: string[] = [];
  const [quakeResult, natural, chokepoints] = await Promise.all([
    loadQuakes(errors),
    fetchNaturalEvents(30).catch((err) => {
      errors.push(`natural: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }),
    fetchChokepointStatus().catch(() => ({ chokepoints: [] }) as unknown as Awaited<ReturnType<typeof fetchChokepointStatus>>),
  ]);
  const quakeEvents = quakesToTriggers(quakeResult.quakes);
  const naturalEvents = naturalEventsToTriggers(natural);
  const transit = new Map<string, NodeTransitStatus>();
  for (const cp of chokepoints.chokepoints || []) {
    const s = cp.transitSummary;
    if (!s) continue;
    transit.set(cp.id, { dataAvailable: !!s.dataAvailable, todayTotal: s.todayTotal, wowChangePct: s.wowChangePct });
  }
  const events = [...quakeEvents, ...naturalEvents];
  return {
    loadedAt: Date.now(),
    quakeSource: quakeResult.source,
    quakeWindowDays: quakeResult.windowDays,
    quakeCount: quakeEvents.length,
    naturalCount: naturalEvents.length,
    transitAvailable: [...transit.values()].filter((t) => t.dataAvailable).length,
    events,
    chains: buildChains(THESIS_NODES, events, transit),
    errors,
  };
}

export function getThesisSnapshot(force = false): Promise<ThesisSnapshot> {
  if (!force && last && Date.now() - last.loadedAt < TTL_MS) return Promise.resolve(last);
  if (inflight) return inflight;
  inflight = load()
    .then((s) => {
      last = s;
      for (const fn of listeners) fn(s);
      return s;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Subscribe to every new snapshot; returns an unsubscribe function. */
export function onThesisSnapshot(fn: (s: ThesisSnapshot) => void): () => void {
  listeners.add(fn);
  if (last) fn(last);
  return () => listeners.delete(fn);
}
