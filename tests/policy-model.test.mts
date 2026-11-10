import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoodsMeasures, isVerifiedStatus, shortTitle } from '../src/apps/policy/model.ts';
import { STRATEGIC_GOODS } from '../src/config/thesis-model.ts';

describe('Policy goods × measures', () => {
  const entries = [
    { id: 'a', title: 'Reg. 833/2014 — energia', goods: ['2709', '2711'], status: 'da verificare' },
    { id: 'b', title: 'Reg. X — greggio', goods: ['2709'], status: 'verificata (T, 13/10/2026)' },
    { id: 'c', title: 'Quadro', goods: [], status: 'verificata (P)' },
  ];
  const acts = [
    { celex: '1', date: '2026-09-01', title: 'old', url: 'u1', goods: ['2709'], measures: [] },
    { celex: '2', date: '2026-10-01', title: 'new', url: 'u2', goods: ['2709'], measures: ['dazi'] },
    { celex: '3', date: '2026-10-02', title: 'other', url: 'u3', goods: [], measures: ['antidumping'] },
  ];
  const rows = buildGoodsMeasures(STRATEGIC_GOODS, entries, acts);
  const crude = rows.find((r) => r.good.hs === '2709')!;

  it('has one row per strategic good', () => {
    assert.equal(rows.length, STRATEGIC_GOODS.length);
  });

  it('lists the registry measures of the HS heading, verified first', () => {
    assert.deepEqual(crude.measures.map((m) => m.id), ['b', 'a']);
    assert.deepEqual(rows.find((r) => r.good.hs === '2711')!.measures.map((m) => m.id), ['a']);
  });

  it('attaches only the acts naming the good, newest first', () => {
    assert.deepEqual(crude.acts.map((a) => a.celex), ['2', '1']);
    assert.equal(rows.find((r) => r.good.hs === '8542')!.acts.length, 0);
  });

  it('reads the verification status and shortens titles', () => {
    assert.equal(isVerifiedStatus('in riesame (P)'), true);
    assert.equal(isVerifiedStatus('da verificare'), false);
    assert.equal(isVerifiedStatus(undefined), false);
    assert.equal(shortTitle('Reg. 833/2014 — energia'), 'Reg. 833/2014');
  });
});
