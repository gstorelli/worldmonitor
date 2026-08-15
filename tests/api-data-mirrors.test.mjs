import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

describe('api/* edge data mirrors stay in sync with data/*.json', () => {
  const mirrors = [
    { source: 'data/policy-registry.json', key: 'entries', module: 'api/policy/_registry-data.js' },
    { source: 'data/zotero-sources.json', key: 'sources', module: 'api/zotero/_sources-data.js' },
    { source: 'data/hs-commodity-map.json', key: 'groups', module: 'api/trade/_hs-map-data.js' },
  ];

  for (const { source, key, module } of mirrors) {
    it(`${module} matches ${source}`, async () => {
      const parsed = JSON.parse(readFileSync(resolve(root, source), 'utf8'));
      const expected = parsed[key] ?? parsed;
      const mod = await import(pathToFileURL(resolve(root, module)).href);
      assert.deepStrictEqual(
        mod.default,
        expected,
        `${module} is out of sync with ${source} — regenerate the literal mirror`,
      );
    });
  }
});
