#!/usr/bin/env node
// Regenerates api/policy/_registry-data.js (edge-compatible literal mirror)
// from data/policy-registry.json. Deterministic: same JSON in, same file out.
// Usage: node scripts/build-policy-registry-mirror.mjs [--check]
//   --check  exit 1 when the mirror on disk differs, without writing.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'data/policy-registry.json');
const MIRROR = resolve(ROOT, 'api/policy/_registry-data.js');

const HEADER = [
  '// Edge-compatible ESM literal mirror (no node: built-ins, no JSON import attributes).',
  '// Source of truth: data/policy-registry.json',
  '// Regenerate with scripts/build-policy-registry-mirror.mjs; tests/api-data-mirrors.test.mjs enforces parity.',
].join('\n');

export function renderMirror(registry) {
  const entries = Array.isArray(registry?.entries) ? registry.entries : [];
  return `${HEADER}\nexport default ${JSON.stringify(entries, null, 2)};\n`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = renderMirror(JSON.parse(readFileSync(SOURCE, 'utf8')));
  if (process.argv.includes('--check')) {
    const current = readFileSync(MIRROR, 'utf8');
    if (current !== out) {
      console.error('api/policy/_registry-data.js is out of date: run node scripts/build-policy-registry-mirror.mjs');
      process.exit(1);
    }
    console.log('api/policy/_registry-data.js is up to date');
  } else {
    writeFileSync(MIRROR, out);
    console.log(`wrote ${MIRROR}`);
  }
}
