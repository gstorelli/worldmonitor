import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
process.env.WM_SESSION_SECRET = 'test-session-secret';
process.env.AUTH_REQUIRED = 'true';

const store = new Map();
globalThis.fetch = async (_url, opts) => {
  const command = JSON.parse(opts.body || '[]');
  const [verb, key, value] = command;
  if (verb === 'GET') {
    return new Response(JSON.stringify({ result: store.has(key) ? store.get(key) : null }), { status: 200 });
  }
  if (verb === 'SET') {
    store.set(key, value);
    return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: 'unsupported' }), { status: 400 });
};

const users = await import(pathToFileURL(resolve(root, 'api/_users.js')).href);
const { default: loginHandler } = await import(pathToFileURL(resolve(root, 'api/auth/login.js')).href);
const { default: policyHandler } = await import(pathToFileURL(resolve(root, 'api/panel-policy.js')).href);
const { default: prefsHandler } = await import(pathToFileURL(resolve(root, 'api/prefs/panels.js')).href);

const BASE = 'https://risksentinel.example';

const jsonRequest = (path, method, body, cookie) =>
  new Request(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const get = (path, cookie) => jsonRequest(path, 'GET', undefined, cookie);

async function loginAs(username, password) {
  const res = await loginHandler(new Request(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }));
  const raw = res.headers.get('set-cookie') || '';
  const match = /rs_session=([^;]*)/.exec(raw);
  return match ? `rs_session=${match[1]}` : '';
}

const panelFixture = {
  'alert-feed': { name: 'Alert Feed', enabled: true },
  'live-news': { name: 'Live News', enabled: false },
};

describe('panel policy + per-user panel preferences', () => {
  it('defaults the policy to an empty list', async () => {
    const body = await (await policyHandler(get('/api/panel-policy'))).json();
    assert.deepEqual(body.disabledPanels, []);
  });

  it('rejects policy writes from non-admins and requires a session', async () => {
    await users.createUser({ username: 'root', password: 'root-password', role: 'admin' });
    await users.createUser({ username: 'researcher', password: 'researcher-pass', role: 'user' });
    const userCookie = await loginAs('researcher', 'researcher-pass');

    assert.equal((await policyHandler(jsonRequest('/api/panel-policy', 'PUT', { disabledPanels: ['crypto'] }))).status, 401);
    assert.equal((await policyHandler(jsonRequest('/api/panel-policy', 'PUT', { disabledPanels: ['crypto'] }, userCookie))).status, 403);
  });

  it('lets an admin set and read back the global disabled list', async () => {
    const adminCookie = await loginAs('root', 'root-password');
    const res = await policyHandler(jsonRequest('/api/panel-policy', 'PUT', { disabledPanels: ['crypto', 'stock-analysis'] }, adminCookie));
    assert.equal(res.status, 200);
    const body = await (await policyHandler(get('/api/panel-policy'))).json();
    assert.deepEqual(body.disabledPanels.sort(), ['crypto', 'stock-analysis']);
  });

  it('validates the policy payload', async () => {
    const adminCookie = await loginAs('root', 'root-password');
    assert.equal((await policyHandler(jsonRequest('/api/panel-policy', 'PUT', { disabledPanels: 'crypto' }, adminCookie))).status, 400);
    assert.equal((await policyHandler(jsonRequest('/api/panel-policy', 'PUT', { disabledPanels: [42] }, adminCookie))).status, 400);
  });

  it('returns null preferences for anonymous callers and rejects their writes', async () => {
    const body = await (await prefsHandler(get('/api/prefs/panels'))).json();
    assert.equal(body.panels, null);
    assert.equal((await prefsHandler(jsonRequest('/api/prefs/panels', 'PUT', { panels: panelFixture }))).status, 401);
  });

  it('persists preferences per user without leaking across users', async () => {
    const rootCookie = await loginAs('root', 'root-password');
    const researcherCookie = await loginAs('researcher', 'researcher-pass');

    const put = await prefsHandler(jsonRequest('/api/prefs/panels', 'PUT', { panels: panelFixture }, rootCookie));
    assert.equal(put.status, 200);

    const rootPrefs = await (await prefsHandler(get('/api/prefs/panels', rootCookie))).json();
    assert.deepEqual(rootPrefs.panels, panelFixture);

    const researcherPrefs = await (await prefsHandler(get('/api/prefs/panels', researcherCookie))).json();
    assert.equal(researcherPrefs.panels, null);
  });

  it('rejects malformed preference payloads', async () => {
    const researcherCookie = await loginAs('researcher', 'researcher-pass');
    assert.equal((await prefsHandler(jsonRequest('/api/prefs/panels', 'PUT', { panels: [] }, researcherCookie))).status, 400);
    assert.equal((await prefsHandler(jsonRequest('/api/prefs/panels', 'PUT', { panels: { 'live-news': { name: 'x' } } }, researcherCookie))).status, 400);
    assert.equal((await prefsHandler(jsonRequest('/api/prefs/panels', 'PUT', { panels: { 'live-news': { enabled: true } } }, researcherCookie))).status, 200);
  });
});
