import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NODE_HAZARDS } from '../src/config/node-hazards.ts';

describe('node hazards: Chapter 3 return periods and GEM PGA', () => {
  const by = Object.fromEntries(NODE_HAZARDS.map((n) => [n.id, n]));

  it('every node has a return period and a GEM PGA', () => {
    for (const n of NODE_HAZARDS) {
      assert.ok(n.returnPeriodI6Years > 0, n.id);
      assert.ok(n.gemPgaG > 0 && n.gemPgaG < 2, n.id);
    }
  });

  it('matches Table 3.4: Tainan shortest, weak estimates flagged as in note a', () => {
    const sorted = [...NODE_HAZARDS].sort((a, b) => a.returnPeriodI6Years - b.returnPeriodI6Years);
    assert.equal(sorted[0].id, 'tainan');
    assert.equal(Math.round(by.hsinchu.returnPeriodI6Years), 17);
    assert.equal(Math.round(by.hormuz.returnPeriodI6Years), 96);
    for (const id of ['suez', 'bab-el-mandeb', 'hormuz', 'malacca', 'panama', 'gibraltar']) assert.equal(by[id].lowEvidenceI6, true, id);
    for (const id of ['taiwan-strait', 'antofagasta', 'morowali', 'weda-bay', 'hsinchu', 'tainan']) assert.equal(by[id].lowEvidenceI6, false, id);
  });

  it('matches the GEM comparison (results/hazard-stats/s8_gem_pga_nodes.csv)', () => {
    assert.equal(by.tainan.gemPgaG, 0.708);
    assert.equal(by.malacca.gemPgaG, 0.053);
  });
});
