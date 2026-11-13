/**
 * Demonstration of the thesis engine on the Hualien earthquake of 2 April 2024.
 *
 * This is NOT the Year-2 replay of the protocol: the protocol is a proposal not
 * yet frozen (research/replay/protocol.yaml), so no metric (lead time,
 * precision, recall) is computed and no disruption data are read. The script
 * only shows that the chain can be computed as of each hour, with the
 * information available at that hour, for the two chip nodes.
 *
 * Inputs, fetched at run time and saved with their SHA-256 in <outDir>/inputs:
 *  - EMSC and USGS FDSN catalogues, M >= 4.5 within 300 km of each node,
 *    15/3/2024 - 31/5/2024 (raw files stay outside the repository);
 *  - Eurostat Comext DS-045409, extra-EU imports of HS 8542 by partner, year
 *    2022 (as-of rule: year(t) - 2);
 *  - misdeclaration channels of HS 8542 from the platform registry, in force
 *    from 1/3/2024 (the February 2024 version of the EU list of Common High
 *    Priority Items; first day of the next month as a conservative date).
 *
 * Usage: npx tsx research/replay/hualien-demo.mts <outDir>
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEmsc, parseUsgs, EMSC_URL, USGS_URL, TRIGGERS_UA } from '../../api/thesis/_catalogue.js';
import { comextUrl, comextValuesByPartner, EU27 } from '../../scripts/_eu-trade.mjs';
import { THESIS_NODES } from '../../src/config/thesis-model.ts';
import { customsAsOf, toEngineCustoms } from '../../src/services/thesis/customs-registry.ts';
import policyRegistry from '../../data/policy-registry.json' with { type: 'json' };
import { quakesToTriggers, type TriggerEvent } from '../../src/services/thesis/risk-chain.ts';
import { PROTOCOL_V0_1, assessAt, type Assessment, type PartnerImports } from '../../src/services/thesis/engine.ts';

const START = '2024-03-15';
const END = '2024-05-31';
const NODES = ['hsinchu', 'tainan'];
const HS = '8542';
const COMEXT_YEAR = 2022;
const KM_PER_DEG = 111.19;

const outDir = process.argv[2];
if (!outDir) throw new Error('usage: hualien-demo.mts <outDir>');
mkdirSync(join(outDir, 'inputs'), { recursive: true });
const manifest: { file: string; url: string; retrievedAt: string; sha256: string }[] = [];

async function fetchSaved(url: string, file: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': TRIGGERS_UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(join(outDir, 'inputs', file), text);
  manifest.push({ file, url, retrievedAt: new Date().toISOString(), sha256: createHash('sha256').update(text).digest('hex') });
  return JSON.parse(text);
}

const events = new Map<string, TriggerEvent>();
for (const id of NODES) {
  const n = THESIS_NODES.find((x) => x.id === id)!;
  const emsc = new URLSearchParams({ format: 'json', starttime: START, endtime: `${END}T23:59:59`, minmag: '4.5', lat: String(n.lat), lon: String(n.lon), maxradius: (PROTOCOL_V0_1.radiusKm / KM_PER_DEG).toFixed(4), limit: '2000' });
  const usgs = new URLSearchParams({ format: 'geojson', starttime: START, endtime: `${END}T23:59:59`, minmagnitude: '4.5', latitude: String(n.lat), longitude: String(n.lon), maxradiuskm: String(PROTOCOL_V0_1.radiusKm), limit: '2000' });
  for (const q of quakesToTriggers(parseEmsc(await fetchSaved(`${EMSC_URL}?${emsc}`, `emsc-${id}.json`)))) events.set(q.id, q);
  for (const q of quakesToTriggers(parseUsgs(await fetchSaved(`${USGS_URL}?${usgs}`, `usgs-${id}.json`)))) events.set(q.id, q);
}

const values = comextValuesByPartner(await fetchSaved(comextUrl('EU27_2020', HS, COMEXT_YEAR), `comext-${HS}-${COMEXT_YEAR}.json`)) as Record<string, number>;
const byPartner = Object.fromEntries(Object.entries(values).filter(([c]) => /^[A-Z]{2}$/.test(c) && !EU27.has(c)));
const imports: PartnerImports = { hs: HS, year: COMEXT_YEAR, extraEuEur: values.EXT_EU27_2020 ?? 0, byPartner };
// Customs layer C as of each assessment time, from the dated Policy register
// (fallback GOOD_CHANNELS, with no dated basis, when no register measure qualifies).
const customsAt = (t: number) => customsAsOf(policyRegistry, HS, t);

const all = [...events.values()];
const rows: Assessment[] = [];
const t0 = Date.parse(`${START}T00:00:00Z`);
const t1 = Date.parse(`${END}T23:00:00Z`);
for (const id of NODES) {
  const node = THESIS_NODES.find((x) => x.id === id)!;
  for (let t = t0; t <= t1; t += 3_600_000) rows.push(assessAt({ node, hs: HS, events: all, imports, customs: toEngineCustoms(customsAt(t), HS) }, t, 'EMSC'));
}

const fmt = (x: number | null | undefined, d = 4) => (x === null || x === undefined ? '' : x.toFixed(d));
const csv = ['t,node,hs,sequence,event,intensity,distance_km,h,gate,share,hhi,s,c,evidence,r0,f1,f2,missing'];
for (const r of rows) {
  csv.push([new Date(r.t).toISOString(), r.nodeId, r.hs, r.sequenceId ?? '', r.hazard?.eventId ?? '', fmt(r.hazard?.intensity, 2), fmt(r.hazard?.distanceKm, 1), fmt(r.hazard?.h), r.hazard?.gate ? 1 : 0, fmt(r.supply.share), fmt(r.supply.hhi), fmt(r.supply.s), fmt(r.customs), r.evidence, fmt(r.r0), fmt(r.f1), fmt(r.f2), r.missing.join('|')].join(','));
}
writeFileSync(join(outDir, 'timeline.csv'), csv.join('\n') + '\n');

// Episodes: maximal runs of hours with F1 > 0 on the same node.
const episodes: Record<string, unknown>[] = [];
for (const id of NODES) {
  let cur: { node: string; start: number; end: number; sequences: Set<string>; maxIntensity: number; maxF1: number; evidence: number } | null = null;
  for (const r of rows.filter((x) => x.nodeId === id)) {
    if ((r.f1 ?? 0) > 0) {
      cur ??= { node: id, start: r.t, end: r.t, sequences: new Set(), maxIntensity: -Infinity, maxF1: 0, evidence: 0 };
      cur.end = r.t;
      if (r.sequenceId) cur.sequences.add(r.sequenceId);
      cur.maxIntensity = Math.max(cur.maxIntensity, r.hazard?.intensity ?? -Infinity);
      cur.maxF1 = Math.max(cur.maxF1, r.f1!);
      cur.evidence = Math.max(cur.evidence, r.evidence);
    } else if (cur) {
      episodes.push({ ...cur, start: new Date(cur.start).toISOString(), end: new Date(cur.end).toISOString(), sequences: [...cur.sequences] });
      cur = null;
    }
  }
  if (cur) episodes.push({ ...cur, start: new Date(cur.start).toISOString(), end: new Date(cur.end).toISOString(), sequences: [...cur.sequences] });
}

const summary = {
  note: 'Demonstration of the engine, NOT the Year-2 protocol replay: no disruption data, no metrics.',
  protocol: 'research/replay/protocol.yaml v0.1 (proposal, not frozen)',
  window: [START, END],
  events: { EMSC: all.filter((e) => e.source === 'EMSC').length, USGS: all.filter((e) => e.source === 'USGS').length },
  supply: { hs: HS, year: COMEXT_YEAR, extraEuEur: imports.extraEuEur, shareTW: rows[0]?.supply.share, hhi: rows[0]?.supply.hhi },
  customs: (() => {
    const c = customsAt(t0);
    return { channels: c.channels, provenance: c.provenance, measures: c.measures, validFrom: c.validFrom === null ? null : new Date(c.validFrom).toISOString() };
  })(),
  episodes,
  inputs: manifest,
};
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, inputs: manifest.map((m) => `${m.file} ${m.sha256.slice(0, 16)}`) }, null, 2));
