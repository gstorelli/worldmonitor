import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

const coverage = await import(pathToFileURL(join(here, '..', 'src', 'apps', 'research', 'coverage.ts')).href);
const filters = await import(pathToFileURL(join(here, '..', 'src', 'apps', 'research', 'filters.ts')).href);

const source = (ref, overrides = {}) => ({
  ref,
  authors: 'Doe, J.',
  year: 2024,
  title: `Study ${ref}`,
  type: 'journal',
  venue: 'Journal',
  doi: null,
  url: 'https://x',
  themeArea: 'A',
  summary: 'summary',
  limitation: 'limit',
  contribution: 'contribution',
  dimensions: [],
  verified: true,
  ...overrides,
});

describe('research coverage analysis', () => {
  it('maps the geophysicalClimate alias onto the canonical dimension', () => {
    assert.equal(coverage.normalizeDimension('geophysicalClimate'), 'geophysicalImpact');
    assert.equal(coverage.normalizeDimension('tradeExposure'), 'tradeExposure');
    assert.equal(coverage.normalizeDimension('unknownThing'), null);
  });

  it('counts sources per dimension and reports gaps', () => {
    const sources = [
      source(1, { dimensions: ['customsRelevance', 'geophysicalClimate'] }),
      source(2, { dimensions: ['customsRelevance'] }),
      source(3, { dimensions: ['tradeExposure'] }),
    ];
    const matrix = coverage.computeDimensionCoverage(sources);
    assert.equal(matrix.length, 8);
    const customs = matrix.find((entry) => entry.id === 'customsRelevance');
    assert.equal(customs.count, 2);
    assert.deepEqual(customs.refs, [1, 2]);
    const geo = matrix.find((entry) => entry.id === 'geophysicalImpact');
    assert.equal(geo.count, 1);

    const gaps = coverage.findCoverageGaps(sources);
    assert.deepEqual(gaps.map((gap) => gap.id), ['eventSeverity', 'sourceConfidence', 'routeCriticality', 'commoditySensitivity', 'escalationMomentum']);

    assert.equal(coverage.countSourcesForDimension(sources, 'customsRelevance'), 2);
  });

  it('builds theme, type and year distributions sorted for display', () => {
    const sources = [
      source(1, { themeArea: 'A', type: 'journal', year: 2024 }),
      source(2, { themeArea: 'B', type: 'report', year: 2025 }),
      source(3, { themeArea: 'A', type: 'journal', year: 2024 }),
    ];
    const themes = coverage.computeThemeDistribution(sources, { A: 'Customs AI', B: 'Supply chain' });
    assert.deepEqual(themes[0], { key: 'A', label: 'Customs AI', count: 2 });
    assert.deepEqual(coverage.computeTypeDistribution(sources)[0], { key: 'journal', label: 'journal', count: 2 });
    assert.deepEqual(coverage.computeYearHistogram(sources)[0], { key: '2025', label: '2025', count: 1 });
  });
});

describe('research bibliography filters', () => {
  it('parses field qualifiers and free text', () => {
    const query = filters.parseResearchQuery('author:anderson theme:a type:report dim:tradeExposure border controls');
    assert.equal(query.author, 'anderson');
    assert.equal(query.theme, 'A');
    assert.equal(query.type, 'report');
    assert.equal(query.dimension, 'tradeexposure');
    assert.equal(query.text, 'border controls');
  });

  it('matches on qualifiers including dimension aliases', () => {
    const query = filters.parseResearchQuery('dim:geophysicalClimate theme:a');
    assert.equal(filters.matchesResearchQuery(source(1, { dimensions: ['geophysicalClimate'] }), query), true);
    assert.equal(filters.matchesResearchQuery(source(2, { dimensions: ['tradeExposure'] }), query), false);
  });

  it('applies author/year/type filters and free text', () => {
    const entry = source(1, { authors: 'Anderson, D.', year: 2025, type: 'report', title: 'AI for border management' });
    assert.equal(filters.matchesResearchQuery(entry, filters.parseResearchQuery('author:anderson')), true);
    assert.equal(filters.matchesResearchQuery(entry, filters.parseResearchQuery('year:2024')), false);
    assert.equal(filters.matchesResearchQuery(entry, filters.parseResearchQuery('type:report border')), true);
    assert.equal(filters.matchesResearchQuery(entry, filters.parseResearchQuery('nonexistent')), false);
  });

  it('sorts by year and title in both directions', () => {
    const sources = [source(1, { year: 2021, title: 'B' }), source(2, { year: 2025, title: 'A' })];
    assert.deepEqual(filters.sortSources(sources, 'year', 'desc').map((entry) => entry.ref), [2, 1]);
    assert.deepEqual(filters.sortSources(sources, 'title', 'asc').map((entry) => entry.ref), [2, 1]);
  });
});
