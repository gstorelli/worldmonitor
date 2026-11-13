/**
 * Risk engine of the thesis chain (v1, Year-2 protocol proposal 0.1).
 *
 * Pure functions, no DOM and no fetch, shared by the platform and by the
 * retrospective replay (research/replay/). Every layer of the model becomes a
 * number in [0, 1] through a transform declared in the protocol
 * (research/replay/protocol.yaml; risk-sentinel-thesis docs/protocollo-anno2.md):
 *
 *   L  node-good link       1 if the good depends on the node, 0 if not, null if unknown
 *   H  hazard               expected intensity at the node (Allen et al. 2012) or GDACS alert
 *   S  supply vulnerability mean of the origin share and of the supplier HHI (Comext)
 *   C  customs vulnerability share of misdeclaration channels with an incentive
 *
 * and three formulations are computed side by side: the uniform-mean reference
 * R0, the hazard-gated F1 and the geometric-mean F2. No weight is estimated
 * here, and the v0 weights never enter: uniform means and equal exponents are
 * the neutral reference of Chapter 3. A null layer makes the result "not
 * computable", never zero: unknown is not absent.
 *
 * R0 is positive even with zero hazard, against the rule of the model: it is
 * the Year-2 REFERENCE whose flaw the replay documents, computed only for the
 * comparison. The platform never shows R0 as a risk; only F1 and F2 comply.
 */
import { NODE_ORIGINS, type ThesisNode } from '@/config/thesis-model';
import { nodeThreshold, PROTOCOL_V0_1, type EngineParams } from '@/config/thesis-protocol';
import { expectedIntensityAt, haversineKm, type TriggerEvent } from './risk-chain';

// ------------------------------------------------------------------ parameters

// Moved to src/config/thesis-protocol.ts (single source); re-exported for compatibility.
export { PROTOCOL_V0_1, type EngineParams } from '@/config/thesis-protocol';

// ------------------------------------------------------------------ registry

// NODE_ORIGINS moved to src/config/thesis-model.ts (single source); re-exported for compatibility.
export { NODE_ORIGINS } from '@/config/thesis-model';

// ------------------------------------------------------------------ sequences

/**
 * Gardner and Knopoff (1974) space-time windows, as parameterised in van
 * Stiphout et al. (2012) and the OpenQuake HMTK: the same function as
 * research/hazard-stats/hazard_lib.py (window_gk). Distance in km, time in days.
 */
export function windowGardnerKnopoff(mw: number): { km: number; days: number } {
  const km = 10 ** (0.1238 * mw + 0.983);
  const days = mw >= 6.5 ? 10 ** (0.032 * mw + 2.7389) : 10 ** (0.5409 * mw - 0.547);
  return { km, days };
}

export interface TriggerSequence {
  id: string;
  mainshock: TriggerEvent;
  /** Mainshock included, sorted by time. */
  members: TriggerEvent[];
  /** Epoch ms after which the sequence is over (end of the mainshock time window). */
  endsAt: number;
}

const DAY_MS = 86_400_000;

/**
 * Window declustering with the logic of Chapter 3: events visited by decreasing
 * magnitude; each unassigned event opens a sequence with the unassigned events
 * inside its distance window and its time window (after it, and before it with
 * `foreshockFraction` times the window). Non-seismic events are their own sequence.
 */
export function sequencesGardnerKnopoff(events: readonly TriggerEvent[], foreshockFraction = 1): TriggerSequence[] {
  const quakes = events.filter((e) => e.kind === 'earthquake' && typeof e.magnitude === 'number');
  const others = events.filter((e) => !(e.kind === 'earthquake' && typeof e.magnitude === 'number'));
  const order = [...quakes].sort((a, b) => (b.magnitude! - a.magnitude!) || a.time - b.time);
  const assigned = new Set<string>();
  const out: TriggerSequence[] = [];
  for (const main of order) {
    if (assigned.has(main.id)) continue;
    const w = windowGardnerKnopoff(main.magnitude!);
    const from = main.time - foreshockFraction * w.days * DAY_MS;
    const to = main.time + w.days * DAY_MS;
    const members = [main];
    assigned.add(main.id);
    for (const e of quakes) {
      if (assigned.has(e.id) || e.time < from || e.time > to) continue;
      if (haversineKm(main.lat, main.lon, e.lat, e.lon) > w.km) continue;
      members.push(e);
      assigned.add(e.id);
    }
    members.sort((a, b) => a.time - b.time);
    out.push({ id: main.id, mainshock: main, members, endsAt: to });
  }
  for (const e of others) out.push({ id: e.id, mainshock: e, members: [e], endsAt: e.endTime ?? e.time });
  return out.sort((a, b) => a.mainshock.time - b.mainshock.time);
}

// ------------------------------------------------------------------ layers

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function intensityToUnit(intensity: number, p: EngineParams = PROTOCOL_V0_1): number {
  const { zeroAt, oneAt } = p.intensityToUnit;
  return clamp01((intensity - zeroAt) / (oneAt - zeroAt));
}

export interface HazardTerm {
  /** Value in [0, 1]. */
  h: number;
  /** Highest expected intensity at the node among the members (earthquakes). */
  intensity: number | null;
  /** Event that gives the highest value. */
  eventId: string;
  distanceKm: number;
  gate: boolean;
}

/**
 * Hazard of one sequence at one node: the member with the highest expected
 * intensity at the node (an aftershock can be closer than the mainshock), or
 * the GDACS alert for non-seismic triggers. Null when no member is within the
 * screening radius.
 */
export function hazardOfSequence(
  node: Pick<ThesisNode, 'lat' | 'lon'> & { goods?: readonly string[] },
  seq: TriggerSequence,
  p: EngineParams = PROTOCOL_V0_1,
): HazardTerm | null {
  const threshold = nodeThreshold(node, p);
  let best: HazardTerm | null = null;
  for (const e of seq.members) {
    const d = haversineKm(node.lat, node.lon, e.lat, e.lon);
    if (d > p.radiusKm) continue;
    if (e.kind === 'earthquake') {
      const i = expectedIntensityAt(e, d);
      if (typeof i !== 'number') continue;
      const term = { h: intensityToUnit(i, p), intensity: i, eventId: e.id, distanceKm: d, gate: i >= threshold };
      if (!best || (best.intensity ?? -Infinity) < i) best = term;
    } else {
      const level = e.alertLevel ?? 'green';
      const h = p.gdacsToUnit[level];
      const term = { h, intensity: null, eventId: e.id, distanceKm: d, gate: level === 'orange' || level === 'red' };
      if (!best || best.h < h) best = term;
    }
  }
  return best;
}

/** Extra-EU imports of one good in one year, by partner (ISO2 → EUR). */
export interface PartnerImports {
  hs: string;
  year: number;
  /** Total extra-EU imports (EUR). */
  extraEuEur: number;
  byPartner: Readonly<Record<string, number>>;
}

/** Share of extra-EU imports that comes from the given origins. */
export function originShare(imports: PartnerImports, origins: readonly string[]): number | null {
  if (!(imports.extraEuEur > 0)) return null;
  const v = origins.reduce((s, o) => s + (imports.byPartner[o] ?? 0), 0);
  return clamp01(v / imports.extraEuEur);
}

/**
 * Herfindahl-Hirschman index of the extra-EU suppliers, on shares of the
 * extra-EU total (partners not listed are treated as one residual supplier per
 * euro, i.e. ignored, which gives a lower bound).
 */
export function supplierHhi(imports: PartnerImports): number | null {
  if (!(imports.extraEuEur > 0)) return null;
  let hhi = 0;
  for (const v of Object.values(imports.byPartner)) {
    const s = v / imports.extraEuEur;
    hhi += s * s;
  }
  return clamp01(hhi);
}

/** S from the two indicators: mean of the node-origin share and of the supplier HHI. */
export function supplyFromIndicators(share: number, hhi: number): number {
  return (share + hhi) / 2;
}

export function supplyTerm(imports: PartnerImports | null, origins: readonly string[] | null): { s: number | null; share: number | null; hhi: number | null } {
  if (!imports || !origins?.length) return { s: null, share: null, hhi: null };
  const share = originShare(imports, origins);
  const hhi = supplierHhi(imports);
  if (share === null || hhi === null) return { s: null, share, hhi };
  return { s: supplyFromIndicators(share, hhi), share, hhi };
}

/** Misdeclaration channels with an incentive for a good AS OF the date of the assessment. */
export interface CustomsAsOf {
  hs: string;
  /** Channels with an incentive from measures in force at the date; null if the measures are not listed. */
  channels: readonly string[] | null;
  /** Date from which the listed measures are in force (epoch ms); the term is null before it. */
  validFrom: number;
}

export function customsTerm(c: CustomsAsOf | null, t: number): number | null {
  if (!c || c.channels === null || t < c.validFrom) return null;
  return clamp01(c.channels.length / 3);
}

// ------------------------------------------------------------------ assessment

export interface Assessment {
  nodeId: string;
  hs: string;
  t: number;
  link: 0 | 1 | null;
  sequenceId: string | null;
  hazard: HazardTerm | null;
  supply: { s: number | null; share: number | null; hhi: number | null };
  customs: number | null;
  /** Catalogues that report the mainshock (qualifier of the alert, not a factor). */
  evidence: number;
  /** null = not computable (a layer is unknown). */
  r0: number | null;
  f1: number | null;
  f2: number | null;
  missing: string[];
}

export interface AssessInputs {
  node: ThesisNode;
  hs: string;
  /** All trigger events known to the replay, from every catalogue. */
  events: readonly TriggerEvent[];
  imports: PartnerImports | null;
  customs: CustomsAsOf | null;
  params?: EngineParams;
}

/** Events available at time t (as-of): origin time plus the catalogue latency. */
export function availableAt(events: readonly TriggerEvent[], t: number, p: EngineParams = PROTOCOL_V0_1): TriggerEvent[] {
  const lat = p.earthquakeLatencyHours * 3_600_000;
  return events.filter((e) => (e.kind === 'earthquake' ? e.time + lat : e.time) <= t);
}

/** Number of distinct catalogues with an event within 2 minutes and 100 km of the mainshock. */
export function evidenceCount(main: TriggerEvent, events: readonly TriggerEvent[]): number {
  const sources = new Set<string>();
  for (const e of events) {
    if (Math.abs(e.time - main.time) <= 120_000 && haversineKm(main.lat, main.lon, e.lat, e.lon) <= 100) sources.add(e.source);
  }
  return sources.size;
}

/**
 * Assessment of one node and one good at time t, with only the information
 * available at t. Sequences are formed per catalogue (the first catalogue in
 * the list is the reference, as EMSC on the platform), and the active sequence
 * with the highest hazard at the node is retained.
 */
export function assessAt(inputs: AssessInputs, t: number, referenceSource?: string): Assessment {
  const p = inputs.params ?? PROTOCOL_V0_1;
  const { node, hs } = inputs;
  const missing: string[] = [];

  const link: 0 | 1 | null = node.kind === 'production' ? (node.goods.includes(hs) ? 1 : 0) : null;
  if (link === null) missing.push('link');

  const known = availableAt(inputs.events, t, p);
  const ref = referenceSource ?? known[0]?.source;
  const own = known.filter((e) => e.source === ref);
  // Sequences group events (one sequence = one trigger episode); the hazard at t
  // comes from the members of each sequence that are still active at t.
  const activeMs = p.activeDays * DAY_MS;
  let hazard: HazardTerm | null = null;
  let seq: TriggerSequence | null = null;
  for (const s of sequencesGardnerKnopoff(own, p.foreshockFraction)) {
    const live = s.members.filter((e) =>
      e.kind === 'earthquake' ? e.time <= t && t - e.time <= activeMs : e.time <= t && t <= (e.endTime ?? e.time),
    );
    if (!live.length) continue;
    const hz = hazardOfSequence(node, { ...s, members: live }, p);
    if (hz && (!hazard || hz.h > hazard.h)) { hazard = hz; seq = s; }
  }
  const h = hazard?.h ?? 0;

  const origins = NODE_ORIGINS[node.id] ?? null;
  const supply = supplyTerm(inputs.imports, origins);
  if (supply.s === null) missing.push('supply');
  const customs = customsTerm(inputs.customs, t);
  if (customs === null) missing.push('customs');

  const computable = link !== null && supply.s !== null && customs !== null;
  const r0 = computable ? link! * (h + supply.s! + customs!) / 3 : null;
  const f1 = r0 === null ? null : hazard?.gate ? r0 : 0;
  const f2 = computable ? link! * Math.cbrt(h * supply.s! * customs!) : null;

  return {
    nodeId: node.id,
    hs,
    t,
    link,
    sequenceId: seq?.id ?? null,
    hazard,
    supply,
    customs,
    evidence: seq ? evidenceCount(seq.mainshock, known) : 0,
    r0,
    f1,
    f2,
    missing,
  };
}
