import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { PROTOCOL_V0_1, nodeThreshold } from '../src/config/thesis-protocol.ts';
import { NODE_HAZARD_RADIUS_KM } from '../src/config/node-hazards.ts';
import { THESIS_NODES, TRIGGER_WORKING_RULES, nodeIntensityThreshold } from '../src/config/thesis-model.ts';
import * as engine from '../src/services/thesis/engine.ts';

const yaml = parse(readFileSync(new URL('../research/replay/protocol.yaml', import.meta.url), 'utf8'));

describe('thesis protocol: PROTOCOL_V0_1 mirrors research/replay/protocol.yaml', () => {
  it('hazard and availability parameters', () => {
    assert.equal(yaml.hazard.radius_km, PROTOCOL_V0_1.radiusKm);
    assert.equal(yaml.hazard.intensity_threshold.default, PROTOCOL_V0_1.intensityThreshold.default);
    assert.equal(yaml.hazard.intensity_threshold.chips, PROTOCOL_V0_1.intensityThreshold.chips);
    assert.equal(yaml.hazard.intensity_to_unit.zero_at, PROTOCOL_V0_1.intensityToUnit.zeroAt);
    assert.equal(yaml.hazard.intensity_to_unit.one_at, PROTOCOL_V0_1.intensityToUnit.oneAt);
    assert.deepEqual(yaml.hazard.gdacs_to_unit, PROTOCOL_V0_1.gdacsToUnit);
    assert.equal(yaml.availability.earthquake_latency_hours, PROTOCOL_V0_1.earthquakeLatencyHours);
    assert.equal(yaml.hazard.active_days.primary, PROTOCOL_V0_1.activeDays);
  });

  it('is still a proposal (not frozen)', () => {
    assert.equal(yaml.status, 'proposal');
    assert.equal(yaml.version, '0.1');
  });
});

describe('thesis protocol: one source for the platform and the engine', () => {
  it('engine re-exports the same object', () => {
    assert.equal(engine.PROTOCOL_V0_1, PROTOCOL_V0_1);
  });

  it('trigger working rules derive from the protocol', () => {
    assert.equal(TRIGGER_WORKING_RULES.radiusKm, PROTOCOL_V0_1.radiusKm);
    assert.deepEqual(TRIGGER_WORKING_RULES.intensityThreshold, PROTOCOL_V0_1.intensityThreshold);
    assert.equal(NODE_HAZARD_RADIUS_KM, PROTOCOL_V0_1.radiusKm);
  });

  it('nodeThreshold: chips threshold for HS 8542 nodes, default otherwise', () => {
    for (const n of THESIS_NODES) {
      const expected = n.goods.includes('8542') ? 5 : 6;
      assert.equal(nodeThreshold(n), expected, n.id);
      assert.equal(nodeIntensityThreshold(n), expected, n.id);
      assert.equal(nodeThreshold(n, TRIGGER_WORKING_RULES), expected, n.id);
    }
    assert.equal(nodeThreshold({}), PROTOCOL_V0_1.intensityThreshold.default);
    assert.equal(nodeThreshold({ goods: ['8542'] }, { intensityThreshold: { default: 7, chips: 4 } }), 4);
  });

  it('supplyFromIndicators is the mean used by supplyTerm', () => {
    assert.equal(engine.supplyFromIndicators(0.4, 0.2), (0.4 + 0.2) / 2);
    const imports = { hs: '8542', year: 2022, extraEuEur: 100, byPartner: { TW: 20, MY: 20, CN: 10 } };
    const s = engine.supplyTerm(imports, ['TW']);
    assert.equal(s.s, engine.supplyFromIndicators(s.share!, s.hhi!));
  });
});
