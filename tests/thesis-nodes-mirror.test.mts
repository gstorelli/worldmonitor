import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NODE_HAZARDS } from '../src/config/node-hazards.ts';
import { THESIS_NODES, bboxAround } from '../scripts/_thesis-nodes.mjs';

describe('thesis nodes mirror for seeders', () => {
  it('matches src/config/node-hazards.ts (id, name, reference point)', () => {
    assert.deepEqual(
      THESIS_NODES.map(({ id, name, lat, lon }) => ({ id, name, lat, lon })),
      NODE_HAZARDS.map(({ id, name, lat, lon }) => ({ id, name, lat, lon })),
    );
  });

  it('builds a ~300 km box around a node', () => {
    const [w, s, e, n] = bboxAround(0, 0).split(',').map(Number);
    assert.ok(Math.abs(n - 2.7) < 0.01 && Math.abs(s + 2.7) < 0.01);
    assert.ok(Math.abs(e - 2.7) < 0.01 && Math.abs(w + 2.7) < 0.01);
  });
});
