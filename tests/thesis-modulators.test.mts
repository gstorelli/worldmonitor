import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRATEGIC_GOODS } from '../src/config/thesis-model.ts';
import {
  coveredByRegistry,
  handFactDuplicates,
  isCensusPlaceholder,
  registryModulatorsFor,
} from '../src/services/thesis/modulators.ts';

const registry = JSON.parse(readFileSync(new URL('../data/policy-registry.json', import.meta.url), 'utf8'));

describe('registryModulatorsFor', () => {
  const fixture = {
    entries: [
      { id: 'a', title: 'A', role: 'modulatore', goods: ['2709', '2711'], statusCode: 'da-verificare' },
      { id: 'b', title: 'B', role: 'modulatore', goods: ['2709'], statusCode: 'verificata' },
      { id: 'c', title: 'C', role: 'quadro', goods: ['2709'], statusCode: 'verificata' },
      { id: 'd', title: 'D', role: 'modulatore', goods: [], statusCode: 'in-riesame' },
      { id: 'e', title: 'E', role: 'modulatore', statusCode: 'verificata' },
    ],
  };

  it('keeps only modulators naming the HS heading, verified first', () => {
    assert.deepEqual(registryModulatorsFor(fixture, '2709').map((e) => e.id), ['b', 'a']);
    assert.deepEqual(registryModulatorsFor(fixture, '2711').map((e) => e.id), ['a']);
    assert.deepEqual(registryModulatorsFor(fixture, '7502'), []);
  });

  it('accepts the bare entries array', () => {
    assert.deepEqual(registryModulatorsFor(fixture.entries, '2709').map((e) => e.id), ['b', 'a']);
  });

  it('counts as covered only with a verified modulator', () => {
    assert.equal(coveredByRegistry(fixture, '2709'), true);
    assert.equal(coveredByRegistry(fixture, '2711'), false);
  });

  it('finds the register entries of the real register', () => {
    assert.deepEqual(registryModulatorsFor(registry, '7601').map((e: { id: string }) => e.id), ['eu-reg-2025-395-alluminio']);
    assert.deepEqual(registryModulatorsFor(registry, '2711').map((e: { id: string }) => e.id), ['eu-reg-833-2014-energia-russa']);
  });
});

describe('thesis-model placeholders vs the policy register', () => {
  it('keeps a "da censire" placeholder exactly when no verified register modulator covers the HS', () => {
    for (const g of STRATEGIC_GOODS) {
      const placeholder = g.modulators.some(isCensusPlaceholder);
      assert.equal(placeholder, !coveredByRegistry(registry, g.hs), `HS ${g.hs}`);
    }
  });

  it('keeps the wheat placeholder while its register entry is not verified', () => {
    const wheat = STRATEGIC_GOODS.find((g) => g.hs === '1001')!;
    assert.ok(wheat.modulators.some(isCensusPlaceholder));
    assert.ok(registryModulatorsFor(registry, '1001').every((e: { statusCode: string }) => e.statusCode !== 'verificata'));
  });
});

describe('hand-written modulators that duplicate the register (to consolidate later)', () => {
  // Listed, not resolved: a later decision says which copy stays.
  // Update this list deliberately when thesis-model.ts or the register changes.
  it('lists the known duplicates', () => {
    const dups = handFactDuplicates(STRATEGIC_GOODS, registry).map((d) => `${d.hs} ${d.entryId} ${d.match} ${d.sameGood ? 'same-good' : 'other-goods'}`);
    assert.deepEqual(dups, [
      '8542 eu-chpl-2024 url same-good',
      '7502 wto-ds592-nichel-indonesia url same-good',
      '7502 eu-reg-2021-2012-inox reference other-goods',
    ]);
  });

  it('matches URLs regardless of scheme and trailing slash', () => {
    const goods = [{ ...STRATEGIC_GOODS[0]!, hs: 'x', modulators: [{ text: { it: 'f', en: 'f' }, url: 'http://Example.org/a/', status: 'verified' as const }] }];
    const dups = handFactDuplicates(goods, [{ id: 'r', title: 'R', role: 'modulatore', url: 'https://example.org/a', goods: ['x'] }]);
    assert.deepEqual(dups, [{ hs: 'x', fact: 'f', entryId: 'r', match: 'url', sameGood: true }]);
  });
});
