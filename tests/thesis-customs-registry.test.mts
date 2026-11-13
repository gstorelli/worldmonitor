import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { customsAsOf, toEngineCustoms, type CustomsRegistryEntry } from '../src/services/thesis/customs-registry.ts';
import { customsTerm } from '../src/services/thesis/engine.ts';
import { GOOD_CHANNELS } from '../src/config/thesis-response.ts';
import registry from '../data/policy-registry.json' with { type: 'json' };

// Synthetic entries: dates and channels are test fixtures, not legal facts.
const entry = (over: Partial<CustomsRegistryEntry>): CustomsRegistryEntry => ({
  id: 'm1',
  role: 'modulatore',
  statusCode: 'verificata',
  goods: ['9999'],
  celex: null,
  inForceFrom: '2025-01-01',
  expiresOn: '2025-12-31',
  channels: ['origin'],
  ...over,
});
const reg = (...entries: CustomsRegistryEntry[]) => ({ entries });
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);

describe('customsAsOf (dated Policy register)', () => {
  it('counts a measure only from its entry into force', () => {
    const r = reg(entry({}));
    assert.equal(customsAsOf(r, '9999', at('2024-12-31')).provenance, 'none');
    const after = customsAsOf(r, '9999', at('2025-01-01'));
    assert.equal(after.provenance, 'registry');
    assert.deepEqual(after.channels, ['origin']);
    assert.equal(after.validFrom, at('2025-01-01'));
    assert.deepEqual(after.measures.map((m) => m.id), ['m1']);
  });

  it('stops counting at expiry (expiresOn exclusive) and keeps open-ended measures', () => {
    assert.equal(customsAsOf(reg(entry({})), '9999', at('2025-12-31')).provenance, 'none');
    assert.equal(customsAsOf(reg(entry({ expiresOn: null })), '9999', at('2040-01-01')).provenance, 'registry');
  });

  it('never counts a measure under review or not yet verified', () => {
    assert.equal(customsAsOf(reg(entry({ statusCode: 'in-riesame' })), '9999', at('2025-06-01')).provenance, 'none');
    assert.equal(customsAsOf(reg(entry({ statusCode: 'da-verificare' })), '9999', at('2025-06-01')).provenance, 'none');
    assert.equal(customsAsOf(reg(entry({ role: 'quadro' })), '9999', at('2025-06-01')).provenance, 'none');
  });

  it('does not treat an unknown entry into force or unassigned channels as in force', () => {
    assert.equal(customsAsOf(reg(entry({ inForceFrom: null })), '9999', at('2025-06-01')).provenance, 'none');
    assert.equal(customsAsOf(reg(entry({ channels: null })), '9999', at('2025-06-01')).provenance, 'none');
  });

  it('keeps "not computable" distinct from zero', () => {
    const none = customsAsOf(reg(), '9999', at('2025-06-01'));
    assert.equal(none.channels, null);
    assert.equal(customsTerm(toEngineCustoms(none, '9999'), at('2025-06-01')), null);
    const empty = customsAsOf(reg(entry({ channels: [] })), '9999', at('2025-06-01'));
    assert.equal(empty.provenance, 'registry');
    assert.equal(customsTerm(toEngineCustoms(empty, '9999'), at('2025-06-01')), 0);
  });

  it('takes the union of the channels of the measures in force', () => {
    const r = customsAsOf(
      reg(
        entry({ id: 'a', channels: ['origin', 'value'] }),
        entry({ id: 'b', inForceFrom: '2025-03-01', channels: ['value', 'classification'] }),
        entry({ id: 'c', goods: ['1111'], channels: ['classification'] }),
      ),
      '9999',
      at('2025-06-01'),
    );
    assert.deepEqual([...r.channels!].sort(), ['classification', 'origin', 'value']);
    assert.deepEqual(r.measures.map((m) => m.id), ['a', 'b']);
    assert.equal(r.validFrom, at('2025-03-01'));
    assert.equal(customsTerm(toEngineCustoms(r, '9999'), at('2025-06-01')), 1);
  });

  it('falls back to GOOD_CHANNELS with provenance "fallback" and no dated basis', () => {
    const fb = GOOD_CHANNELS[0]!;
    const r = customsAsOf(reg(), fb.hs, at('2025-06-01'));
    assert.equal(r.provenance, 'fallback');
    assert.deepEqual(r.channels, fb.channels);
    assert.equal(r.validFrom, null);
    assert.deepEqual(r.measures, []);
  });

  it('uses the undated fallback in the engine only in live mode', () => {
    const fb = GOOD_CHANNELS[0]!;
    const t = at('2021-03-23');
    const r = customsAsOf(reg(), fb.hs, t);
    assert.equal(r.provenance, 'fallback');
    // Default and 'none': not computable in a replay, never 0.
    assert.equal(toEngineCustoms(r, fb.hs).channels, null);
    assert.equal(customsTerm(toEngineCustoms(r, fb.hs), t), null);
    assert.equal(customsTerm(toEngineCustoms(r, fb.hs, { fallback: 'none' }), t), null);
    // 'live': provisional present-day value.
    assert.equal(customsTerm(toEngineCustoms(r, fb.hs, { fallback: 'live' }), t), fb.channels.length / 3);
  });

  it('fallback mode does not affect dated register measures', () => {
    const r = customsAsOf(reg(entry({})), '9999', at('2025-06-01'));
    assert.equal(customsTerm(toEngineCustoms(r, '9999', { fallback: 'none' }), at('2025-06-01')), 1 / 3);
    assert.equal(customsTerm(toEngineCustoms(r, '9999', { fallback: 'live' }), at('2025-06-01')), 1 / 3);
  });

  it('a qualifying register measure takes precedence over the fallback', () => {
    const fb = GOOD_CHANNELS[0]!;
    const r = customsAsOf(reg(entry({ goods: [fb.hs], channels: ['value'] })), fb.hs, at('2025-06-01'));
    assert.equal(r.provenance, 'registry');
    assert.deepEqual(r.channels, ['value']);
  });

  it('on today\'s register (channels not yet assigned) yields only fallback or none', () => {
    // Holds while no register entry has channels assigned (state of 13/11/2026).
    if (registry.entries.some((e) => e.channels !== null)) return;
    const now = at('2026-11-13');
    for (const hs of ['8542', '7502', '7601', '2709', '2711', '3105']) {
      const r = customsAsOf(registry, hs, now);
      const expected = GOOD_CHANNELS.some((g) => g.hs === hs) ? 'fallback' : 'none';
      assert.equal(r.provenance, expected, hs);
    }
  });
});
