import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import handler from '../api/osint/signals.js';

const REDIS_URL = 'https://redis.test';
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
};

const FETCHED_MS = Date.UTC(2026, 10, 12, 6, 0, 0);
const envelope = (data, sourceVersion) => JSON.stringify({
  _seed: { fetchedAt: FETCHED_MS, recordCount: 1, sourceVersion, schemaVersion: 1, state: 'OK' },
  data,
});
const meta = (sourceVersion) => JSON.stringify({ fetchedAt: FETCHED_MS, recordCount: 1, sourceVersion });

const STORE = {
  'market:commodities-bootstrap:v1': JSON.stringify({ quotes: [{ symbol: 'ALI=F', price: 2500, change: 1.2 }] }),
  'risk_sentinel:n8n:openmeteo': JSON.stringify([
    { zone: 'Zone A', location: { latitude: 10, longitude: 20 }, tempDelta: 1, precipDelta: 0, severity: 'x', type: 'y', period: 'p' },
  ]),
  'comtrade:bilateral-hs4:IT:v1': JSON.stringify({
    fetchedAt: '2026-11-01T00:00:00.000Z',
    products: [{ hs4: '7601', year: 2025, description: 'Aluminium', topExporters: [{ partnerIso2: 'DE', partnerCode: 276, share: 0.3 }] }],
  }),
  'climate:anomalies:v2': envelope({
    anomalies: [
      {
        zone: 'Taiwan',
        location: { latitude: 23.7, longitude: 121 },
        tempDelta: 1.4,
        precipDelta: -2.1,
        severity: 'ANOMALY_SEVERITY_NORMAL',
        type: 'ANOMALY_TYPE_WARM',
        period: '2026-11-01 to 2026-11-07',
      },
      { zone: 'No location', tempDelta: 1, precipDelta: 1, period: 'p' },
    ],
  }, 'open-meteo-archive-wmo-1991-2020-v1'),
  'trade:eu-goods:v1': envelope({
    sources: { imports: 'Eurostat Comext DS-045409' },
    goods: {
      '8542': {
        imports: {
          IT: { reporter: 'IT', year: 2025, extraEuEur: 10 },
          EU27_2020: {
            reporter: 'EU27_2020',
            year: 2025,
            extraEuEur: 1000,
            supply: { hhi: 0.21, suppliers: 12, nodeOrigins: ['TW'], nodeOriginShare: 0.18 },
          },
        },
      },
      '7601': { imports: { EU27_2020: { reporter: 'EU27_2020', year: 2024, extraEuEur: 500 } } },
      '2709': { imports: { IT: { reporter: 'IT', year: 2025, extraEuEur: 1 } } },
    },
  }, 'comext-ds045409-wto-hs-v1'),
  'seed-meta:market:commodities': meta('yahoo'),
  'seed-meta:n8n:openmeteo': meta('n8n'),
  'seed-meta:comtrade:bilateral-hs4': meta(''),
  'seed-meta:climate:anomalies': meta('open-meteo-archive-wmo-1991-2020-v1'),
  'seed-meta:trade:eu-goods': meta('comext-ds045409-wto-hs-v1'),
};

let store = {};
let pipelineCalls = 0;

function stubUpstash() {
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(String(url), `${REDIS_URL}/pipeline`);
    pipelineCalls += 1;
    const commands = JSON.parse(init.body);
    const entries = commands.map(([cmd, key]) => {
      assert.equal(cmd, 'GET');
      return { result: Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null };
    });
    return new Response(JSON.stringify(entries), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

async function callHandler() {
  const res = await handler(new Request('https://example.test/api/osint/signals'));
  assert.equal(res.status, 200);
  return res.json();
}

describe('/api/osint/signals', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = REDIS_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    pipelineCalls = 0;
    stubUpstash();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_ENV.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_ENV.url;
    if (ORIGINAL_ENV.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_ENV.token;
  });

  it('keeps the v1 fields and adds climateEra5, euSupply and sources on a hit', async () => {
    store = { ...STORE };
    const body = await callHandler();
    assert.equal(pipelineCalls, 1, 'one Redis round trip for data and freshness keys');

    // v1 fields, unchanged
    assert.deepEqual(body.status, { quotes: 'hit', climate: 'hit', comtradeIT: 'hit', climateEra5: 'hit', euSupply: 'hit' });
    assert.deepEqual(body.quotes, [{ symbol: 'ALI=F', price: 2500, change: 1.2 }]);
    assert.equal(body.climate.length, 1);
    assert.equal(body.climate[0].zone, 'Zone A');
    assert.equal(body.comtradeIT.products[0].hs4, '7601');

    // climateEra5: values and the baseline declared by the seeder, no labels
    assert.equal(body.climateEra5.baseline, '1991-2020');
    assert.equal(body.climateEra5.sourceVersion, 'open-meteo-archive-wmo-1991-2020-v1');
    assert.deepEqual(body.climateEra5.zones, [
      { zone: 'Taiwan', lat: 23.7, lon: 121, tempDelta: 1.4, precipDelta: -2.1, period: '2026-11-01 to 2026-11-07' },
    ]);

    // euSupply: EU27 extra-EU entries only, supply null when not measured
    assert.equal(body.euSupply.reporter, 'EU27_2020');
    assert.deepEqual(body.euSupply.products, [
      { hs4: '7601', year: 2024, extraEuEur: 500, supply: null },
      { hs4: '8542', year: 2025, extraEuEur: 1000, supply: { hhi: 0.21, nodeOrigins: ['TW'], nodeOriginShare: 0.18 } },
    ]);

    // sources: status, fetchedAt (payload first, then seed-meta) and dataset
    const fetchedIso = new Date(FETCHED_MS).toISOString();
    assert.deepEqual(body.sources.climateEra5, { status: 'hit', fetchedAt: fetchedIso, source: 'Open-Meteo ERA5 archive (seed-climate-anomalies)' });
    assert.deepEqual(body.sources.euSupply, { status: 'hit', fetchedAt: fetchedIso, source: 'Eurostat Comext DS-045409' });
    assert.equal(body.sources.comtradeIT.fetchedAt, '2026-11-01T00:00:00.000Z');
    assert.equal(body.sources.quotes.fetchedAt, fetchedIso);
    assert.equal(body.sources.climate.fetchedAt, fetchedIso);
  });

  it('reports a missing key as miss with no fetchedAt, never as an empty success', async () => {
    store = { 'seed-meta:climate:anomalies': STORE['seed-meta:climate:anomalies'] };
    const body = await callHandler();
    for (const name of ['quotes', 'climate', 'comtradeIT', 'climateEra5', 'euSupply']) {
      assert.equal(body.status[name], 'miss', `${name} status`);
      assert.equal(body.sources[name].status, 'miss', `${name} source status`);
      assert.equal(body.sources[name].fetchedAt, null, `${name} must not carry a fetchedAt on a miss`);
      assert.equal(typeof body.sources[name].source, 'string');
    }
    assert.deepEqual(body.quotes, []);
    assert.deepEqual(body.climateEra5.zones, []);
    assert.deepEqual(body.euSupply.products, []);
  });

  it('reports every source as error when Redis is not reachable', async () => {
    globalThis.fetch = async () => new Response('boom', { status: 500 });
    const body = await callHandler();
    for (const name of Object.keys(body.sources)) {
      assert.equal(body.sources[name].status, 'error');
      assert.equal(body.sources[name].fetchedAt, null);
    }
  });
});
