import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHANNEL_LABELS,
  buildGoodsMeasures,
  daysUntil,
  expiringSoon,
  fieldOrUnverified,
  groupByRole,
  isVerified,
  shortTitle,
  statusChip,
} from '../src/apps/policy/model.ts';
import { STRATEGIC_GOODS } from '../src/config/thesis-model.ts';

describe('Policy goods × measures', () => {
  const entries = [
    { id: 'a', title: 'Reg. 833/2014 — energia', role: 'modulatore', goods: ['2709', '2711'], statusCode: 'da-verificare' },
    { id: 'b', title: 'Reg. X — greggio', role: 'modulatore', goods: ['2709'], statusCode: 'verificata' },
    { id: 'c', title: 'Quadro', role: 'quadro', goods: ['2709'], statusCode: 'verificata' },
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

  it('lists only the modulator measures of the HS heading, verified first', () => {
    assert.deepEqual(crude.measures.map((m) => m.id), ['b', 'a']);
    assert.deepEqual(rows.find((r) => r.good.hs === '2711')!.measures.map((m) => m.id), ['a']);
  });

  it('attaches only the acts naming the good, newest first', () => {
    assert.deepEqual(crude.acts.map((a) => a.celex), ['2', '1']);
    assert.equal(rows.find((r) => r.good.hs === '8542')!.acts.length, 0);
  });

  it('shortens titles', () => {
    assert.equal(shortTitle('Reg. 833/2014 — energia'), 'Reg. 833/2014');
  });
});

describe('Policy verification status', () => {
  it('counts as verified only statusCode "verificata" (in riesame is not verified)', () => {
    assert.equal(isVerified({ statusCode: 'verificata' }), true);
    assert.equal(isVerified({ statusCode: 'in-riesame' }), false);
    assert.equal(isVerified({ statusCode: 'da-verificare' }), false);
    assert.equal(isVerified({ statusCode: null }), false);
    assert.equal(isVerified({}), false);
  });

  it('maps statusCode to the three chips', () => {
    assert.deepEqual(statusChip({ statusCode: 'verificata' }), { label: 'verificata', tone: 'ok' });
    assert.deepEqual(statusChip({ statusCode: 'in-riesame' }), { label: 'in riesame', tone: 'review' });
    assert.deepEqual(statusChip({ statusCode: 'da-verificare' }), { label: 'da verificare', tone: 'wip' });
    assert.deepEqual(statusChip({}), { label: 'da verificare', tone: 'wip' });
  });
});

describe('Policy register fields', () => {
  it('renders null, empty and missing fields as "da verificare"', () => {
    assert.equal(fieldOrUnverified(null), 'da verificare');
    assert.equal(fieldOrUnverified(undefined), 'da verificare');
    assert.equal(fieldOrUnverified(''), 'da verificare');
    assert.equal(fieldOrUnverified([]), 'da verificare');
    assert.equal(fieldOrUnverified('2026-11-19'), '2026-11-19');
    assert.equal(fieldOrUnverified(['RU', 'BY']), 'RU, BY');
    assert.equal(fieldOrUnverified(['origin', 'value'], CHANNEL_LABELS), 'origine, valore');
  });

  it('computes days to a date from the calendar day of now', () => {
    const now = new Date('2026-11-13T22:30:00Z');
    assert.equal(daysUntil('2026-11-19', now), 6);
    assert.equal(daysUntil('2026-11-13', now), 0);
    assert.equal(daysUntil('2026-11-12', now), -1);
    assert.equal(daysUntil(null, now), null);
    assert.equal(daysUntil('19/11/2026', now), null);
  });

  it('flags entries expiring within 30 days, not expired or later ones', () => {
    const now = new Date('2026-11-13T00:00:00Z');
    assert.equal(expiringSoon({ expiresOn: '2026-11-19' }, now), true);
    assert.equal(expiringSoon({ expiresOn: '2026-11-13' }, now), true);
    assert.equal(expiringSoon({ expiresOn: '2026-12-13' }, now), true);
    assert.equal(expiringSoon({ expiresOn: '2026-12-14' }, now), false);
    assert.equal(expiringSoon({ expiresOn: '2026-11-12' }, now), false);
    assert.equal(expiringSoon({ expiresOn: null }, now), false);
    assert.equal(expiringSoon({}, now), false);
  });

  it('groups quadro entries apart, modulators first among the measures', () => {
    const { measures, framework } = groupByRole([
      { id: 'q1', role: 'quadro' },
      { id: 'x', role: '' },
      { id: 'm1', role: 'modulatore' },
      { id: 'q2', role: 'quadro' },
      { id: 'm2', role: 'modulatore' },
    ]);
    assert.deepEqual(measures.map((e) => e.id), ['m1', 'm2', 'x']);
    assert.deepEqual(framework.map((e) => e.id), ['q1', 'q2']);
  });
});

describe('Policy register data (data/policy-registry.json)', () => {
  const registry = JSON.parse(readFileSync(new URL('../data/policy-registry.json', import.meta.url), 'utf8'));
  const inox = registry.entries.find((e: { id: string }) => e.id === 'eu-reg-2021-2012-inox');

  it('shows the stainless-steel anti-dumping as "in riesame" without an expiry date, not verified', () => {
    // An expiry review was initiated (OJ C/2026/4857, 15/9/2026): under Art. 11(2) of
    // Regulation (EU) 2016/1036 the measure stays in force pending the review, so the
    // 19/11/2026 expiry announced in OJ C/2026/1026 no longer applies (expiresOn null).
    const now = new Date('2026-11-13T09:00:00Z');
    assert.equal(inox.expiresOn, null);
    assert.equal(inox.inForceFrom, '2021-11-19');
    assert.equal(expiringSoon(inox, now), false);
    assert.equal(statusChip(inox).label, 'in riesame');
    assert.equal(isVerified(inox), false);
  });
});
