import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { THESIS_APP } from '../src/config/apps.ts';
import { getAllowedLayerKeys } from '../src/config/map-layer-definitions.ts';

describe('thesis view map layers', () => {
  it('include the preset layers', () => {
    for (const key of THESIS_APP.mapLayerPreset ?? []) assert.ok(THESIS_APP.mapLayers?.includes(key), key);
  });

  it('are offered by the full variant (default app is the thesis view)', () => {
    const allowed = getAllowedLayerKeys('full');
    for (const key of THESIS_APP.mapLayers ?? []) assert.ok(allowed.has(key as never), key);
    for (const key of ['nuclear', 'irradiators', 'spaceports', 'bases', 'conflicts', 'hotspots']) {
      assert.ok(!allowed.has(key as never), `${key} must not be offered in the thesis view`);
    }
  });
});
