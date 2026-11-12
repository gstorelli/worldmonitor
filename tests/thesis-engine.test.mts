import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { THESIS_NODES } from '../src/config/thesis-model.ts';
import type { TriggerEvent } from '../src/services/thesis/risk-chain.ts';
import {
  assessAt,
  availableAt,
  customsTerm,
  hazardOfSequence,
  intensityToUnit,
  originShare,
  sequencesGardnerKnopoff,
  supplierHhi,
  windowGardnerKnopoff,
  type PartnerImports,
} from '../src/services/thesis/engine.ts';

const node = (id: string) => THESIS_NODES.find((n) => n.id === id)!;
const T0 = Date.UTC(2024, 3, 2, 23, 58);
const quake = (id: string, mag: number, lat: number, lon: number, dtDays = 0, source = 'EMSC', depthKm = 35): TriggerEvent => ({
  id, kind: 'earthquake', source, title: id, lat, lon, time: T0 + dtDays * 86_400_000, magnitude: mag, magnitudeType: 'Mw', depthKm,
});
const imports: PartnerImports = { hs: '8542', year: 2022, extraEuEur: 100, byPartner: { TW: 20, MY: 20, CN: 10 } };
const customs = { hs: '8542', channels: ['origin', 'classification'], validFrom: 0 };

describe('thesis engine: sequences (Gardner-Knopoff, as in Chapter 3)', () => {
  it('windows equal research/hazard-stats/hazard_lib.py window_gk', () => {
    for (const [m, km, days] of [[5.0, 39.9945, 143.7143], [6.0, 53.1863, 499.3442], [7.4, 79.272, 945.5837]]) {
      const w = windowGardnerKnopoff(m);
      assert.ok(Math.abs(w.km - km) < 1e-3, `km ${m}`);
      assert.ok(Math.abs(w.days - days) < 1e-3, `days ${m}`);
    }
  });

  it('group aftershocks with their mainshock, keep distant events apart', () => {
    const seqs = sequencesGardnerKnopoff([
      quake('main', 7.4, 23.82, 121.56),
      quake('after', 6.1, 23.9, 121.6, 20),
      quake('far', 6.0, 10, 125, 3),
    ]);
    assert.equal(seqs.length, 2);
    const main = seqs.find((s) => s.id === 'main')!;
    assert.deepEqual(main.members.map((e) => e.id), ['main', 'after']);
  });
});

describe('thesis engine: layers', () => {
  it('maps intensity IV..VIII to 0..1', () => {
    assert.equal(intensityToUnit(4), 0);
    assert.equal(intensityToUnit(6), 0.5);
    assert.equal(intensityToUnit(9), 1);
  });

  it('gives the Chapter 3 intensity for Hualien 2024 at Hsinchu and opens the chip gate', () => {
    const [seq] = sequencesGardnerKnopoff([quake('hualien', 7.4, 23.8356, 121.5976, 0, 'USGS', 35)]);
    const hz = hazardOfSequence(node('hsinchu'), seq)!;
    assert.ok(hz.distanceKm > 115 && hz.distanceKm < 125, String(hz.distanceKm));
    assert.ok(hz.intensity! > 5.8 && hz.intensity! < 6.0, String(hz.intensity));
    assert.equal(hz.gate, true);
  });

  it('computes origin share and supplier HHI on extra-EU totals', () => {
    assert.equal(originShare(imports, ['TW']), 0.2);
    assert.ok(Math.abs(supplierHhi(imports)! - (0.04 + 0.04 + 0.01)) < 1e-12);
    assert.equal(originShare({ ...imports, extraEuEur: 0 }, ['TW']), null);
  });

  it('applies customs measures only from their date of entry into force (as-of)', () => {
    assert.ok(Math.abs(customsTerm(customs, 1)! - 2 / 3) < 1e-12);
    assert.equal(customsTerm({ ...customs, validFrom: 10 }, 5), null);
    assert.equal(customsTerm({ ...customs, channels: null }, 5), null);
  });
});

describe('thesis engine: assessment and model rule', () => {
  const base = { hs: '8542', imports, customs };

  it('F1 and F2 are zero without a trigger; R0 is not (the documented flaw of additive scores)', () => {
    const a = assessAt({ ...base, node: node('hsinchu'), events: [] }, T0, 'EMSC');
    assert.equal(a.f1, 0);
    assert.equal(a.f2, 0);
    assert.ok(a.r0! > 0);
  });

  it('a significant trigger opens F1 and F2 at a production node', () => {
    const ev = [quake('hualien', 7.4, 23.8356, 121.5976)];
    const a = assessAt({ ...base, node: node('hsinchu'), events: ev }, T0 + 2 * 3_600_000, 'EMSC');
    assert.equal(a.sequenceId, 'hualien');
    assert.ok(a.f1! > 0 && a.f2! > 0);
    assert.equal(a.evidence, 1);
  });

  it('uses only events available at t (origin time + latency)', () => {
    const ev = [quake('hualien', 7.4, 23.8356, 121.5976)];
    assert.equal(availableAt(ev, T0 + 30 * 60_000).length, 0);
    const a = assessAt({ ...base, node: node('hsinchu'), events: ev }, T0 + 30 * 60_000, 'EMSC');
    assert.equal(a.sequenceId, null);
    assert.equal(a.f1, 0);
  });

  it('closes the trigger activeDays after the latest member, and an aftershock reopens it', () => {
    const ev = [quake('main', 7.4, 23.8356, 121.5976), quake('after', 6.4, 23.9, 121.6, 20)];
    const at = (d: number) => assessAt({ ...base, node: node('hsinchu'), events: ev }, T0 + d * 86_400_000, 'EMSC');
    assert.ok(at(3).f1! > 0);
    assert.equal(at(10).f1, 0);
    assert.equal(at(10).sequenceId, null);
    assert.equal(at(21).sequenceId, 'main');
  });

  it('counts independent catalogues as evidence, without changing the risk', () => {
    const ev = [quake('e1', 7.4, 23.8356, 121.5976, 0, 'EMSC'), quake('u1', 7.4, 23.82, 121.56, 0, 'USGS')];
    const one = assessAt({ ...base, node: node('hsinchu'), events: [ev[0]] }, T0 + 2 * 3_600_000, 'EMSC');
    const two = assessAt({ ...base, node: node('hsinchu'), events: ev }, T0 + 2 * 3_600_000, 'EMSC');
    assert.equal(two.evidence, 2);
    assert.equal(two.f1, one.f1);
  });

  it('is not computable for a strait (link and origins not specified), never zero', () => {
    const a = assessAt({ ...base, node: node('suez'), events: [] }, T0, 'EMSC');
    assert.equal(a.f1, null);
    assert.ok(a.missing.includes('link') && a.missing.includes('supply'));
  });

  it('gives no risk for a good that does not depend on the node', () => {
    const ev = [quake('hualien', 7.4, 23.8356, 121.5976)];
    const a = assessAt({ ...base, hs: '7403', node: node('hsinchu'), events: ev }, T0 + 2 * 3_600_000, 'EMSC');
    assert.equal(a.link, 0);
    assert.equal(a.f1, 0);
    assert.equal(a.f2, 0);
  });
});
