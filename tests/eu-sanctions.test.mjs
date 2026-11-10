import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateFsf, createFsfCollector } from '../scripts/_eu-sanctions.mjs';

function collect(entities) {
  const c = createFsfCollector();
  for (const e of entities) {
    c.onOpen('sanctionEntity', { euReferenceNumber: 'EU.1', logicalId: '1' });
    for (const [p, d] of e.regs) c.onOpen('regulation', { programme: p, publicationDate: d });
    c.onOpen('subjectType', { code: e.type });
    c.onOpen('nameAlias', { wholeName: 'Should Never Appear', firstName: 'X' });
    if (e.cit) c.onOpen('citizenship', { countryIso2Code: e.cit });
    if (e.addr) c.onOpen('address', { countryIso2Code: e.addr });
    c.onClose('sanctionEntity');
  }
  return c.records;
}

describe('EU sanctions aggregation', () => {
  const records = collect([
    { regs: [['UKR', '2026-10-01+02:00'], ['UKR', '2026-10-05']], type: 'enterprise', addr: 'RU', cit: 'CY' },
    { regs: [['UKR', '2022-03-01']], type: 'person', cit: 'RU' },
    { regs: [['IRN', '2024-05-01']], type: 'enterprise', addr: '00', cit: 'IR' },
  ]);

  it('keeps only aggregate fields, never names', () => {
    assert.deepEqual(Object.keys(records[0]).sort(), ['country', 'firstPublished', 'programme', 'subjectType']);
    assert.equal(JSON.stringify(records).includes('Should Never Appear'), false);
  });

  it('dates a designation by its first publication; enterprises by address country', () => {
    assert.equal(records[0].firstPublished, '2026-10-01');
    assert.equal(records[0].country, 'RU');
    assert.equal(records[2].country, 'IR'); // '00' (unknown address) falls back to citizenship
  });

  it('counts by regime, recent designations and enterprise countries', () => {
    const d = aggregateFsf(records, { now: new Date('2026-10-14T00:00:00Z'), generationDate: 'g' });
    assert.deepEqual({ total: d.total, persons: d.persons, enterprises: d.enterprises, recent: d.recent, last: d.lastDesignation }, { total: 3, persons: 1, enterprises: 2, recent: 1, last: '2026-10-01' });
    assert.deepEqual(d.programmes[0], { programme: 'UKR', total: 2, recent: 1, persons: 1, enterprises: 1 });
    assert.deepEqual(d.enterpriseCountries, [{ code: 'RU', count: 1 }, { code: 'IR', count: 1 }]);
    assert.equal(d.since, '2026-09-14');
  });
});
