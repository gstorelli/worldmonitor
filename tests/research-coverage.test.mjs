import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const load = (file) => import(pathToFileURL(join(here, '..', 'src', 'apps', 'research', file)).href);

const coverage = await load('coverage.ts');
const layers = await load('layers.ts');
const filters = await load('filters.ts');

// 13/10/2026: the bibliography is classified by the layers of the thesis model
// (the v0 8-dimension matrix and the A-E theme areas were removed).
const source = (ref, overrides = {}) => ({
  ref,
  authors: 'Doe, J.',
  year: 2024,
  title: `Study ${ref}`,
  type: 'journal',
  venue: 'Journal',
  doi: null,
  url: 'https://x',
  layers: ['trigger'],
  summary: 'summary',
  limitation: 'limit',
  verified: true,
  verification: 'P',
  ...overrides,
});

describe('research layer coverage', () => {
  it('resolves layer ids and Italian label prefixes', () => {
    assert.equal(layers.resolveLayer('trigger'), 'trigger');
    assert.equal(layers.resolveLayer('Innesco'), 'trigger');
    assert.equal(layers.resolveLayer('vulnerabilità di'), 'supply');
    assert.equal(layers.resolveLayer('nothing'), null);
  });

  it('counts sources per layer and verification level, and reports weak layers', () => {
    const sources = [
      source(1, { layers: ['trigger'], verification: 'T' }),
      source(2, { layers: ['trigger'], verification: 'P' }),
      source(3, { layers: ['node', 'good'], verification: 'API' }),
      source(4, { layers: ['customs'], verification: 'S' }),
      source(5, { layers: ['customs'], verified: false, verification: null }),
    ];
    const table = layers.computeLayerCoverage(sources);
    assert.equal(table.length, layers.MODEL_LAYERS.length);
    const trigger = table.find((entry) => entry.id === 'trigger');
    assert.equal(trigger.count, 2);
    assert.deepEqual(trigger.refs, [1, 2]);
    assert.deepEqual({ T: trigger.byLevel.T, P: trigger.byLevel.P }, { T: 1, P: 1 });
    const customs = table.find((entry) => entry.id === 'customs');
    assert.deepEqual({ S: customs.byLevel.S, none: customs.byLevel.none }, { S: 1, none: 1 });

    const { empty, noFullText } = layers.findWeakLayers(table);
    assert.ok(empty.some((entry) => entry.id === 'supply'));
    assert.deepEqual(noFullText.map((entry) => entry.id), ['customs']);
  });

  it('builds layer, type and year distributions sorted for display', () => {
    const sources = [
      source(1, { layers: ['trigger'], type: 'journal', year: 2024 }),
      source(2, { layers: ['node', 'good'], type: 'report', year: 2025 }),
      source(3, { layers: ['trigger'], type: 'journal', year: 2024 }),
      source(4, { layers: [], type: 'preprint', year: 2023 }),
    ];
    assert.deepEqual(coverage.computeLayerDistribution(sources)[0], { key: 'trigger', label: 'Innesco', count: 2 });
    assert.ok(coverage.computeLayerDistribution(sources).some((entry) => entry.label === 'importata'));
    assert.deepEqual(coverage.computeTypeDistribution(sources)[0], { key: 'journal', label: 'journal', count: 2 });
    assert.deepEqual(coverage.computeYearHistogram(sources)[0], { key: '2025', label: '2025', count: 1 });
  });
});

describe('research bibliography filters', () => {
  it('parses field qualifiers and free text', () => {
    const query = filters.parseResearchQuery('author:anderson layer:innesco type:report verif:t border controls');
    assert.equal(query.author, 'anderson');
    assert.equal(query.layer, 'trigger');
    assert.equal(query.type, 'report');
    assert.equal(query.verification, 'T');
    assert.equal(query.text, 'border controls');
    assert.equal(filters.parseResearchQuery('theme:customs').layer, 'customs', 'theme: is an alias of layer:');
  });

  it('matches on layer and verification level', () => {
    const query = filters.parseResearchQuery('layer:node verif:API');
    assert.equal(filters.matchesResearchQuery(source(1, { layers: ['node', 'good'], verification: 'API' }), query), true);
    assert.equal(filters.matchesResearchQuery(source(2, { layers: ['node'], verification: 'P' }), query), false);
    assert.equal(filters.matchesResearchQuery(source(3, { layers: ['trigger'], verification: 'API' }), query), false);
  });

  it('applies author/year/type filters and free text, including the bib key', () => {
    const entry = source(1, { authors: 'Anderson, D.', year: 2025, type: 'report', title: 'AI for border management', key: 'jrc_ai_2025' });
    assert.equal(filters.matchesResearchQuery(entry, filters.parseResearchQuery('author:anderson')), true);
    assert.equal(filters.matchesResearchQuery(entry, filters.parseResearchQuery('year:2024')), false);
    assert.equal(filters.matchesResearchQuery(entry, filters.parseResearchQuery('type:report border')), true);
    assert.equal(filters.matchesResearchQuery(entry, filters.parseResearchQuery('jrc_ai')), true);
    assert.equal(filters.matchesResearchQuery(entry, filters.parseResearchQuery('nonexistent')), false);
  });

  it('tolerates imported entries saved before 13/10 (no layers field)', () => {
    const legacy = { ...source(1000), layers: undefined, themeArea: '', dimensions: [] };
    assert.equal(filters.matchesResearchQuery(legacy, filters.parseResearchQuery('layer:trigger')), false);
    assert.equal(filters.matchesResearchQuery(legacy, filters.parseResearchQuery('study')), true);
  });

  it('sorts by year, title and layer in both directions', () => {
    const sources = [source(1, { year: 2021, title: 'B', layers: ['trigger'] }), source(2, { year: 2025, title: 'A', layers: ['customs'] })];
    assert.deepEqual(filters.sortSources(sources, 'year', 'desc').map((entry) => entry.ref), [2, 1]);
    assert.deepEqual(filters.sortSources(sources, 'title', 'asc').map((entry) => entry.ref), [2, 1]);
    assert.deepEqual(filters.sortSources(sources, 'layers', 'asc').map((entry) => entry.ref), [2, 1]);
  });
});
