// Fork (11/11/2026): releaseLock must work on the self-hosted REST proxy, which
// rejects EVAL (docker/redis-rest-proxy.mjs): fall back to GET + compare + DEL.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { releaseLock } from '../scripts/_seed-utils.mjs';

const saved = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, fetch: globalThis.fetch };
let calls;
function fakeRedis(store) {
  globalThis.fetch = async (_url, init) => {
    const cmd = JSON.parse(init.body);
    calls.push(cmd[0]);
    if (cmd[0] === 'EVAL') return new Response(JSON.stringify({ error: 'Command not allowed: EVAL' }), { status: 400 });
    if (cmd[0] === 'GET') return new Response(JSON.stringify({ result: store[cmd[1]] ?? null }));
    if (cmd[0] === 'DEL') { delete store[cmd[1]]; return new Response(JSON.stringify({ result: 1 })); }
    return new Response(JSON.stringify({ result: null }));
  };
}

describe('releaseLock without EVAL', () => {
  beforeEach(() => {
    calls = [];
    process.env.UPSTASH_REDIS_REST_URL = 'http://redis.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 't';
  });
  afterEach(() => {
    globalThis.fetch = saved.fetch;
    if (saved.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = saved.url;
    if (saved.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = saved.token;
  });

  it('deletes the lock when this run owns it', async () => {
    const store = { 'seed-lock:intelligence:gdelt-intel': 'run-1' };
    fakeRedis(store);
    await releaseLock('intelligence:gdelt-intel', 'run-1');
    assert.equal(store['seed-lock:intelligence:gdelt-intel'], undefined);
    assert.deepEqual(calls, ['EVAL', 'GET', 'DEL']);
  });

  it('leaves a lock owned by another run', async () => {
    const store = { 'seed-lock:intelligence:gdelt-intel': 'run-2' };
    fakeRedis(store);
    await releaseLock('intelligence:gdelt-intel', 'run-1');
    assert.equal(store['seed-lock:intelligence:gdelt-intel'], 'run-2');
    assert.deepEqual(calls, ['EVAL', 'GET']);
  });
});
