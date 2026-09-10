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
delete process.env.AUTH_COOKIE_INSECURE;

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
  return new Response(JSON.stringify({ error: 'unsupported command' }), { status: 400 });
};

const users = await import(pathToFileURL(resolve(root, 'api/_users.js')).href);
const session = await import(pathToFileURL(resolve(root, 'api/_user-session.js')).href);
const { default: loginHandler } = await import(pathToFileURL(resolve(root, 'api/auth/login.js')).href);
const { default: meHandler } = await import(pathToFileURL(resolve(root, 'api/auth/me.js')).href);
const { default: logoutHandler } = await import(pathToFileURL(resolve(root, 'api/auth/logout.js')).href);
const { default: usersHandler } = await import(pathToFileURL(resolve(root, 'api/auth/users.js')).href);

const BASE = 'https://risksentinel.example';

function post(handler, path, body, headers = {}) {
  return handler(new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }));
}

function get(handler, path, headers = {}) {
  return handler(new Request(`${BASE}${path}`, { method: 'GET', headers }));
}

function cookieFrom(response) {
  const raw = response.headers.get('set-cookie') || '';
  const match = /rs_session=([^;]*)/.exec(raw);
  return match ? `rs_session=${match[1]}` : '';
}

async function loginAs(username, password) {
  const res = await post(loginHandler, '/api/auth/login', { username, password });
  return { res, cookie: cookieFrom(res) };
}

describe('auth: users, sessions and admin endpoints', () => {
  it('rejects an unknown user and a wrong password with a generic 401', async () => {
    await users.createUser({ username: 'alice', password: 'correct-horse', role: 'admin' });
    assert.equal((await post(loginHandler, '/api/auth/login', { username: 'nobody', password: 'whatever' })).status, 401);
    assert.equal((await post(loginHandler, '/api/auth/login', { username: 'alice', password: 'wrong-pass' })).status, 401);
  });

  it('logs in with a valid password and issues an HttpOnly session cookie', async () => {
    const { res, cookie } = await loginAs('alice', 'correct-horse');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.username, 'alice');
    assert.equal(body.user.role, 'admin');
    assert.ok(cookie.startsWith('rs_session='));
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
  });

  it('never leaks the password hash from login or the user list', async () => {
    const { res } = await loginAs('alice', 'correct-horse');
    assert.ok(!(await res.text()).includes('pbkdf2$'));
    const { cookie } = await loginAs('alice', 'correct-horse');
    const list = await get(usersHandler, '/api/auth/users', { Cookie: cookie });
    assert.equal(list.status, 200);
    const payload = await list.json();
    assert.ok(!JSON.stringify(payload).includes('pbkdf2$'));
    assert.ok(!JSON.stringify(payload).includes('passwordHash'));
  });

  it('resolves /me for a valid cookie and rejects a tampered or absent one', async () => {
    const { cookie } = await loginAs('alice', 'correct-horse');
    const ok = await (await get(meHandler, '/api/auth/me', { Cookie: cookie })).json();
    assert.equal(ok.authenticated, true);
    assert.equal(ok.user.username, 'alice');

    const none = await (await get(meHandler, '/api/auth/me')).json();
    assert.equal(none.authRequired, true);
    assert.equal(none.authenticated, false);

    const tampered = `${cookie}x`;
    const bad = await (await get(meHandler, '/api/auth/me', { Cookie: tampered })).json();
    assert.equal(bad.authenticated, false);
  });

  it('rejects an expired session token', async () => {
    const past = Date.now() - 60_000;
    const token = await session.createSessionToken('u_expired', 'admin', process.env.WM_SESSION_SECRET, past - 1000, 500);
    const res = await get(meHandler, '/api/auth/me', { Cookie: `rs_session=${token}` });
    const body = await res.json();
    assert.equal(body.authenticated, false);
  });

  it('clears the cookie on logout', async () => {
    const res = await post(logoutHandler, '/api/auth/logout', {});
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie') || '', /Max-Age=0/);
  });

  it('forbids non-admin users from the user-management endpoint', async () => {
    await users.createUser({ username: 'bob', password: 'bob-password', role: 'user' });
    const { cookie } = await loginAs('bob', 'bob-password');
    const res = await get(usersHandler, '/api/auth/users', { Cookie: cookie });
    assert.equal(res.status, 403);
    const created = await post(usersHandler, '/api/auth/users', { username: 'eve', password: 'eve-password' }, { Cookie: cookie });
    assert.equal(created.status, 403);
  });

  it('lets an admin create, update and delete users', async () => {
    const { cookie } = await loginAs('alice', 'correct-horse');

    const created = await post(usersHandler, '/api/auth/users', { username: 'carol', password: 'carol-password' }, { Cookie: cookie });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).user.role, 'user');

    const patched = await usersHandler(new Request(`${BASE}/api/auth/users`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ username: 'carol', role: 'admin' }),
    }));
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).user.role, 'admin');

    const deleted = await usersHandler(new Request(`${BASE}/api/auth/users?username=carol`, { method: 'DELETE', headers: { Cookie: cookie } }));
    assert.equal(deleted.status, 200);
    assert.equal((await users.getUserByUsername('carol')), null);
  });

  it('prevents self-lockout and lets an admin manage another admin', async () => {
    const { cookie } = await loginAs('alice', 'correct-horse');

    const demoteSelf = await usersHandler(new Request(`${BASE}/api/auth/users`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ username: 'alice', role: 'user' }),
    }));
    assert.equal(demoteSelf.status, 400);

    const deleteSelf = await usersHandler(new Request(`${BASE}/api/auth/users?username=alice`, { method: 'DELETE', headers: { Cookie: cookie } }));
    assert.equal(deleteSelf.status, 400);

    // Another admin may be demoted by a different admin (no last-admin lockout).
    await users.updateUser('bob', { role: 'admin' });
    const demoteBob = await usersHandler(new Request(`${BASE}/api/auth/users`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ username: 'bob', role: 'user' }),
    }));
    assert.equal(demoteBob.status, 200);
    assert.equal((await demoteBob.json()).user.role, 'user');
  });

  it('validates usernames and password strength on create', async () => {
    const { cookie } = await loginAs('alice', 'correct-horse');
    assert.equal((await post(usersHandler, '/api/auth/users', { username: 'no', password: 'long-enough-pass' }, { Cookie: cookie })).status, 400);
    assert.equal((await post(usersHandler, '/api/auth/users', { username: 'dave', password: 'short' }, { Cookie: cookie })).status, 400);
  });
});
