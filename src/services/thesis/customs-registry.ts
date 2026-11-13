/**
 * Customs layer C AS OF a date, from the dated Policy register
 * (data/policy-registry.json, schema v3).
 *
 * Rule: the channels with an incentive for HS heading `hs` at time `t` are the
 * union of the `channels` of the register entries that
 *   - have role 'modulatore' and statusCode 'verificata' ('in-riesame' and
 *     'da-verificare' never count),
 *   - list `hs` in `goods`,
 *   - are in force at t: inForceFrom <= t < expiresOn (null expiresOn = open).
 * An entry with a null inForceFrom or null channels does not count: an unknown
 * date or unassigned channels is not "in force".
 *
 * If no register entry qualifies, the declared fallback GOOD_CHANNELS
 * (src/config/thesis-response.ts) is used with provenance 'fallback': those
 * values are hand-written and have NO dated basis (validFrom null). Otherwise
 * provenance is 'none' and channels are null: C is not computable, never 0.
 *
 * Pure: no I/O, the register is passed in.
 */
import { GOOD_CHANNELS } from '@/config/thesis-response';
import type { CustomsAsOf } from './engine';

/** The subset of a register entry (schema v3) this module reads. */
export interface CustomsRegistryEntry {
  id: string;
  role?: string | null;
  statusCode?: string | null;
  goods?: readonly string[] | null;
  celex?: string | null;
  inForceFrom?: string | null;
  expiresOn?: string | null;
  channels?: readonly string[] | null;
}

export interface CustomsRegistry {
  entries: readonly CustomsRegistryEntry[];
}

export type CustomsProvenance = 'registry' | 'fallback' | 'none';

export interface CustomsMeasure {
  id: string;
  celex: string | null;
  statusCode: string;
  inForceFrom: string;
  expiresOn: string | null;
}

export interface CustomsAsOfResult {
  channels: string[] | null;
  /** Register measures in force at t that produced the channels (empty unless provenance 'registry'). */
  measures: CustomsMeasure[];
  provenance: CustomsProvenance;
  /** Latest entry into force among the measures (epoch ms); null for 'fallback' and 'none'. */
  validFrom: number | null;
}

const isoMs = (d: string | null | undefined): number | null => {
  if (!d) return null;
  const ms = Date.parse(d);
  return Number.isFinite(ms) ? ms : null;
};

export function customsAsOf(registry: CustomsRegistry | null, hs: string, t: number): CustomsAsOfResult {
  const measures: CustomsMeasure[] = [];
  const channels = new Set<string>();
  let validFrom: number | null = null;
  for (const e of registry?.entries ?? []) {
    if (e.role !== 'modulatore' || e.statusCode !== 'verificata') continue;
    if (!e.goods?.includes(hs) || !e.channels) continue;
    const from = isoMs(e.inForceFrom);
    if (from === null || t < from) continue;
    const to = isoMs(e.expiresOn);
    if (to !== null && t >= to) continue;
    for (const ch of e.channels) channels.add(ch);
    measures.push({ id: e.id, celex: e.celex ?? null, statusCode: e.statusCode, inForceFrom: e.inForceFrom!, expiresOn: e.expiresOn ?? null });
    validFrom = validFrom === null ? from : Math.max(validFrom, from);
  }
  if (measures.length) return { channels: [...channels], measures, provenance: 'registry', validFrom };
  const fallback = GOOD_CHANNELS.find((g) => g.hs === hs);
  if (fallback) return { channels: [...fallback.channels], measures: [], provenance: 'fallback', validFrom: null };
  return { channels: null, measures: [], provenance: 'none', validFrom: null };
}

/**
 * Adapter to the engine's CustomsAsOf. It is a snapshot at the date the result
 * was computed for: recompute it for each assessment time. The fallback has no
 * dated basis, so it is not bounded in time (validFrom = -Infinity) — this is
 * what the provenance 'fallback' flags. 'none' maps to null channels, so
 * customsTerm stays null.
 */
export function toEngineCustoms(r: CustomsAsOfResult, hs: string): CustomsAsOf {
  return { hs, channels: r.channels, validFrom: r.validFrom ?? Number.NEGATIVE_INFINITY };
}
