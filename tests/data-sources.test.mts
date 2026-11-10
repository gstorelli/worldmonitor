import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PANEL_SOURCES, WORKSPACE_SOURCES, getPanelSources } from '../src/config/data-sources.ts';
import { THESIS_APP } from '../src/config/apps.ts';
import { STRATEGIC_GOODS } from '../src/config/thesis-model.ts';

const all = () => [...Object.values(PANEL_SOURCES), ...Object.values(WORKSPACE_SOURCES)].flat();

describe('data sources registry', () => {
  it('cites a source for every panel of the thesis view, map included', () => {
    const allowed = THESIS_APP.allowedPanels ?? [];
    assert.ok(allowed.length > 0);
    for (const id of allowed) assert.ok(getPanelSources(id).length > 0, `panel ${id} has no source`);
  });

  it('has an entry for every source slot of the standalone workspaces', () => {
    for (const app of ['osint', 'research', 'policy']) {
      const src = readFileSync(new URL(`../src/apps/${app}/workspace.ts`, import.meta.url), 'utf8');
      const keys = [...src.matchAll(/sourceInfoSlot\('([^']+)'\)/g)].map((m) => m[1]!);
      assert.ok(keys.length > 0, `${app} has no source slot`);
      for (const key of keys) assert.ok(WORKSPACE_SOURCES[key]?.length, `workspace slot ${key} has no source`);
    }
  });

  it('every entry says what, from where, and links only over https', () => {
    for (const s of all()) {
      assert.ok(s.what.trim() && s.source.trim(), JSON.stringify(s));
      if (s.url) assert.match(s.url, /^https:\/\//, s.url);
    }
  });

  it('does not cite ACLED, which is excluded by licence', () => {
    for (const s of all()) assert.doesNotMatch(`${s.source} ${s.url ?? ''}`, /acled/i);
  });

  it('lists every verified source of the strategic goods registry', () => {
    const cited = new Set(PANEL_SOURCES['strategic-goods']!.map((s) => s.source));
    for (const g of STRATEGIC_GOODS) {
      for (const f of [...g.criticality, ...g.supply, ...g.modulators]) {
        if (f.status === 'verified' && f.source) assert.ok(cited.has(f.source), `${f.source} missing`);
      }
    }
  });

  it('cites the feeds of a news panel with their original address, not the RSS proxy', () => {
    const feeds = {
      europe: [
        { name: 'Example Wire', url: '/api/rss-proxy?url=https%3A%2F%2Fexample.org%2Ffeed.xml' },
        { name: 'Direct', url: 'https://direct.example/rss' },
        { name: 'By language', url: { en: '/api/rss-proxy?url=https%3A%2F%2Fen.example%2Frss' } },
      ],
    };
    const europe = getPanelSources('europe', feeds);
    assert.deepEqual(europe.map((s) => [s.source, s.url]), [
      ['Example Wire', 'https://example.org/feed.xml'],
      ['Direct', 'https://direct.example/rss'],
      ['By language', 'https://en.example/rss'],
    ]);
    assert.deepEqual(getPanelSources('no-such-panel', feeds), []);
  });
});
