import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

const { chunkCommands } = await import(
  pathToFileURL(join(here, '..', 'scripts', 'seed-hs2-chokepoint-exposure.mjs')).href
);

function serializedSize(commands) {
  return JSON.stringify(commands).length;
}

describe('seed pipeline chunking (redis-rest 1 MB body cap)', () => {
  it('preserves every command and order', () => {
    const commands = Array.from({ length: 500 }, (_, i) => ['SET', `k${i}`, `v${i}`]);
    const chunks = chunkCommands(commands, 10_000);
    assert.deepEqual(chunks.flat(), commands);
    assert.ok(chunks.length > 1, 'expected multiple batches');
  });

  it('keeps every batch under the byte budget except a single oversized command', () => {
    const commands = Array.from({ length: 400 }, (_, i) => ['SET', `supply-chain:exposure:IT:${i}:v1`, JSON.stringify({ i, pad: 'x'.repeat(1500) })]);
    const maxBytes = 200_000;
    const chunks = chunkCommands(commands, maxBytes);
    for (const chunk of chunks) {
      if (chunk.length === 1) continue; // a lone oversize command cannot be split further
      assert.ok(serializedSize(chunk) <= maxBytes, `batch too large: ${serializedSize(chunk)}`);
    }
    assert.deepEqual(chunks.flat(), commands);
  });

  it('splits a realistic 1970-command HS sweep into proxy-safe batches', () => {
    const commands = Array.from({ length: 1970 }, (_, i) => [
      'SET',
      `supply-chain:exposure:C${i % 197}:${i % 10}:v1`,
      JSON.stringify({ iso2: 'IT', hs2: '27', exposures: Array.from({ length: 13 }, (_, j) => ({ chokepointId: `cp${j}`, exposureScore: 12.3 })), fetchedAt: '2026-01-01T00:00:00.000Z' }),
      'EX',
      172800,
    ]);
    const chunks = chunkCommands(commands);
    assert.ok(chunks.length >= 2, `expected multiple batches, got ${chunks.length}`);
    for (const chunk of chunks) {
      assert.ok(serializedSize(chunk) <= 700_000, `batch exceeds proxy cap: ${serializedSize(chunk)}`);
    }
    assert.deepEqual(chunks.flat(), commands);
  });
});
