import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => import(pathToFileURL(join(here, '..', 'src', 'apps', 'research', name)).href);

const importers = await load('importers.ts');
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
        layers: [],
        summary: '',
        limitation: '',
        verified: false,
        verification: null,
      },
    ];
    const [assigned] = importers.assignRefs([{ ...importers.parseRis(ris)[0] }], existing);
    assert.equal(assigned.ref, 1002);
  });
});

describe('research state model', () => {
  it('merges overrides and combines curated + imported sources', () => {
    const curated = [{ ref: 1, authors: 'A', year: 2020, title: 'T', type: 'journal', venue: 'V', doi: null, url: 'u', layers: ['customs'], summary: '', limitation: '', verified: true, verification: 'P' }];
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
  const source = { ref: 1, authors: 'Doe', year: 2024, title: 'T', type: 'journal', venue: 'V', doi: null, url: '', layers: ['customs'], summary: '', limitation: '', verified: true, verification: 'P' };
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
    // Pruned on 13/10/2026 to the venues pertinent to the thesis.
    assert.equal(sorted.length, 8);
    assert.ok(!sorted.some((call) => /neurips|acl/i.test(call.id)));
    for (const call of sorted) {
      for (const topic of call.themes) assert.ok(topic in calls.CALL_TOPICS, `${call.id}: unknown topic ${topic}`);
    }
    assert.deepEqual(calls.callsForThemes(['dogane'], now).map((call) => call.id).sort(), ['wco-picard', 'wco-tech']);
  });
});
