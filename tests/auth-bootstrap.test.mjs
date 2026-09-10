import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
process.env.WM_SESSION_SECRET = 'test-session-secret';
process.env.N8N_INGEST_SECRET = 'ingest-secret-for-bootstrap';

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

const { default: bootstrapHandler } = await import(pathToFileURL(resolve(root, 'api/auth/bootstrap.js')).href);
const { default: loginHandler } = await import(pathToFileURL(resolve(root, 'api/auth/login.js')).href);

const BASE = 'https://risksentinel.example';

function call(body, authHeader) {
  return bootstrapHandler(new Request(`${BASE}/api/auth/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
    body: JSON.stringify(body),
  }));
}

describe('api/auth/bootstrap one-shot first admin', () => {
  it('requires the ingest bearer', async () => {
    assert.equal((await call({ username: 'admin', password: 'admin-password' })).status, 401);
    assert.equal((await call({ username: 'admin', password: 'admin-password' }, 'Bearer wrong')).status, 401);
  });

  it('creates the first admin and never echoes the password', async () => {
    const res = await call({ username: 'admin', password: 'admin-password' }, 'Bearer ingest-secret-for-bootstrap');
    assert.equal(res.status, 201);
    const text = await res.text();
    assert.ok(!text.includes('admin-password'));
    const body = JSON.parse(text);
    assert.equal(body.user.username, 'admin');
    assert.equal(body.user.role, 'admin');
    assert.equal(body.user.passwordHash, undefined);
  });

  it('is disabled once any user exists', async () => {
    const res = await call({ username: 'second', password: 'second-password' }, 'Bearer ingest-secret-for-bootstrap');
    assert.equal(res.status, 409);
  });

  it('the bootstrapped admin can log in', async () => {
    const res = await loginHandler(new Request(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin-password' }),
    }));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie') || '', /rs_session=/);
  });
});
