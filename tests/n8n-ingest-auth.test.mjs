import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

const writes = [];
globalThis.fetch = async (_url, opts) => {
  const body = JSON.parse(opts.body || '[]');
  writes.push(body);
  return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
};

const { default: ingestHandler } = await import(pathToFileURL(resolve(root, 'api/n8n/ingest.js')).href);

const payload = {
  source: 'gdelt',
  pipeline: 'customs-intelligence',
  alerts: [{ id: 'evt-1', title: 'Port disruption', url: 'https://x/1', riskScore: 82, riskLevel: 'High' }],
};

function post(headers = {}) {
  return ingestHandler(new Request('https://x/api/n8n/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  }));
}

describe('api/n8n/ingest auth', () => {
  it('rejects a missing or wrong bearer when the secret is configured', async () => {
    process.env.N8N_INGEST_SECRET = 'right-secret';
    delete process.env.ALLOW_ANONYMOUS_N8N_INGEST;

    assert.equal((await post()).status, 401);
    assert.equal((await post({ Authorization: 'Bearer wrong-secret' })).status, 401);
  });

  it('accepts the configured bearer and writes the dedicated key', async () => {
    process.env.N8N_INGEST_SECRET = 'right-secret';
    const before = writes.length;
    const res = await post({ Authorization: 'Bearer right-secret' });
    assert.equal(res.status, 200);
    const keys = writes.slice(before).filter((cmd) => cmd[0] === 'SET').map((cmd) => cmd[1]);
    assert.ok(keys.includes('risk_sentinel:n8n:gdelt'), `expected the dedicated key, got ${keys.join(', ')}`);
  });

  it('fails closed when the secret is missing (never an open write endpoint)', async () => {
    delete process.env.N8N_INGEST_SECRET;
    delete process.env.ALLOW_ANONYMOUS_N8N_INGEST;
    assert.equal((await post()).status, 503);
  });

  it('allows anonymous writes only with the explicit opt-out', async () => {
    delete process.env.N8N_INGEST_SECRET;
    process.env.ALLOW_ANONYMOUS_N8N_INGEST = 'true';
    assert.equal((await post()).status, 200);
    delete process.env.ALLOW_ANONYMOUS_N8N_INGEST;
  });
});
