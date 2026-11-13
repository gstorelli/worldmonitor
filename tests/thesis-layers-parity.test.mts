// The bibliography generator (scripts/) cannot import src/config/thesis-layers.ts,
// so its layer ids (section defaults, per-source overrides, generated data) must
// be a subset of the canonical list (13/11/2026).
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { canonicalLayerId, LEGACY_LAYER_IDS, THESIS_LAYER_IDS, THESIS_LAYERS } from '../src/config/thesis-layers.ts';
import { readLayerOverrides, SECTION_LAYERS } from '../scripts/build-research-bibliography.mjs';
import { MODEL_LAYERS } from '../src/apps/research/layers.ts';

const known = new Set(THESIS_LAYER_IDS);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('thesis layers parity', () => {
  it('lists the six chain layers in order, plus modulator, signal, method and platform', () => {
    assert.deepEqual(
      THESIS_LAYERS.filter((layer) => layer.kind === 'chain').map((layer) => [layer.position, layer.id]),
      [[1, 'trigger'], [2, 'node'], [3, 'good'], [4, 'supply'], [5, 'customs-vulnerability'], [6, 'customs-risk']],
    );
    for (const id of ['modulator', 'signal', 'method', 'platform']) assert.ok(known.has(id), id);
    assert.equal(new Set(THESIS_LAYER_IDS).size, THESIS_LAYER_IDS.length, 'ids are unique');
  });

  it('section defaults of the generator use only canonical ids', () => {
    for (const [section, layers] of Object.entries(SECTION_LAYERS)) {
      for (const layer of layers as string[]) assert.ok(known.has(layer), `${section}: ${layer}`);
    }
  });

  it('per-source overrides use only canonical ids', () => {
    for (const [key, layers] of readLayerOverrides(readJson('../data/research-layer-overrides.json'))) {
      for (const layer of layers as string[]) assert.ok(known.has(layer), `${key}: ${layer}`);
    }
  });

  it('the generated bibliography uses only canonical ids', () => {
    for (const source of readJson('../data/zotero-sources.json').sources) {
      for (const layer of source.layers) assert.ok(known.has(layer), `${source.key}: ${layer}`);
    }
  });

  it('legacy ids map to canonical ids, and Research shows every layer', () => {
    for (const legacy of Object.keys(LEGACY_LAYER_IDS)) assert.ok(known.has(canonicalLayerId(legacy)), legacy);
    assert.equal(canonicalLayerId('customs'), 'customs-vulnerability');
    assert.deepEqual(MODEL_LAYERS.map((layer) => layer.id), [...THESIS_LAYER_IDS]);
  });
});
