import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACLED_DISABLED, getAcledToken } from '../scripts/shared/acled-oauth.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

// ACLED's EULA forbids any use of its data with AI/ML/LLM systems, so Risk
// Sentinel must never fetch it. These guards keep it switched off.
describe('ACLED stays disabled', () => {
  it('returns no token even when credentials are present', async () => {
    const saved = { ...process.env };
    process.env.ACLED_EMAIL = 'someone@example.org';
    process.env.ACLED_PASSWORD = 'x';
    process.env.ACLED_ACCESS_TOKEN = 'static';
    const realFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error('network must not be used');
    };
    try {
      assert.equal(ACLED_DISABLED, true);
      assert.equal(await getAcledToken(), null);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = realFetch;
      process.env = saved;
    }
  });

  it('every token entry point carries the disabled switch', () => {
    for (const file of [
      'server/_shared/acled-auth.ts',
      'scripts/seed-conflict-intel.mjs',
      'scripts/seed-acled-events.mjs',
    ]) {
      assert.match(read(file), /ACLED_DISABLED = true/, file);
    }
  });

  it('is not scheduled and gets no credentials in compose', () => {
    assert.doesNotMatch(read('scripts/seed-cron.sh'), /^\s*run acled\b/m);
    assert.match(read('scripts/seed-cron.sh'), /SEED_SKIP="[^"]*\bacled\b/);
    assert.doesNotMatch(read('docker-compose.yml'), /^\s*ACLED_[A-Z_]+:/m);
  });
});
