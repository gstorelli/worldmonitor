#!/usr/bin/env node
/**
 * Guardrail: every literal `t('key')` used in src/ must exist in src/locales/en.json.
 *
 * Motivation: a typo like `panels.satelliteFires.noData` (the real key lives
 * under `components.`) renders the raw key into the UI instead of failing at
 * build time — it shipped once and only surfaced in production. This script
 * makes that class of bug a CI failure.
 *
 * Dynamic keys (template literals, concatenations such as t('status.' + x))
 * are skipped: the regex only matches complete quoted literals, and keys
 * ending in `.` are treated as prefixes. A line annotated with `i18n-ignore`
 * is skipped for deliberate exceptions.
 *
 * Usage: node scripts/check-i18n-keys.mjs
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const srcDir = join(root, 'src');
const localesDir = join(srcDir, 'locales');
const REFERENCE_LOCALE = 'en';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function flatten(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, full, out);
    else out.add(full);
  }
  return out;
}

const reference = JSON.parse(readFileSync(join(localesDir, `${REFERENCE_LOCALE}.json`), 'utf8'));
const referenceKeys = flatten(reference);

// i18next plural/context suffixes: t('x') resolves to x_one/x_other/... when
// the call passes { count } (or context suffixes when it passes { context }).
const SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other', 'plural', 'male', 'female', 'neutral'];
function hasKey(key) {
  if (referenceKeys.has(key)) return true;
  return SUFFIXES.some((suffix) => referenceKeys.has(`${key}_${suffix}`));
}

const CALL_PATTERN = /\bt\(\s*['"]([A-Za-z0-9_.-]+)['"]/g;
const missing = new Map();
let literals = 0;
let skippedDynamic = 0;

for (const file of walk(srcDir)) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.includes('i18n-ignore')) continue;
    for (const match of line.matchAll(CALL_PATTERN)) {
      const key = match[1];
      if (key.endsWith('.')) {
        // Dynamic prefix (t('status.' + value) or t(`status.${x}`)): not a literal key.
        skippedDynamic++;
        continue;
      }
      literals++;
      if (!hasKey(key)) {
        const rel = relative(root, file).replace(/\\/g, '/');
        if (!missing.has(key)) missing.set(key, new Set());
        missing.get(key).add(`${rel}:${index + 1}`);
      }
    }
  }
}

const it = JSON.parse(readFileSync(join(localesDir, 'it.json'), 'utf8'));
const itKeys = flatten(it);
const itMissing = [...referenceKeys].filter((key) => !itKeys.has(key)).length;

// Map-layer labels resolve dynamically as t(`components.deckgl.layers.${suffix}`)
// from src/config/map-layer-definitions.ts, so the literal scan cannot see them.
// Validate every registry suffix against both locales.
const layerDefsPath = join(srcDir, 'config', 'map-layer-definitions.ts');
let layerSuffixes = [];
const layerMissing = { en: [], it: [] };
if (existsSync(layerDefsPath)) {
  const registry = readFileSync(layerDefsPath, 'utf8');
  layerSuffixes = [...registry.matchAll(/def\(\s*'[^']+',\s*'[^']*',\s*'([^']+)'/g)].map((m) => m[1]);
  const layersEn = flatten(reference.components?.deckgl?.layers ?? {}, 'components.deckgl.layers');
  const layersIt = flatten(it.components?.deckgl?.layers ?? {}, 'components.deckgl.layers');
  layerMissing.en = layerSuffixes.filter((s) => !layersEn.has(`components.deckgl.layers.${s}`));
  layerMissing.it = layerSuffixes.filter((s) => !layersIt.has(`components.deckgl.layers.${s}`));
}

console.log(`[i18n] literal t() keys checked: ${literals} (${skippedDynamic} dynamic prefixes skipped)`);
console.log(`[i18n] reference locale: ${REFERENCE_LOCALE}.json — italian gaps (fallback to en): ${itMissing}`);
console.log(`[i18n] map-layer labels checked: ${layerSuffixes.length} (en gaps: ${layerMissing.en.length}, it gaps: ${layerMissing.it.length})`);

if (missing.size > 0 || layerMissing.en.length > 0 || layerMissing.it.length > 0) {
  if (missing.size > 0) {
    console.error(`\n[i18n] ${missing.size} key(s) missing from ${REFERENCE_LOCALE}.json:`);
    for (const [key, locations] of [...missing.entries()].sort()) {
      console.error(`  - ${key}  (${[...locations].join(', ')})`);
    }
  }
  if (layerMissing.en.length > 0) {
    console.error(`\n[i18n] map-layer labels missing from ${REFERENCE_LOCALE}.json: ${layerMissing.en.join(', ')}`);
  }
  if (layerMissing.it.length > 0) {
    console.error(`\n[i18n] map-layer labels missing from it.json: ${layerMissing.it.join(', ')}`);
  }
  console.error('\nFix: add the key to src/locales/en.json (and it.json), or annotate the line with i18n-ignore.');
  process.exit(1);
}

console.log('[i18n] OK — every literal key and map-layer label resolves.');
