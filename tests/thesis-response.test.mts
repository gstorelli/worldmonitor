import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { THESIS_NODES, STRATEGIC_GOODS } from '../src/config/thesis-model.ts';
import { GOOD_CHANNELS, POLICY_SCENARIOS, RESPONSE_ACTIONS } from '../src/config/thesis-response.ts';
import { buildNodeChain } from '../src/services/thesis/risk-chain.ts';
import {
  hypotheticalChain,
  incentiveEffect,
  responsesForChain,
  scenarioOutcome,
} from '../src/services/thesis/response.ts';

const node = (id: string) => {
  const n = THESIS_NODES.find((x) => x.id === id);
  assert.ok(n, `node ${id}`);
  return n;
};

describe('response outlook (PoC)', () => {
  it('suggests nothing without a trigger on the node (rule of the model)', () => {
    const r = responsesForChain(buildNodeChain(node('morowali'), [], null));
    assert.equal(r.blockedBy, 'no-trigger');
    assert.deepEqual(r.goods, []);
  });

  it('suggests nothing for a minor trigger', () => {
    const n = node('morowali');
    const minor = { id: 'q', kind: 'earthquake' as const, source: 'EMSC', title: 'x', lat: n.lat, lon: n.lon, time: 1, magnitude: 4.8 };
    assert.equal(responsesForChain(buildNodeChain(n, [minor], null)).blockedBy, 'minor-trigger');
  });

  it('does not invent goods for a strait whose flows are not estimated yet', () => {
    assert.equal(responsesForChain(hypotheticalChain(node('suez'), 1)).blockedBy, 'no-goods');
  });

  it('derives channel actions and capacity for a hit production node', () => {
    const r = responsesForChain(hypotheticalChain(node('morowali'), 1));
    assert.equal(r.blockedBy, null);
    const [g] = r.goods;
    assert.equal(g!.hs, '7502');
    assert.deepEqual(g!.channels, ['origin', 'classification']);
    const channels = new Set(g!.actions.map((a) => a.channel));
    assert.ok(channels.has('capacity'));
    assert.ok(!channels.has('value'), 'value is not a documented channel for nickel');
  });

  it('keeps only capacity when the channels of a good are not documented', () => {
    const fake = { ...node('antofagasta') };
    const r = responsesForChain(hypotheticalChain(fake, 1));
    assert.deepEqual(r.goods[0]!.channels, []);
    assert.deepEqual([...new Set(r.goods[0]!.actions.map((a) => a.channel))], ['capacity']);
  });

  it('maps measure changes to incentive directions without magnitudes', () => {
    assert.deepEqual(incentiveEffect('origin-specific', 'introduce'), { origin: 'up', value: 'same', classification: 'same' });
    assert.deepEqual(incentiveEffect('origin-specific', 'remove'), { origin: 'down', value: 'same', classification: 'same' });
    assert.deepEqual(incentiveEffect('erga-omnes-duty', 'lower'), { origin: 'same', value: 'down', classification: 'down' });
    assert.deepEqual(incentiveEffect('export-restriction', 'introduce'), { origin: 'same', value: 'same', classification: 'up' });
  });

  it('marks a modulator change as structural when no trigger hits the good', () => {
    const chains = THESIS_NODES.map((n) => buildNodeChain(n, [], null));
    assert.equal(scenarioOutcome('origin-specific', 'remove', '7502', chains).amplifiedByTrigger, false);
    const hit = chains.map((c) => (c.node.id === 'weda-bay' ? hypotheticalChain(c.node, 1) : c));
    assert.equal(scenarioOutcome('origin-specific', 'remove', '7502', hit).amplifiedByTrigger, true);
  });

  it('references only goods of the registry and sourced or todo bases', () => {
    const hs = new Set(STRATEGIC_GOODS.map((g) => g.hs));
    for (const c of GOOD_CHANNELS) assert.ok(hs.has(c.hs), c.hs);
    for (const s of POLICY_SCENARIOS) {
      assert.ok(s.hs === '*' || hs.has(s.hs), s.id);
      assert.ok(s.basis.status === 'todo' || s.basis.source, `${s.id} needs a source`);
    }
    for (const a of RESPONSE_ACTIONS) {
      assert.ok(a.text.it.includes('{hs}') && a.text.en.includes('{hs}'), a.id);
      assert.ok(a.basis.status === 'todo' || a.basis.source, `${a.id} needs a source`);
    }
  });
});
