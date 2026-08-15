import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

const writes = [];
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body || '[]');
  if (body[0] === 'GET') {
    const key = body[1];
    const seeds = {
      'risk_sentinel:n8n:acled': [{ title: 'Attacco al porto', severity: 'critical', severityScore: 90, country: 'YE', nearChokepoint: 'Bab el-Mandeb', url: 'https://x/1' }],
      'risk_sentinel:n8n:usgs': [{ title: 'Sisma M6.2', severity: 'high', tradeImpactScore: 70, url: 'https://x/2' }],
      'risk_sentinel:n8n:commodities': [{ symbol: 'CL=F', name: 'WTI', alertLevel: 'elevated', price: 71 }],
      'policy:monitor:v1': { items: [{ title: 'Regolamento UE dazi', url: 'https://x/3' }] },
    };
    return new Response(JSON.stringify({ result: seeds[key] != null ? JSON.stringify(seeds[key]) : null }), { status: 200 });
  }
  writes.push(body);
  return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
};

const { default: digestHandler } = await import(pathToFileURL(resolve(root, 'api/notify/digest.js')).href);
const { default: configHandler } = await import(pathToFileURL(resolve(root, 'api/notify/config.js')).href);

describe('api/notify/digest contract', () => {
  it('aggregates dedicated n8n keys into ranked sections', async () => {
    const res = await digestHandler(new Request('https://x/api/notify/digest?topics=chokepoints,commodities&limit=5'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.digest.sections));
    const chokepoints = body.digest.sections.find((s) => s.topic === 'chokepoints');
    assert.ok(chokepoints, 'chokepoints section present');
    assert.equal(chokepoints.items[0].title, 'Attacco al porto', 'critical item ranks first');
    const commodities = body.digest.sections.find((s) => s.topic === 'commodities');
    assert.equal(commodities.items[0].title, 'CL=F');
  });

  it('policy topic reads the monitor items', async () => {
    const res = await digestHandler(new Request('https://x/api/notify/digest?topics=policy'));
    const body = await res.json();
    const policy = body.digest.sections.find((s) => s.topic === 'policy');
    assert.equal(policy.items[0].title, 'Regolamento UE dazi');
  });

  it('filters unknown topics and caps the limit', async () => {
    const res = await digestHandler(new Request('https://x/api/notify/digest?topics=ghost&limit=999'));
    const body = await res.json();
    assert.ok(Array.isArray(body.digest.sections));
    assert.equal(body.digest.sections.some((s) => s.topic === 'ghost'), false);
    for (const s of body.digest.sections) assert.ok(s.items.length <= 20);
  });

  it('rejects non-GET methods', async () => {
    const res = await digestHandler(new Request('https://x/api/notify/digest', { method: 'POST' }));
    assert.equal(res.status, 405);
  });
});

describe('api/notify/config contract', () => {
  const post = (body) => configHandler(new Request('https://x/api/notify/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));

  it('stores a valid config with seed-meta-free SET', async () => {
    const before = writes.length;
    const res = await post({
      endpoints: { telegram: { enabled: true, chatId: '123' }, email: { enabled: false } },
      frequency: 'hourly',
      topics: ['chokepoints'],
      enrichment: 'fact',
    });
    assert.equal(res.status, 200);
    const stored = writes.slice(before);
    assert.equal(stored.length, 1);
    assert.equal(stored[0][0], 'SET');
    assert.equal(stored[0][1], 'notify:config:v1');
    const parsed = JSON.parse(stored[0][2]);
    assert.equal(parsed.frequency, 'hourly');
  });

  it('rejects invalid frequency and topics', async () => {
    assert.equal((await post({ frequency: 'minutely' })).status, 400);
    assert.equal((await post({ topics: 'chokepoints' })).status, 400);
    assert.equal((await post(null)).status, 400);
  });

  it('GET returns null config when the key is missing', async () => {
    const res = await configHandler(new Request('https://x/api/notify/config'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.config, null);
  });
});
