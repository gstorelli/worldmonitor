import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFeed,
  buildGoodRows,
  buildNodeRows,
  climateZoneForNode,
  importSentence,
  isClimateAnomaly,
  priceKind,
  supplierLabel,
  type OsintClimateZone,
} from '../src/apps/osint/model.ts';
import { THESIS_NODES, STRATEGIC_GOODS } from '../src/config/thesis-model.ts';
import { shapeClimate, shapeComtrade, shapeQuotes } from '../api/osint/signals.js';
import type { NodeChain } from '../src/services/thesis/risk-chain.ts';

const node = (id: string) => THESIS_NODES.find((n) => n.id === id)!;
const zone = (over: Partial<OsintClimateZone>): OsintClimateZone => ({
  zone: 'z', lat: 0, lon: 0, tempDelta: 0, precipDelta: 0, severity: 'ANOMALY_SEVERITY_NORMAL', type: 'ANOMALY_TYPE_STABLE', period: 'p', ...over,
});

describe('OSINT climate', () => {
  it('a NORMAL severity is not an anomaly', () => {
    assert.equal(isClimateAnomaly(zone({})), false);
    assert.equal(isClimateAnomaly(zone({ severity: 'ANOMALY_SEVERITY_MODERATE' })), true);
  });

  it('links a node to the nearest zone within the radius, or to none', () => {
    const zones = [zone({ zone: 'Strait of Hormuz', lat: 26.57, lon: 56.25 }), zone({ zone: 'Persian Gulf (Oil)', lat: 25.29, lon: 51.53 })];
    assert.equal(climateZoneForNode(node('hormuz'), zones, 300)?.zone.zone, 'Strait of Hormuz');
    assert.equal(climateZoneForNode(node('gibraltar'), zones, 300), null);
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
    const rows = buildNodeRows(chains, [], 300);
    assert.deepEqual(rows[0]!.triggers, { count: 2, significant: 1, maxMagnitude: 6.2, latest: quake });
    assert.equal(rows[1]!.triggers.count, 0);
    assert.equal(rows[1]!.transit?.todayTotal, 40);
  });

  it('lists events newest first in plain Italian', () => {
    const feed = buildFeed(chains);
    assert.equal(feed.length, 2);
    assert.equal(feed[0]!.time, 2000);
    assert.match(feed[0]!.text, /^Terremoto M6\.2, 30 km di profondità a 140 km — TAIWAN$/);
    assert.equal(feed[0]!.significant, true);
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
