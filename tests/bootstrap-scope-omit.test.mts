import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_CACHE_KEYS } from '../api/_bootstrap-tier-keys.js';
import { OUT_OF_SCOPE_BOOTSTRAP, OUT_OF_SCOPE_BOOTSTRAP_KEYS } from '../src/config/scope.ts';

describe('bootstrap keys of switched-off scope groups', () => {
  it('names only real bootstrap keys', () => {
    const known = new Set(Object.keys(BOOTSTRAP_CACHE_KEYS));
    for (const [group, keys] of Object.entries(OUT_OF_SCOPE_BOOTSTRAP_KEYS)) {
      for (const key of keys) assert.ok(known.has(key), `${group}: ${key} is not a bootstrap key`);
    }
  });

  it('keeps the keys still read by in-scope panels', () => {
    for (const key of ['ecbFxRates', 'commodityQuotes', 'earthquakes', 'theaterPosture', 'ucdpEvents']) {
      assert.ok(!OUT_OF_SCOPE_BOOTSTRAP.includes(key), `${key} must stay in the bootstrap`);
    }
  });

  it('is what the SPA asks the server to omit', async () => {
    const { bootstrapTierPath } = await import('../src/services/bootstrap.ts');
    const omit = new URL(bootstrapTierPath('slow', []), 'http://x').searchParams.get('omit')?.split(',') ?? [];
    assert.deepEqual(omit, [...OUT_OF_SCOPE_BOOTSTRAP]);
  });

  it('adds the keys the thesis app never reads', async () => {
    const { bootstrapTierPath } = await import('../src/services/bootstrap.ts');
    const { THESIS_APP } = await import('../src/config/apps.ts');
    const known = new Set(Object.keys(BOOTSTRAP_CACHE_KEYS));
    for (const key of THESIS_APP.bootstrapOmit ?? []) assert.ok(known.has(key), `${key} is not a bootstrap key`);
    const omit = new URL(bootstrapTierPath('slow', THESIS_APP.bootstrapOmit), 'http://x').searchParams.get('omit')?.split(',') ?? [];
    for (const key of ['pipelinesGas', 'storageFacilities', ...OUT_OF_SCOPE_BOOTSTRAP]) assert.ok(omit.includes(key), key);
    assert.ok(!omit.includes('naturalEvents'), 'natural events feed the thesis map preset');
  });
});
