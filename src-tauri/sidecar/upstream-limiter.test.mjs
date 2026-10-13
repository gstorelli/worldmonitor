// Regression test for the 12-13/10/2026 production outage: the global fetch
// wrapper of local-api-server.mjs leaked its concurrency slots when a request
// was aborted after the response headers had arrived, so after six such aborts
// every outbound call (Redis included) queued forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';

process.env.UPSTREAM_IDLE_TIMEOUT_MS = '300';
process.env.UPSTREAM_MAX_REQUEST_MS = '2000';
const { getUpstreamLimiterState, createLocalApiServer } = await import('./local-api-server.mjs');

// /stall sends the headers and part of the body, then never ends the response.
const server = http.createServer((req, res) => {
  if (req.url === '/stall') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.write('partial');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"ok":true}');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test('aborting after the headers arrived rejects and returns the slot', async () => {
  for (let i = 0; i < 8; i++) {
    await assert.rejects(fetch(`${base}/stall`, { signal: AbortSignal.timeout(100) }));
  }
  assert.equal(getUpstreamLimiterState().active, 0, 'all slots returned after aborts');
  const res = await fetch(`${base}/ok`, { signal: AbortSignal.timeout(1000) });
  assert.equal(res.status, 200);
});

test('a stalled request without a signal is bounded by the idle timeout', async () => {
  const started = Date.now();
  await assert.rejects(fetch(`${base}/stall`), /idle/);
  assert.ok(Date.now() - started < 1500, 'rejected near the idle timeout, not hanging');
  assert.equal(getUpstreamLimiterState().active, 0);
});

test('an already-aborted signal rejects without taking a slot', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(fetch(`${base}/ok`, { signal: ctrl.signal }));
  assert.equal(getUpstreamLimiterState().active, 0);
});

test('more than six concurrent stalled requests all settle', async () => {
  const calls = Array.from({ length: 10 }, () => fetch(`${base}/stall`, { signal: AbortSignal.timeout(150) }));
  const results = await Promise.allSettled(calls);
  assert.ok(results.every((r) => r.status === 'rejected'));
  assert.deepEqual(
    { active: getUpstreamLimiterState().active, queued: getUpstreamLimiterState().queued },
    { active: 0, queued: 0 },
  );
  server.close();
  server.closeAllConnections?.();
});

test('deep liveness probe reports the limiter state and answers 200 when it is healthy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wm-limiter-test-'));
  const apiDir = path.join(root, 'api');
  await mkdir(apiDir, { recursive: true });
  const app = await createLocalApiServer({ port: 0, apiDir, logger: { log() {}, warn() {}, error() {} } });
  const { port } = await app.start();
  try {
    const res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/sidecar-health?deep=1`, (r) => {
        let body = '';
        r.on('data', (c) => { body += c; });
        r.on('end', () => resolve({ status: r.statusCode, json: JSON.parse(body) }));
      }).on('error', reject);
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.upstream.max, 6);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
