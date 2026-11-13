import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
process.env.N8N_INGEST_SECRET = 'test-secret';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

const writes = [];
let readFailure = false;
globalThis.fetch = async (_url, opts) => {
  const body = JSON.parse(opts.body || '[]');
  if (body[0] === 'GET') {
    if (readFailure) throw new Error('redis unavailable');
    const key = body[1];
    const seeds = {
      // Fork: the retired ACLED key must not be read even if it still holds data.
      'risk_sentinel:n8n:acled': [{ title: 'ACLED item', severity: 'critical', severityScore: 99, url: 'https://x/0' }],
      'risk_sentinel:n8n:usgs': [
        { title: 'Sisma M6.2', severity: 'high', tradeImpactScore: 70, url: 'https://x/2' },
        { title: 'Sisma M7.1 vicino a Bab el-Mandeb', severity: 'critical', tradeImpactScore: 90, nearChokepoint: 'Bab el-Mandeb', url: 'https://x/1' },
      ],
      'risk_sentinel:n8n:commodities': [{ symbol: 'CL=F', name: 'WTI', alertLevel: 'elevated', price: 71 }],
      'policy:monitor:v1': { items: [{ title: 'Regolamento UE dazi', url: 'https://x/3' }] },
      // Shape written by scripts/seed-policy-eu-acts.mjs (classifier in
      // scripts/_policy-eu-acts.mjs). CELEX numbers are fixtures.
      'policy:eu-acts:v1': {
        windowDays: 30,
        scanned: 100,
        acts: [
          {
            celex: '32026R9001', date: daysAgo(1), documentDate: daysAgo(1), inForceFrom: null,
            title: 'Regolamento che modifica il dazio antidumping su alluminio greggio',
            url: 'https://x/kw', goods: ['7601'], goodMatches: [{ hs: '7601', match: 'keyword' }], measures: ['antidumping'],
          },
          {
            celex: '32026R9002', date: daysAgo(1), documentDate: daysAgo(1), inForceFrom: null,
            title: 'Regolamento relativo ai prodotti del codice NC 7502 10 00',
            url: 'https://x/cn', goods: ['7502'], goodMatches: [{ hs: '7502', match: 'cn' }], measures: [],
          },
          {
            celex: '32026R9003', date: daysAgo(1), documentDate: daysAgo(1), inForceFrom: null,
            title: 'Regolamento sui contingenti tariffari per prodotti tessili',
            url: 'https://x/unrelated', goods: [], goodMatches: [], measures: ['dazi'],
          },
          {
            celex: '32026R9004', date: daysAgo(20), documentDate: daysAgo(20), inForceFrom: null,
            title: 'Regolamento relativo al codice NC 8542 31',
            url: 'https://x/old', goods: ['8542'], goodMatches: [{ hs: '8542', match: 'cn' }], measures: [],
          },
        ],
      },
      'notify:config:v1': {
        frequency: 'hourly',
        topics: ['chokepoints'],
        enrichment: 'fact',
        endpoints: {
          telegram: { enabled: true, botToken: 'tg-secret', chatId: '123' },
          email: { enabled: true, smtpUrl: 'smtp://user:pass@host', from: 'a@b.c', to: 'd@e.f' },
        },
      },
    };
    return new Response(JSON.stringify({ result: seeds[key] != null ? JSON.stringify(seeds[key]) : null }), { status: 200 });
  }
  writes.push(body);
  return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
};

const { default: digestHandler, euActsWindow, THESIS_HEADINGS } = await import(pathToFileURL(resolve(root, 'api/notify/digest.js')).href);
const { GOOD_KEYWORDS } = await import(pathToFileURL(resolve(root, 'scripts/_policy-eu-acts.mjs')).href);
const { default: configHandler } = await import(pathToFileURL(resolve(root, 'api/notify/config.js')).href);

describe('api/notify/digest contract', () => {
  it('aggregates dedicated n8n keys into ranked sections', async () => {
    const res = await digestHandler(new Request('https://x/api/notify/digest?topics=chokepoints,commodities&limit=5'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.digest.sections));
    const chokepoints = body.digest.sections.find((s) => s.topic === 'chokepoints');
    assert.ok(chokepoints, 'chokepoints section present');
    assert.equal(chokepoints.items[0].title, 'Sisma M7.1 vicino a Bab el-Mandeb', 'critical item ranks first');
    assert.ok(!chokepoints.items.some((item) => item.title === 'ACLED item'), 'the retired ACLED key is not read');
    const commodities = body.digest.sections.find((s) => s.topic === 'commodities');
    assert.equal(commodities.items[0].title, 'CL=F');
  });

  it('policy topic still reads the legacy monitor items', async () => {
    const res = await digestHandler(new Request('https://x/api/notify/digest?topics=policy&limit=20'));
    const body = await res.json();
    const policy = body.digest.sections.find((s) => s.topic === 'policy');
    assert.ok(policy.items.some((item) => item.title === 'Regolamento UE dazi'));
  });

  it('policy topic includes CELLAR acts on thesis headings, CN-matched first, keyword flagged', async () => {
    const res = await digestHandler(new Request('https://x/api/notify/digest?topics=policy&actsDays=1'));
    const body = await res.json();
    const policy = body.digest.sections.find((s) => s.topic === 'policy');
    const acts = policy.items.filter((item) => item.source === 'eu-acts');
    assert.deepEqual(acts.map((a) => a.celex), ['32026R9002', '32026R9001'], 'CN-matched act ranks first');
    assert.equal(acts[0].match, 'cn');
    assert.deepEqual(acts[0].goods, ['7502']);
    assert.match(acts[0].title, /^\[NC 7502\] /);
    assert.equal(acts[1].match, 'keyword');
    assert.match(acts[1].title, /^\[parola chiave 7601\] /);
    assert.match(acts[1].summary, /da verificare/);
    assert.ok(!acts.some((a) => a.celex === '32026R9003'), 'an act on no thesis heading is excluded');
    assert.ok(!acts.some((a) => a.celex === '32026R9004'), 'an act outside the window is excluded');
    assert.equal(policy.items[0].source, 'eu-acts', 'CELLAR acts precede the legacy monitor');
  });

  it('a wider actsDays window reaches older acts, capped at the seeder window', async () => {
    const res = await digestHandler(new Request('https://x/api/notify/digest?topics=policy&actsDays=999'));
    const body = await res.json();
    const acts = body.digest.sections.find((s) => s.topic === 'policy').items.filter((i) => i.source === 'eu-acts');
    assert.ok(acts.some((a) => a.celex === '32026R9004'));
  });

  it('thesis headings mirror the CELLAR classifier goods', () => {
    assert.deepEqual([...THESIS_HEADINGS].sort(), Object.keys(GOOD_KEYWORDS).sort());
  });

  it('EU-acts window does not overlap between consecutive sends', () => {
    const at = (iso) => new Date(iso);
    assert.deepEqual(euActsWindow(at('2026-11-13T07:05:00Z'), 'daily', null), { from: '2026-11-12', to: '2026-11-13' });
    assert.deepEqual(euActsWindow(at('2026-11-14T07:05:00Z'), 'daily', null), { from: '2026-11-13', to: '2026-11-14' });
    assert.deepEqual(euActsWindow(at('2026-11-16T07:05:00Z'), 'weekly', null), { from: '2026-11-09', to: '2026-11-16' });
    // Hourly/realtime: acts only in the 07 UTC tick, never on the other ticks.
    assert.deepEqual(euActsWindow(at('2026-11-13T07:05:00Z'), 'hourly', null), { from: '2026-11-12', to: '2026-11-13' });
    assert.equal(euActsWindow(at('2026-11-13T08:05:00Z'), 'hourly', null), null);
    assert.equal(euActsWindow(at('2026-11-13T13:05:00Z'), 'realtime', null), null);
    // actsDays overrides frequency and hour gate.
    assert.deepEqual(euActsWindow(at('2026-11-13T13:05:00Z'), 'hourly', 3), { from: '2026-11-10', to: '2026-11-13' });
  });

  it('no longer serves the ACLED-only conflicts topic', async () => {
    const res = await digestHandler(new Request('https://x/api/notify/digest?topics=conflicts'));
    const body = await res.json();
    assert.equal(body.digest.sections.some((s) => s.topic === 'conflicts'), false);
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

  it('stores a valid config with seed-meta-free SET, preserving omitted credentials', async () => {
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
    // The redacted UI round-trip never resends the token, so the merge keeps it.
    assert.equal(parsed.endpoints.telegram.botToken, 'tg-secret');
  });

  it('rejects invalid frequency and topics', async () => {
    assert.equal((await post({ frequency: 'minutely' })).status, 400);
    assert.equal((await post({ topics: 'chokepoints' })).status, 400);
    assert.equal((await post(null)).status, 400);
  });

  it('redacts delivery credentials from anonymous GET, keeping channel state', async () => {
    const res = await configHandler(new Request('https://x/api/notify/config'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.redacted, true);
    assert.equal(body.config.endpoints.telegram.botToken, undefined);
    assert.equal(body.config.endpoints.telegram.chatId, undefined);
    assert.equal(body.config.endpoints.telegram.connected, true);
    assert.equal(body.config.endpoints.email.smtpUrl, undefined);
    assert.equal(body.config.endpoints.email.to, undefined);
    assert.equal(body.config.endpoints.email.connected, true);
  });

  it('returns the full config to the bearer-authenticated caller (n8n)', async () => {
    const res = await configHandler(new Request('https://x/api/notify/config', {
      headers: { Authorization: 'Bearer test-secret' },
    }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.redacted, false);
    assert.equal(body.config.endpoints.telegram.botToken, 'tg-secret');
    assert.equal(body.config.endpoints.email.smtpUrl, 'smtp://user:pass@host');
    // `connected` is computed server-side for both views so the UI and the
    // n8n workflow cannot drift on the eligibility rule.
    assert.equal(body.config.endpoints.telegram.connected, true);
    assert.equal(body.config.endpoints.email.connected, true);
  });

  it('rejects an anonymous redirect of a stored credential with 401 and writes nothing', async () => {
    const before = writes.length;
    const res = await post({ endpoints: { telegram: { enabled: true, chatId: 'attacker-chat' } } });
    assert.equal(res.status, 401);
    assert.equal(writes.length, before, 'a rejected credential mutation must not write');
  });

  it('lets an anonymous caller change non-credential fields and disable channels', async () => {
    const before = writes.length;
    const res = await post({ frequency: 'daily', endpoints: { telegram: { enabled: false } } });
    assert.equal(res.status, 200);
    const parsed = JSON.parse(writes.slice(before)[0][2]);
    assert.equal(parsed.frequency, 'daily');
    assert.equal(parsed.endpoints.telegram.enabled, false);
    // Disabling must never destroy the stored delivery secret.
    assert.equal(parsed.endpoints.telegram.botToken, 'tg-secret');
    assert.equal(parsed.endpoints.telegram.chatId, '123');
  });

  it('allows an authenticated caller to change a stored credential', async () => {
    const before = writes.length;
    const res = await configHandler(new Request('https://x/api/notify/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
      body: JSON.stringify({ endpoints: { telegram: { enabled: true, chatId: 'rotated-chat' } } }),
    }));
    assert.equal(res.status, 200);
    const parsed = JSON.parse(writes.slice(before)[0][2]);
    assert.equal(parsed.endpoints.telegram.chatId, 'rotated-chat');
  });

  it('fails closed (502, no write) when the stored config cannot be read', async () => {
    readFailure = true;
    try {
      const getRes = await configHandler(new Request('https://x/api/notify/config'));
      assert.equal(getRes.status, 502);
      const before = writes.length;
      const postRes = await post({ frequency: 'hourly' });
      assert.equal(postRes.status, 502);
      assert.equal(writes.length, before, 'a failed read must never produce a write');
    } finally {
      readFailure = false;
    }
  });
});
