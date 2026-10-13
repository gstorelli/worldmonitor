// scripts/build-research-bibliography.mjs (13/10/2026): the Research
// bibliography is generated from the private thesis repository; only metadata,
// model layer and verification level may reach this public repository.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildSources,
  cleanLatex,
  formatAuthors,
  parseBibtex,
  parseRegister,
} from '../scripts/build-research-bibliography.mjs';

const BIB = `
@article{white_multi_2025,
  author  = {White, Christopher J. and Ward, Philip J.},
  title   = {Multi-hazard {Risk}: a {review}},
  journal = {Natural Hazards and Earth System Sciences},
  year    = {2025},
  doi     = {10.5194/nhess-25-4263-2025}
}
@misc{eurostat_comext_2026,
  author       = {{Eurostat}},
  title        = {Comext -- {EU} trade since 1988},
  howpublished = {\\url{https://ec.europa.eu/eurostat/comext}},
  year         = {2026}
}
@misc{reedsmith_lng_2024,
  author = {{Reed Smith}},
  title  = {LNG sanctions},
  year   = {2024}
}
@article{van_maanen_bridging_2025,
  author = {van Maanen, N. and J\\"ager, W. and Szama{\\l}ek, K.},
  title  = {Bridging gaps},
  journal = {Earth System Dynamics},
  year   = {2025}
}`;

const REGISTER = `
## Da non usare

| Fonte | Motivo |
|---|---|
| Reed Smith 2024 (\`reedsmith_lng_2024\`) | superata |

## Pericoli, cataloghi e metodi sismologici

| Chiave | Verificato | Come | Data |
|---|---|---|---|
| \`white_multi_2025\` | PRIVATE NOTE: 192 pubblicazioni; 88% | T | 11/10 |
| \`van_maanen_bridging_2025\` | PRIVATE NOTE: interviste | P | 7/10 |

## Nodi, commercio e beni strategici

| Chiave | Verificato | Come | Data |
|---|---|---|---|
| \`eurostat_comext_2026\` | PRIVATE NOTE: quote e HHI | API | 11/10 |
`;

describe('build-research-bibliography', () => {
  const entries = parseBibtex(BIB);
  const register = parseRegister(REGISTER, new Set(entries.map((entry) => entry.key)));

  it('parses BibTeX entries, nested braces and LaTeX accents', () => {
    assert.equal(entries.length, 4);
    assert.equal(cleanLatex(entries[0].fields.title), 'Multi-hazard Risk: a review');
    assert.equal(cleanLatex(entries[1].fields.title), 'Comext – EU trade since 1988');
    assert.equal(formatAuthors(entries[3].fields.author), 'van Maanen, N.; Jäger, W.; Szamałek, K.');
    assert.equal(formatAuthors('{European Commission. Joint Research Centre} and Anderson, David'), 'European Commission. Joint Research Centre; Anderson, D.');
  });

  it('maps register sections to model layers and keeps the verification level', () => {
    const sources = buildSources(entries, register, []);
    const byKey = Object.fromEntries(sources.map((source) => [source.key, source]));
    assert.deepEqual(byKey.white_multi_2025.layers, ['trigger']);
    assert.equal(byKey.white_multi_2025.verification, 'T');
    assert.deepEqual(byKey.eurostat_comext_2026.layers, ['node', 'good']);
    assert.equal(byKey.eurostat_comext_2026.verification, 'API');
    assert.equal(byKey.eurostat_comext_2026.url, 'https://ec.europa.eu/eurostat/comext');
    assert.equal(byKey.eurostat_comext_2026.type, 'institutional');
    assert.equal(byKey.white_multi_2025.url, 'https://doi.org/10.5194/nhess-25-4263-2025');
  });

  it('omits sources marked "Da non usare" and never copies the private notes', () => {
    const sources = buildSources(entries, register, []);
    assert.ok(!sources.some((source) => source.key === 'reedsmith_lng_2024'));
    assert.ok(!JSON.stringify(sources).includes('PRIVATE NOTE'));
  });

  it('keeps the refs (and public summaries) of entries already published', () => {
    const previous = [
      { ref: 19, doi: '10.5194/nhess-25-4263-2025', title: 'old title', summary: 'public summary' },
      { ref: 40, key: 'eurostat_comext_2026', title: 'Comext' },
    ];
    const sources = buildSources(entries, register, previous);
    const byKey = Object.fromEntries(sources.map((source) => [source.key, source]));
    assert.equal(byKey.white_multi_2025.ref, 19);
    assert.equal(byKey.white_multi_2025.summary, 'public summary');
    assert.equal(byKey.eurostat_comext_2026.ref, 40);
    assert.equal(byKey.van_maanen_bridging_2025.ref, 41, 'new entries take the next free ref');
  });

  it('the committed data file carries no verification notes', () => {
    const data = JSON.parse(readFileSync(new URL('../data/zotero-sources.json', import.meta.url), 'utf8'));
    assert.equal(data.schema_version, 2);
    for (const source of data.sources) {
      assert.deepEqual(
        Object.keys(source).sort(),
        ['authors', 'doi', 'key', 'layers', 'limitation', 'ref', 'summary', 'title', 'type', 'url', 'venue', 'verification', 'verified', 'year'].sort(),
      );
    }
  });
});
