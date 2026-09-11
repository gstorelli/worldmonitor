import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const { deriveConcentrationAlerts } = await import(
  pathToFileURL(join(here, '..', 'api', 'customs', 'comtrade.js')).href
);

const payload = (iso2, products) => ({ iso2, products, fetchedAt: '2026-01-01T00:00:00.000Z' });

const product = (hs4, share, overrides = {}) => {
  const rest = Math.max(0, 1 - share);
  return {
    hs4,
    description: `prodotto ${hs4}`,
    totalValue: 1_000_000,
    year: 2025,
    topExporters: [
      { partnerIso2: 'CN', partnerCode: 156, value: share * 1_000_000, share },
      { partnerIso2: 'DE', partnerCode: 276, value: (rest / 2) * 1_000_000, share: rest / 2 },
      { partnerIso2: 'US', partnerCode: 842, value: (rest / 2) * 1_000_000, share: rest / 2 },
    ],
    ...overrides,
  };
};

describe('comtrade concentration alerts (derived from seeded bilateral HS4)', () => {
  it('maps supplier shares to severity and drops low-concentration lines', () => {
    const alerts = deriveConcentrationAlerts([
      payload('IT', [product('2710', 0.8), product('8507', 0.5), product('7208', 0.3)]),
    ]);
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0].severity, 'critical');
    assert.equal(alerts[0].metadata.hs4, '2710');
    assert.equal(alerts[1].severity, 'medium');
    assert.equal(alerts[1].metadata.hs4, '8507');
  });

  it('orders by severity then concentration and marks alerts as derived', () => {
    const alerts = deriveConcentrationAlerts([
      payload('DE', [product('1006', 0.5), product('8703', 0.9)]),
      payload('FR', [product('3004', 0.65)]),
    ]);
    assert.deepEqual(alerts.map((a) => a.severity), ['critical', 'high', 'medium']);
    assert.equal(alerts[0].metadata.iso2, 'DE');
    assert.ok(alerts.every((a) => a.metadata.derived === true));
    assert.equal(alerts[0].source, 'UN_COMTRADE');
    assert.match(alerts[0].title, /HS 8703/);
    assert.match(alerts[0].title, /CN 90%/);
  });

  it('caps the alert list and ignores malformed payloads', () => {
    const products = Array.from({ length: 30 }, (_, i) => product(`99${i}`, 0.8));
    const alerts = deriveConcentrationAlerts(
      [null, {}, { iso2: 'XX', products: 'nope' }, payload('IT', products)],
      { maxAlerts: 5 },
    );
    assert.equal(alerts.length, 5);
  });

  it('ignores thin partner coverage that would fake a 100% concentration', () => {
    const thin = { hs4: '8542', totalValue: 1, year: 2025, topExporters: [{ partnerIso2: 'CL', partnerCode: 152, share: 1 }] };
    const twoPartners = {
      hs4: '8703',
      totalValue: 1,
      year: 2025,
      topExporters: [{ partnerIso2: 'DE', share: 0.9 }, { partnerIso2: 'FR', share: 0.1 }],
    };
    assert.deepEqual(deriveConcentrationAlerts([payload('IT', [thin, twoPartners])]), []);
  });

  it('resolves numeric partner codes to ISO2 for readable titles', () => {
    const numeric = {
      hs4: '8703',
      totalValue: 1_000_000,
      year: 2025,
      topExporters: [
        { partnerCode: 842, share: 0.8 },
        { partnerCode: 276, share: 0.15 },
        { partnerCode: 380, share: 0.05 },
      ],
    };
    const alerts = deriveConcentrationAlerts([payload('FR', [numeric])]);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].metadata.topExporter, 'US');
    assert.match(alerts[0].title, /US 80%/);
  });

  it('returns an empty list when there is no usable data', () => {
    assert.deepEqual(deriveConcentrationAlerts([]), []);
    assert.deepEqual(deriveConcentrationAlerts([{ iso2: 'IT', products: [product('2710', 0.2)] }]), []);
  });
});
