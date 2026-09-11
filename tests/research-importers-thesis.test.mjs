import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => import(pathToFileURL(join(here, '..', 'src', 'apps', 'research', name)).href);

const importers = await load('importers.ts');
const thesis = await load('thesis.ts');
const model = await load('model.ts');
const calls = await load('calls.ts');
const filters = await load('filters.ts');

const bibtex = `@article{doe2024customs,
  author = {Doe, J. and Roe, A.},
  title = {Customs Risk and {AI} Controls},
  journal = {Journal of Trade},
  year = {2024},
  doi = {10.1000/xyz},
  url = {https://example.org/x}
}
@inproceedings{smith2023ports,
  author = {Smith, K.},
  title = {Port Disruptions},
  booktitle = {Proc. of Maritime Conf},
  year = {2023}
}`;

const ris = `TY  - JOUR
AU  - Doe, J.
AU  - Roe, A.
TI  - Customs Risk and AI Controls
PY  - 2024
JO  - Journal of Trade
DO  - 10.1000/xyz
UR  - https://example.org/x
ER  - `;

describe('research importers', () => {
  it('parses BibTeX entries with braces and maps types', () => {
    const parsed = importers.parseBibtex(bibtex);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].title, 'Customs Risk and AI Controls');
    assert.equal(parsed[0].authors, 'Doe, J.; Roe, A.');
    assert.equal(parsed[0].type, 'journal');
    assert.equal(parsed[0].doi, '10.1000/xyz');
    assert.equal(parsed[1].type, 'conference');
    assert.equal(parsed[1].venue, 'Proc. of Maritime Conf');
  });

  it('parses RIS records and detects the format', () => {
    const parsed = importers.parseRis(ris);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, 'Customs Risk and AI Controls');
    assert.equal(parsed[0].authors, 'Doe, J.; Roe, A.');
    assert.equal(parsed[0].year, 2024);
    assert.equal(parsed[0].type, 'journal');
    assert.equal(importers.parseBibliography(ris).length, 1);
    assert.equal(importers.parseBibliography('nessuna bibliografia qui').length, 0);
  });

  it('assigns refs above the imported base without colliding', () => {
    const existing = [
      {
        ref: 1001,
        authors: 'X',
        year: 2020,
        title: 'Y',
        type: 'journal',
        venue: '',
        doi: null,
        url: '',
        themeArea: '',
        summary: '',
        limitation: '',
        contribution: '',
        dimensions: [],
        verified: false,
      },
    ];
    const [assigned] = importers.assignRefs([{ ...importers.parseRis(ris)[0] }], existing);
    assert.equal(assigned.ref, 1002);
  });
});

describe('research state model', () => {
  it('merges overrides and combines curated + imported sources', () => {
    const curated = [{ ref: 1, authors: 'A', year: 2020, title: 'T', type: 'journal', venue: 'V', doi: null, url: 'u', themeArea: 'A', summary: '', limitation: '', contribution: '', dimensions: [], verified: true }];
    const state = {
      notes: { '1': 'nota' },
      reading: { '1': { state: 'reading', priority: 'high', tags: ['customs'] } },
      overrides: { '1': { doi: '10.1/x', venue: 'Nuova Venue' } },
      imported: [{ ...curated[0], ref: 1000, title: 'Importata' }],
    };
    const merged = model.allSources(curated, state);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].doi, '10.1/x');
    assert.equal(merged[0].venue, 'Nuova Venue');
    assert.equal(model.readingEntry(state, 1).priority, 'high');
    assert.equal(model.withNote(state, 1, '').notes['1'], undefined);
    assert.equal(model.withReading(state, 1, { state: 'reviewed' }).reading['1'].state, 'reviewed');
    assert.equal(model.nextImportedRef(state.imported), 1001);
  });
});

describe('research filters workflow qualifiers', () => {
  const source = { ref: 1, authors: 'Doe', year: 2024, title: 'T', type: 'journal', venue: 'V', doi: null, url: '', themeArea: 'A', summary: '', limitation: '', contribution: '', dimensions: [], verified: true };
  const reading = { state: 'reviewed', priority: 'high', tags: ['customs'] };

  it('filters by status, priority and tag', () => {
    assert.equal(filters.matchesResearchQuery(source, filters.parseResearchQuery('status:reviewed'), reading), true);
    assert.equal(filters.matchesResearchQuery(source, filters.parseResearchQuery('status:to-read'), reading), false);
    assert.equal(filters.matchesResearchQuery(source, filters.parseResearchQuery('prio:high'), reading), true);
    assert.equal(filters.matchesResearchQuery(source, filters.parseResearchQuery('tag:cust'), reading), true);
    assert.equal(filters.matchesResearchQuery(source, filters.parseResearchQuery('tag:nope'), reading), false);
  });
});

describe('research calls calendar', () => {
  it('computes days until a deadline and sorts calls with deadlines first', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(calls.daysUntil('2026-01-11', now), 10);
    assert.equal(calls.daysUntil(null, now), null);
    const sorted = calls.callsForThemes([], now);
    assert.ok(sorted.length >= 10);
  });
});

describe('research thesis generators', () => {
  const source = { ref: 1, authors: 'Doe, J.', year: 2024, title: 'Customs Risk', type: 'journal', venue: 'Journal of Trade', doi: '10.1/x', url: 'https://x', themeArea: 'A', summary: '', limitation: '', contribution: '', dimensions: ['customsRelevance'], verified: true };
  const state = { notes: { '1': 'Nota utile' }, reading: { '1': { state: 'reviewed', priority: 'high', tags: ['customs'] } }, overrides: {}, imported: [] };

  it('generates Markdown with citations, notes and coverage table', () => {
    const md = thesis.generateThesisMarkdown([source], state);
    assert.match(md, /# Risk Sentinel — Literature review/);
    assert.match(md, /## Tema A — Customs AI/);
    assert.match(md, /Doe, J\. \(2024\)\. Customs Risk\./);
    assert.match(md, /> Nota utile/);
    assert.match(md, /stato: revisionata/);
    assert.match(md, /## Copertura metodologica \(modello 8D\)/);
    assert.match(md, /\| Commodity Sensitivity \| 0 \| — \|/);
  });

  it('generates LaTeX with escaping and theme filtering', () => {
    const tex = thesis.generateThesisLatex([source], state, { themes: ['B'] });
    assert.match(tex, /\\section\*\{Literature review/);
    assert.ok(!tex.includes('Tema A'));
    const texAll = thesis.generateThesisLatex([{ ...source, title: 'A & B_study' }], state);
    assert.match(texAll, /A \\& B\\_study/);
  });
});
