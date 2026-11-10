import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { comextUrl, comextValuesByPartner, dutiesBySubheading, summariseImports, wtoUrl } from '../scripts/_eu-trade.mjs';

// Minimal JSON-stat answer: one value per partner (other dimensions of size 1).
const jsonStat = (partners) => ({
  id: ['freq', 'reporter', 'partner', 'product', 'flow', 'indicators', 'time'],
  size: [1, 1, partners.length, 1, 1, 1, 1],
  dimension: { partner: { category: { index: Object.fromEntries(partners.map(([c], i) => [c, i])), label: {} } } },
  value: Object.fromEntries(partners.map(([, v], i) => [String(i), v]).filter(([, v]) => v !== null)),
});

describe('Comext imports', () => {
  it('reads values by partner from JSON-stat', () => {
    assert.deepEqual(comextValuesByPartner(jsonStat([['WORLD', 100], ['DZ', 40], ['NL', null]])), { WORLD: 100, DZ: 40 });
    assert.deepEqual(comextValuesByPartner(null), {});
  });

  it('Italy: shares of total imports, intra-EU partners included', () => {
    const s = summariseImports('IT', 2025, { WORLD: 200, EXT_EU27_2020: 150, DZ: 80, NL: 50, AZ: 30, QA: 10 });
    assert.equal(s.totalEur, 200);
    assert.deepEqual(s.top.map((t) => [t.code, t.share]), [['DZ', 0.4], ['NL', 0.25], ['AZ', 0.15]]);
  });

  it('EU27: shares of extra-EU imports, member states excluded', () => {
    const s = summariseImports('EU27_2020', 2025, { EXT_EU27_2020: 100, INT_EU27_2020: 999, NO: 22, DE: 500, IS: 12, MZ: 9 });
    assert.equal(s.totalEur, 100);
    assert.deepEqual(s.top.map((t) => t.code), ['NO', 'IS', 'MZ']);
    assert.equal(s.basis, 'extra-EU imports');
  });

  it('builds the Comext query', () => {
    assert.match(comextUrl('IT', '7601', 2025), /DS-045409\?.*reporter=IT&product=7601&flow=1&indicators=VALUE_IN_EUROS&freq=A&time=2025/);
  });
});

describe('WTO duties', () => {
  const row = (code, year, value, label = 'x') => ({ ProductOrSectorCode: code, ProductOrSector: label, Year: year, Value: value });

  it('keeps the latest year per HS6 and the lowest preferential duty', () => {
    const duties = dutiesBySubheading(
      [row('760110', 2023, 3), row('760110', 2024, 3, 'Aluminium, not alloyed'), row('760120', 2024, 4.7), row('7601', 2024, 9)],
      [row('760110', 2024, 0), row('760110', 2024, 1.5), row('760120', 2023, 2)],
    );
    assert.deepEqual(duties, [
      { hs6: '760110', label: 'Aluminium, not alloyed', year: 2024, mfn: 3, prefMin: 0 },
      { hs6: '760120', label: 'x', year: 2024, mfn: 4.7, prefMin: 2 },
    ]);
  });

  it('a specific (non ad valorem) duty stays null, not zero', () => {
    assert.deepEqual(dutiesBySubheading([row('100199', 2024, null)], []), [{ hs6: '100199', label: 'x', year: 2024, mfn: null, prefMin: null }]);
  });

  it('queries the EU (918) by HS heading', () => {
    assert.match(wtoUrl('HS_A_0010', '7601', [2023, 2024]), /i=HS_A_0010&r=918&pc=7601&ps=2023%2C2024/);
  });
});
