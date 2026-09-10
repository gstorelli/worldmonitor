import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const apps = await import(pathToFileURL(join(root, 'src', 'config', 'apps.ts')).href);

function fullPanelKeys() {
  const source = readFileSync(join(root, 'src', 'config', 'panels.ts'), 'utf8');
  const start = source.indexOf('FULL_PANELS');
  const end = source.indexOf('export const FULL_MAP_LAYERS');
  const block = source.slice(start, end);
  const keys = new Set();
  for (const match of block.matchAll(/^\s+(?:'([^']+)'|([A-Za-z][\w-]*)):\s*\{/gm)) {
    keys.add(match[1] ?? match[2]);
  }
  return keys;
}

describe('risk sentinel app registry', () => {
  it('resolves the active app from query, storage and default', () => {
    assert.equal(apps.resolveAppId('?app=osint', null), 'osint');
    assert.equal(apps.resolveAppId('?app=osint', 'customs'), 'osint');
    assert.equal(apps.resolveAppId('', 'osint'), 'osint');
    assert.equal(apps.resolveAppId('?app=bogus', 'osint'), 'osint');
    assert.equal(apps.resolveAppId('', null), 'customs');
    assert.equal(apps.resolveAppId('?other=1', null), 'customs');
  });

  it('treats the customs app as unrestricted except for the moved panels', () => {
    assert.equal(apps.isPanelAllowedInApp('commodities', 'customs'), true);
    assert.equal(apps.isPanelAllowedInApp('source-validation', 'customs'), false);
    assert.equal(apps.isPanelAllowedInApp('policy-analysis', 'customs'), false);
    assert.equal(apps.isPanelAllowedInApp('source-validation', 'research'), true);
    assert.equal(apps.isPanelAllowedInApp('policy-analysis', 'policy'), true);
    assert.equal(apps.isPanelAllowedInApp('live-news', 'osint'), true);
    assert.equal(apps.isPanelAllowedInApp('telegram-intel', 'osint'), true);
    assert.equal(apps.isPanelAllowedInApp('commodities', 'osint'), false);
    assert.equal(apps.isPanelAllowedInApp('stock-analysis', 'osint'), false);
  });

  it('keeps every registered app panel id in sync with FULL_PANELS', () => {
    const valid = fullPanelKeys();
    assert.ok(valid.size > 100, `expected a populated FULL_PANELS registry, got ${valid.size}`);
    for (const app of apps.APPS) {
      for (const key of app.allowedPanels ?? []) {
        assert.ok(valid.has(key), `${app.id}.allowedPanels references unknown panel "${key}"`);
      }
      for (const key of app.excludedPanels ?? []) {
        assert.ok(valid.has(key), `${app.id}.excludedPanels references unknown panel "${key}"`);
      }
      for (const key of app.defaultPanels) {
        assert.ok(valid.has(key), `${app.id}.defaultPanels references unknown panel "${key}"`);
        if (app.allowedPanels) {
          assert.ok(app.allowedPanels.includes(key), `${app.id}.defaultPanels must be a subset of allowedPanels ("${key}")`);
        }
      }
    }
  });

  it('exposes default-enabled sets per app', () => {
    assert.equal(apps.appDefaultEnabledSet('customs').size, 0);
    const osintDefaults = apps.appDefaultEnabledSet('osint');
    assert.ok(osintDefaults.has('map'));
    assert.ok(osintDefaults.has('live-news'));
  });
});
