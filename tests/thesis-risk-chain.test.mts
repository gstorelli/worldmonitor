import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChains,
  buildNodeChain,
  gdacsAlertFromTitle,
  haversineKm,
  matchEventsToNode,
  naturalEventsToTriggers,
  quakesToTriggers,
  type TriggerEvent,
} from '../src/services/thesis/risk-chain.ts';
import { STRATEGIC_GOODS, THESIS_NODES, TRIGGER_WORKING_RULES } from '../src/config/thesis-model.ts';
import { NODE_HAZARDS } from '../src/config/node-hazards.ts';
import { emscQueryUrl, parseEmsc, parseUsgs, usgsQueryUrl } from '../api/thesis/_catalogue.js';

const node = (id: string) => {
  const n = THESIS_NODES.find((x) => x.id === id);
  assert.ok(n, `node ${id} must exist`);
  return n;
};

const quake = (over: Partial<TriggerEvent>): TriggerEvent => ({
  id: 'q', kind: 'earthquake', source: 'EMSC', title: 't', lat: 0, lon: 0, time: 1, magnitude: 5, ...over,
});

describe('thesis registry', () => {
  it('covers the twelve nodes of the perimeter, Bab el-Mandeb as its own node', () => {
    assert.equal(THESIS_NODES.length, NODE_HAZARDS.length);
    assert.equal(THESIS_NODES.length, 12);
    assert.equal(node('bab-el-mandeb').chokepointId, 'bab_el_mandeb');
    assert.notEqual(node('bab-el-mandeb').chokepointId, node('suez').chokepointId);
  });

  it('maps every strait to a chokepoint and every production area to a strategic good', () => {
    for (const n of THESIS_NODES) {
      if (n.kind === 'strait') assert.ok(n.chokepointId, `${n.id} needs a chokepoint id`);
      else assert.ok(n.goods.length > 0, `${n.id} needs at least one HS heading`);
      for (const hs of n.goods) assert.ok(STRATEGIC_GOODS.some((g) => g.hs === hs), `HS ${hs} must be a strategic good`);
    }
  });

  it('keeps the eight strategic goods and only sourced facts marked verified', () => {
    assert.deepEqual(STRATEGIC_GOODS.map((g) => g.hs), ['8542', '7403', '7502', '7601', '2709', '2711', '1001', '3105']);
    for (const g of STRATEGIC_GOODS) {
      for (const f of [...g.criticality, ...g.supply, ...g.modulators]) {
        if (f.status === 'verified') assert.ok(f.source, `${g.hs}: a verified fact needs a source (${f.text.en})`);
      }
    }
    assert.deepEqual(STRATEGIC_GOODS.filter((g) => g.pilot).map((g) => g.hs), ['1001', '3105']);
  });
});

describe('trigger matching and gate rule', () => {
  it('computes great-circle distances', () => {
    assert.ok(Math.abs(haversineKm(0, 0, 0, 1) - 111.19) < 0.1);
    assert.equal(haversineKm(10, 10, 10, 10), 0);
  });

  it('matches only events inside the working radius', () => {
    const tainan = node('tainan');
    const near = quake({ id: 'near', lat: tainan.lat + 1, lon: tainan.lon }); // ~111 km
    const far = quake({ id: 'far', lat: tainan.lat + 4, lon: tainan.lon }); // ~445 km
    assert.deepEqual(matchEventsToNode(tainan, [near, far]).map((m) => m.event.id), ['near']);
  });

  it('gives no induced risk without a trigger', () => {
    const chain = buildNodeChain(node('suez'), [], null);
    assert.equal(chain.state, 'none');
    assert.deepEqual(chain.reasons, ['no-trigger']);
  });

  it('keeps minor triggers at monitor and escalates significant ones to assess', () => {
    const hs = node('hsinchu');
    const minor = quake({ lat: hs.lat, lon: hs.lon, magnitude: TRIGGER_WORKING_RULES.significantMw - 0.1 });
    const major = quake({ id: 'big', lat: hs.lat + 0.5, lon: hs.lon, magnitude: TRIGGER_WORKING_RULES.significantMw });
    assert.equal(buildNodeChain(hs, [minor], null).state, 'monitor');
    const chain = buildNodeChain(hs, [minor, major], null);
    assert.equal(chain.state, 'assess');
    assert.equal(chain.matches[0].event.id, 'big');
  });

  it('treats GDACS orange/red alerts as significant non-seismic triggers', () => {
    const bm = node('bab-el-mandeb');
    const events = naturalEventsToTriggers([
      { id: 'v1', title: '\u{1F7E0} Volcano X', category: 'volcanoes', lat: bm.lat, lon: bm.lon + 0.5, date: new Date(5) },
      { id: 'e1', title: 'quake', category: 'earthquakes', lat: bm.lat, lon: bm.lon, date: new Date(5) },
    ]);
    assert.equal(events.length, 1, 'earthquakes come from the catalogue, not from natural events');
    assert.equal(events[0].kind, 'volcano');
    assert.equal(events[0].alertLevel, 'orange');
    assert.equal(events[0].title, 'Volcano X');
    assert.equal(buildNodeChain(bm, events, null).state, 'assess');
    assert.equal(gdacsAlertFromTitle('plain'), null);
  });

  it('attaches PortWatch transit status to straits only', () => {
    const transit = new Map([['bab_el_mandeb', { dataAvailable: true, todayTotal: 30, wowChangePct: -12 }]]);
    const chains = buildChains(THESIS_NODES, [], transit);
    assert.equal(chains.find((c) => c.node.id === 'bab-el-mandeb')?.transit?.todayTotal, 30);
    assert.equal(chains.find((c) => c.node.id === 'tainan')?.transit, null);
  });
});

describe('earthquake catalogue normalisation', () => {
  it('parses EMSC FDSN JSON', () => {
    const quakes = parseEmsc({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: '20261001_0000001', geometry: { type: 'Point', coordinates: [121.6, 23.8, -35] },
          properties: { unid: '20261001_0000001', time: '2026-10-01T10:00:00.0Z', lat: 23.8, lon: 121.6, depth: 35, mag: 6.1, magtype: 'mw', flynn_region: 'TAIWAN' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0, 0] }, properties: { time: 'bad', mag: 5 } },
      ],
    });
    assert.equal(quakes.length, 1);
    assert.deepEqual(
      { lat: quakes[0].lat, lon: quakes[0].lon, depth: quakes[0].depthKm, mag: quakes[0].mag, src: quakes[0].source, place: quakes[0].place },
      { lat: 23.8, lon: 121.6, depth: 35, mag: 6.1, src: 'EMSC', place: 'TAIWAN' },
    );
    const triggers = quakesToTriggers(quakes);
    assert.equal(buildNodeChain(node('hsinchu'), triggers, null).state, 'assess');
  });

  it('parses USGS FDSN GeoJSON', () => {
    const quakes = parseUsgs({
      features: [{ id: 'us7000m9g4', geometry: { coordinates: [121.56, 23.82, 34.8] },
        properties: { mag: 7.4, magType: 'mww', place: '15 km S of Hualien City, Taiwan', time: 1712102292173, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000m9g4' } }],
    });
    assert.equal(quakes[0].mag, 7.4);
    assert.equal(quakes[0].depthKm, 34.8);
    assert.equal(quakes[0].source, 'USGS');
  });

  it('builds 30-day catalogue queries', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    assert.match(emscQueryUrl(now, 30, 4.5), /seismicportal\.eu.*minmag=4\.5.*starttime=2026-09-08T12%3A00%3A00/);
    assert.match(usgsQueryUrl(now, 30, 4.5), /earthquake\.usgs\.gov.*minmagnitude=4\.5/);
  });
});
