import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoodRows,
  buildNodeRows,
  buildSequenceRows,
  buildSignalNodeRows,
  buildSupplyRows,
  climateZoneForNode,
  distinctTriggerCounts,
  importSentence,
  isSourceAvailable,
  priceKind,
  provenanceStatus,
  provenanceText,
  quakeWindowLabel,
  SOURCE_UNAVAILABLE,
  supplierLabel,
  type OsintEra5Zone,
} from '../src/apps/osint/model.ts';
import { THESIS_NODES, STRATEGIC_GOODS } from '../src/config/thesis-model.ts';
import { shapeClimate, shapeComtrade, shapeQuotes } from '../api/osint/signals.js';
import type { NodeChain } from '../src/services/thesis/risk-chain.ts';

const node = (id: string) => THESIS_NODES.find((n) => n.id === id)!;
const zone = (over: Partial<OsintEra5Zone>): OsintEra5Zone => ({ zone: 'z', lat: 0, lon: 0, tempDelta: 0, precipDelta: 0, period: 'p', ...over });

describe('OSINT ERA5 climate signal', () => {
  const zones = [zone({ zone: 'Persian Gulf', lat: 25.29, lon: 51.53 }), zone({ zone: 'Strait of Hormuz', lat: 26.57, lon: 56.25, tempDelta: 1.2 })];

  it('links a node to the nearest zone within the radius, or to none', () => {
    assert.equal(climateZoneForNode(node('hormuz'), zones, 300)?.zone.zone, 'Strait of Hormuz');
    assert.equal(climateZoneForNode(node('gibraltar'), zones, 300), null);
  });

  it('drops the nearest zone when it lies outside the radius', () => {
    const far = [zone({ zone: 'Persian Gulf', lat: 25.29, lon: 51.53 })];
    const d = climateZoneForNode(node('hormuz'), far, 10_000)!.distanceKm;
    assert.ok(d > 400);
    assert.equal(climateZoneForNode(node('hormuz'), far, 300), null);
    assert.equal(climateZoneForNode(node('hormuz'), far, Math.ceil(d))?.zone.zone, 'Persian Gulf');
  });

  it('builds one signal row per node with transit and ERA5 values, no thresholds', () => {
    const rows = buildSignalNodeRows([{ node: node('hormuz'), matches: [], transit: { dataAvailable: true, todayTotal: 30, wowChangePct: -8 }, state: 'none', reasons: [] }], zones, 300);
    assert.equal(rows[0]!.transit?.wowChangePct, -8);
    assert.equal(rows[0]!.era5?.zone.tempDelta, 1.2);
    assert.equal(Object.hasOwn(rows[0]!, 'severity'), false);
  });
});

describe('OSINT EU supply signal', () => {
  it('attaches the EU27 indicators by HS code, null when missing', () => {
    const rows = buildSupplyRows(STRATEGIC_GOODS, [{ hs4: '8542', year: 2025, extraEuEur: 1000, supply: { hhi: 0.21, nodeOrigins: ['TW'], nodeOriginShare: 0.18 } }]);
    assert.equal(rows.length, STRATEGIC_GOODS.length);
    assert.equal(rows.find((r) => r.good.hs === '8542')!.product?.supply?.hhi, 0.21);
    assert.equal(rows.find((r) => r.good.hs === '2709')!.product, null);
  });
});

describe('OSINT provenance', () => {
  const hit = { status: 'hit', fetchedAt: '2026-11-12T06:00:00.000Z', source: 'Eurostat Comext DS-045409' };

  it('renders source and date for a hit', () => {
    assert.equal(isSourceAvailable(hit), true);
    assert.equal(provenanceStatus(hit), 'aggiornato il 12/11/2026');
    assert.equal(provenanceText(hit), 'Eurostat Comext DS-045409, aggiornato il 12/11/2026');
    assert.equal(provenanceStatus({ ...hit, fetchedAt: null }), 'data di aggiornamento n.d.');
  });

  it('renders "fonte non disponibile" for a miss, an error or no record', () => {
    for (const src of [{ ...hit, status: 'miss', fetchedAt: null }, { ...hit, status: 'error', fetchedAt: null }, undefined, null]) {
      assert.equal(isSourceAvailable(src), false);
      assert.equal(provenanceText(src), SOURCE_UNAVAILABLE);
      assert.equal(provenanceStatus(src), 'fonte non disponibile');
    }
  });

  it('labels the earthquake window from the loaded catalogue', () => {
    assert.equal(quakeWindowLabel({ quakeWindowDays: 30, quakeSource: 'EMSC' }), 'terremoti degli ultimi 30 giorni (EMSC)');
    assert.equal(quakeWindowLabel({ quakeWindowDays: 7, quakeSource: 'USGS (7 gg)' }), 'terremoti degli ultimi 7 giorni (USGS (7 gg))');
    assert.equal(quakeWindowLabel({ quakeWindowDays: 0, quakeSource: null }), 'catalogo dei terremoti non disponibile');
  });
});

describe('OSINT nodes and feed', () => {
  const quake = { id: 'q1', kind: 'earthquake' as const, source: 'EMSC', title: 'TAIWAN', lat: 23.8, lon: 121.6, time: 2000, magnitude: 6.2, depthKm: 30, url: 'https://x/q1' };
  const older = { ...quake, id: 'q0', time: 1000, magnitude: 4.8, url: undefined };
  const chains: NodeChain[] = [
    { node: node('hsinchu'), matches: [{ event: quake, distanceKm: 140, significant: true }, { event: older, distanceKm: 90, significant: false }], transit: null, state: 'assess', reasons: [] },
    { node: node('suez'), matches: [], transit: { dataAvailable: true, todayTotal: 40, wowChangePct: -12 }, state: 'none', reasons: [] },
  ];

  it('summarises triggers per node', () => {
    const rows = buildNodeRows(chains);
    assert.deepEqual(rows[0]!.triggers, { count: 2, significant: 1, maxMagnitude: 6.2, latest: quake });
    assert.equal(rows[1]!.triggers.count, 0);
  });
});

describe('OSINT distinct counts and sequences', () => {
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 10, 1);
  const main = { id: 'm', kind: 'earthquake' as const, source: 'EMSC', title: 'TAIWAN', lat: 23.8, lon: 121.0, time: t0, magnitude: 6.4, magnitudeType: 'mw', depthKm: 20 };
  const after = { ...main, id: 'a', time: t0 + DAY, magnitude: 4.9, lat: 23.9 };
  const far = { ...main, id: 'f', time: t0 + 2 * DAY, magnitude: 5.0, magnitudeType: '', lat: -23.3, lon: -69, title: 'ANTOFAGASTA' };
  const flood = { id: 'g', kind: 'flood' as const, source: 'GDACS', title: 'Flood', lat: 23.1, lon: 120.3, time: t0 + 3 * DAY, alertLevel: 'orange' as const };
  const m = (event: typeof main | typeof flood, distanceKm: number, significant: boolean) => ({ event, distanceKm, significant });
  const chains: NodeChain[] = [
    { node: node('taiwan-strait'), matches: [m(main, 160, true), m(after, 150, false)], transit: null, state: 'assess', reasons: [] },
    { node: node('hsinchu'), matches: [m(main, 110, true), m(after, 100, true)], transit: null, state: 'assess', reasons: [] },
    { node: node('tainan'), matches: [m(main, 90, true), m(flood, 5, false)], transit: null, state: 'assess', reasons: [] },
    { node: node('antofagasta'), matches: [m(far, 30, false)], transit: null, state: 'monitor', reasons: [] },
    { node: node('suez'), matches: [], transit: null, state: 'none', reasons: [] },
  ];

  it('counts an event reaching several overlapping nodes once', () => {
    assert.deepEqual(distinctTriggerCounts(chains), { nodesHit: 4, events: 4, significant: 2 });
  });

  it('builds one row per Gardner-Knopoff sequence with the nodes it reaches', () => {
    const rows = buildSequenceRows(chains);
    assert.equal(rows.length, 3);
    const tw = rows.find((r) => r.id === 'm')!;
    assert.equal(tw.memberCount, 2);
    assert.equal(tw.lastTime, after.time);
    assert.deepEqual(tw.nodes.map((n) => [n.name, n.distanceKm, n.significant]), [['Tainan', 90, true], ['Hsinchu', 100, true], ['Taiwan Strait', 150, true]]);
    assert.equal(tw.text, 'Terremoto M6.4 (mw), 20 km di profondità — TAIWAN · 2 eventi nella sequenza');
    assert.equal(rows.find((r) => r.id === 'f')!.text, 'Terremoto M5.0 (tipo di magnitudo n.d.), 20 km di profondità — ANTOFAGASTA');
    assert.equal(rows.find((r) => r.id === 'g')!.text, 'Alluvione (allerta orange) — Flood');
    assert.deepEqual(rows.map((r) => r.id), ['g', 'f', 'm']);
  });
});

describe('OSINT goods', () => {
  const meta = [
    { symbol: 'CL=F', name: 'Crude Oil WTI', hsCode: '2709' },
    { symbol: 'SMH', name: 'Semiconductors', hsCode: '8542' },
    { symbol: 'GC=F', name: 'Gold', hsCode: '7108' },
  ];
  const rows = buildGoodRows(
    STRATEGIC_GOODS,
    [{ symbol: 'CL=F', price: 70.1, change: -1.25 }],
    meta,
    [{ hs4: '2709', year: 2024, description: 'Crude petroleum', suppliers: [{ iso2: 'LY', code: 434, share: 0.21 }, { iso2: null, code: 899, share: 0.05 }] }],
    [{ id: 'm1', title: 'Reg. 833/2014 — x', goods: ['2709', '2711'] }, { id: 'm2', title: 'altro', goods: [] }],
  );
  const crude = rows.find((r) => r.good.hs === '2709')!;
  const chips = rows.find((r) => r.good.hs === '8542')!;

  it('keeps one row per strategic good and only their quotes', () => {
    assert.equal(rows.length, STRATEGIC_GOODS.length);
    assert.deepEqual(crude.prices, [{ symbol: 'CL=F', name: 'Crude Oil WTI', price: 70.1, change: -1.25, kind: 'futures' }]);
    assert.equal(chips.prices[0]!.kind, 'proxy');
    assert.equal(chips.prices[0]!.price, null);
  });

  it('attaches Italian imports and registry measures by HS code', () => {
    assert.equal(crude.imports?.year, 2024);
    assert.deepEqual(crude.measures.map((m) => m.id), ['m1']);
    assert.equal(chips.imports, null);
  });

  it('writes suppliers as country names, keeping Comtrade aggregates as codes', () => {
    const dn = { of: (c: string) => ({ LY: 'Libia' } as Record<string, string>)[c] };
    assert.equal(importSentence(crude.imports!, dn), 'Libia 21%, codice Comtrade 899 5%');
    assert.equal(supplierLabel({ iso2: null, code: null }), 'n.d.');
  });

  it('futures end with =F; everything else is an indirect indicator', () => {
    assert.equal(priceKind('HG=F'), 'futures');
    assert.equal(priceKind('MOS'), 'proxy');
  });
});

describe('OSINT signals endpoint shaping', () => {
  it('unwraps the Redis payloads into plain fields', () => {
    assert.deepEqual(shapeQuotes({ quotes: [{ symbol: 'HG=F', price: '4.5', change: 1 }, { price: 1 }] }), [{ symbol: 'HG=F', price: 4.5, change: 1 }]);
    const z = shapeClimate([{ zone: 'Malacca Strait', location: { latitude: 2.5, longitude: 101.5 }, tempDelta: 0.1, precipDelta: 1.3, severity: 'ANOMALY_SEVERITY_NORMAL', type: 'T', period: 'P' }, { zone: 'no coords' }]);
    assert.equal(z.length, 1);
    assert.equal(z[0]!.lon, 101.5);
    const c = shapeComtrade({ fetchedAt: 'f', products: [{ hs4: '1001', year: 2024, description: 'Wheat', topExporters: [{ partnerIso2: 'CA', partnerCode: 124, share: 0.17 }] }] });
    assert.deepEqual(c, { reporter: 'IT', fetchedAt: 'f', products: [{ hs4: '1001', year: 2024, description: 'Wheat', suppliers: [{ iso2: 'CA', code: 124, share: 0.17 }] }] });
    assert.deepEqual(shapeComtrade(null).products, []);
  });
});
