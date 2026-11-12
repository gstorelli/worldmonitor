import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GOOD_NODE_ORIGINS, supplyIndicators } from '../scripts/_eu-trade.mjs';
import { THESIS_NODES } from '../src/config/thesis-model.ts';
import { NODE_ORIGINS, originShare, supplierHhi } from '../src/services/thesis/engine.ts';

describe('supply indicators: seeder mirror of the thesis engine', () => {
  it('good -> node origins equals the production nodes of the registry', () => {
    const derived: Record<string, string[]> = {};
    for (const n of THESIS_NODES) for (const hs of n.goods) derived[hs] = [...new Set([...(derived[hs] ?? []), ...(NODE_ORIGINS[n.id] ?? [])])];
    assert.deepEqual(GOOD_NODE_ORIGINS, derived);
  });

  it('computes the same HHI and origin share as the engine', () => {
    const values = { EXT_EU27_2020: 100, WORLD: 180, TW: 20, MY: 20, CN: 10, DE: 50, IT: 30 };
    const s = supplyIndicators(values, ['TW'])!;
    const byPartner = { TW: 20, MY: 20, CN: 10 };
    assert.ok(Math.abs(s.hhi - supplierHhi({ hs: '8542', year: 2025, extraEuEur: 100, byPartner })!) < 1e-12);
    assert.equal(s.nodeOriginShare, originShare({ hs: '8542', year: 2025, extraEuEur: 100, byPartner }, ['TW']));
    assert.equal(s.suppliers, 3);
  });

  it('has no node share for goods without production nodes, and no answer without extra-EU total', () => {
    assert.equal(supplyIndicators({ EXT_EU27_2020: 10, US: 10 }, [])!.nodeOriginShare, null);
    assert.equal(supplyIndicators({ US: 10 }, ['US']), null);
  });
});
