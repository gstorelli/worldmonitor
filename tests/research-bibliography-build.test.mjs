// scripts/build-research-bibliography.mjs (13/10/2026): the Research
// bibliography is generated from the private thesis repository; only metadata,
// model layer and verification level may reach this public repository.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildSources,
  checkHygiene,
  cleanLatex,
  formatAuthors,
  parseBibtex,
  parseRegister,
  readLayerOverrides,
  sourceUrl,
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

  it('applies per-source layer overrides after the section default (13/11/2026)', () => {
    const overrides = readLayerOverrides({ overrides: { white_multi_2025: ['signal'], empty_key: [] } });
    assert.deepEqual([...overrides.keys()], ['white_multi_2025'], 'empty lists are ignored');
    const byKey = Object.fromEntries(buildSources(entries, register, [], overrides).map((source) => [source.key, source]));
    assert.deepEqual(byKey.white_multi_2025.layers, ['signal']);
    assert.deepEqual(byKey.eurostat_comext_2026.layers, ['node', 'good'], 'sources without an override keep the section default');
  });

  it('the committed overrides keep GDELT and UCDP out of the trigger layer', () => {
    const json = JSON.parse(readFileSync(new URL('../data/research-layer-overrides.json', import.meta.url), 'utf8'));
    const overrides = readLayerOverrides(json);
    for (const key of ['gdelt_data_2026', 'ucdp_ged_2026']) {
      assert.ok(overrides.get(key)?.includes('signal'), `${key} is a signal`);
      assert.ok(!overrides.get(key)?.includes('trigger'), `${key} is never a trigger`);
    }
    const data = JSON.parse(readFileSync(new URL('../data/zotero-sources.json', import.meta.url), 'utf8'));
    for (const source of data.sources.filter((s) => overrides.has(s.key))) {
      assert.deepEqual(source.layers, overrides.get(source.key), `${source.key}: generated layers follow the override`);
    }
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
      const keys = Object.keys(source);
      for (const key of REQUIRED_FIELDS) assert.ok(keys.includes(key), `${source.key} lacks ${key}`);
      for (const key of keys) {
        assert.ok(REQUIRED_FIELDS.includes(key) || OPTIONAL_FIELDS.includes(key), `${source.key} has unexpected field ${key}`);
      }
    }
  });
});

// Schema v2 fields, plus the optional BibTeX fields added on 13/11/2026.
const REQUIRED_FIELDS = ['authors', 'doi', 'key', 'layers', 'limitation', 'ref', 'summary', 'title', 'type', 'url', 'venue', 'verification', 'verified', 'year'];
const OPTIONAL_FIELDS = ['entryType', 'volume', 'number', 'pages', 'howpublished', 'note'];

const FIDELITY_BIB = String.raw`
@misc{reg_2024_1252,
  author       = {{European Parliament and Council of the European Union}},
  title        = {Regulation (EU) 2024/1252},
  howpublished = {Official Journal of the European Union, L series},
  year         = {2024},
  note         = {\url{http://data.europa.eu/eli/reg/2024/1252/oj}}
}
@misc{intesa_note_2024,
  author       = {{Intesa Sanpaolo}},
  title        = {Nota Mar Rosso},
  howpublished = {Intesa Sanpaolo, Direzione Studi e Ricerche},
  year         = {2024},
  note         = {February 2024. \url{https://example.org/Nota\%20Mar_Rosso~1--2.pdf}}
}
@book{saltelli_global_2008,
  author    = {Saltelli, Andrea and Ratto, Marco},
  title     = {Global Sensitivity Analysis. {The} Primer},
  publisher = {John Wiley \& Sons},
  year      = {2008},
  doi       = {10.1002/9780470725184}
}
@article{weichert_1980,
  author  = {Weichert, Dieter H.},
  title   = {Estimation of the earthquake recurrence parameters},
  journal = {Bulletin of the Seismological Society of America},
  volume  = {70},
  number  = {4},
  pages   = {1337--1346},
  year    = {1980},
  doi     = {10.1785/BSSA0700041337}
}
@article{weichert_copy_1980,
  author  = {Weichert, D.},
  title   = {Estimation of the earthquake recurrence parameters (copy)},
  journal = {BSSA},
  year    = {1980},
  doi     = {10.1785/bssa0700041337}
}
@misc{dup_key_2024,
  title = {Same key},
  year  = {2024}
}
@misc{dup_key_2024,
  title = {Same key, second entry},
  year  = {2024}
}`;

describe('build-research-bibliography: fidelity and hygiene (13/11/2026)', () => {
  const entries = parseBibtex(FIDELITY_BIB);
  const byKey = Object.fromEntries(entries.map((entry) => [entry.key, entry]));
  const misc = (fields) => ({ type: 'misc', key: 'k', fields });

  it('reads the \\url{} inside note, the convention of most @misc entries', () => {
    assert.equal(sourceUrl(byKey.reg_2024_1252), 'http://data.europa.eu/eli/reg/2024/1252/oj');
    // LaTeX escapes are undone, but ~ and -- inside a URL are left alone.
    assert.equal(sourceUrl(byKey.intesa_note_2024), 'https://example.org/Nota%20Mar_Rosso~1--2.pdf');
    assert.equal(cleanLatex(byKey.intesa_note_2024.fields.note), 'February 2024. https://example.org/Nota%20Mar_Rosso~1--2.pdf');
  });

  it('keeps the precedence url > doi > howpublished/note url > arXiv', () => {
    assert.equal(sourceUrl(misc({ url: 'https://a', doi: '10.1/x', note: String.raw`\url{https://n}` })), 'https://a');
    assert.equal(sourceUrl(misc({ doi: '10.1/x', note: String.raw`\url{https://n}` })), 'https://doi.org/10.1/x');
    assert.equal(sourceUrl(misc({ howpublished: String.raw`\url{https://h}`, note: String.raw`\url{https://n}` })), 'https://h');
    assert.equal(sourceUrl(misc({ note: 'arXiv preprint arXiv:2511.03152' })), 'https://arxiv.org/abs/2511.03152');
  });

  it('keeps @book as book and carries volume, number, pages, howpublished and note', () => {
    const sources = Object.fromEntries(buildSources(entries, new Map(), []).map((source) => [source.key, source]));
    assert.equal(sources.saltelli_global_2008.type, 'book');
    assert.equal(sources.saltelli_global_2008.entryType, 'book');
    assert.equal(sources.saltelli_global_2008.venue, 'John Wiley & Sons');
    assert.equal('volume' in sources.saltelli_global_2008, false, 'absent fields are left out');
    assert.equal(sources.weichert_1980.volume, '70');
    assert.equal(sources.weichert_1980.number, '4');
    assert.equal(sources.weichert_1980.pages, '1337–1346');
    assert.equal(sources.intesa_note_2024.howpublished, 'Intesa Sanpaolo, Direzione Studi e Ricerche');
    assert.equal(sources.intesa_note_2024.note, 'February 2024. https://example.org/Nota%20Mar_Rosso~1--2.pdf');
    // A note that is only the URL is not repeated (it is already `url`).
    assert.equal(sources.reg_2024_1252.url, 'http://data.europa.eu/eli/reg/2024/1252/oj');
    assert.equal(sources.reg_2024_1252.note, undefined);
  });

  it('reports duplicate DOIs (case-insensitive), duplicate keys and keys without a register row', () => {
    const markdown = '## Metodo\n\n| Chiave | Verificato | Come |\n|---|---|---|\n| `weichert_1980` | x | T |\n';
    const report = checkHygiene(entries, parseRegister(markdown, new Set(entries.map((e) => e.key))));
    assert.deepEqual(report.duplicateDois, [{ doi: '10.1785/bssa0700041337', keys: ['weichert_1980', 'weichert_copy_1980'] }]);
    assert.deepEqual(report.duplicateKeys, [{ key: 'dup_key_2024', count: 2 }]);
    assert.deepEqual(report.missingRegister, ['reg_2024_1252', 'intesa_note_2024', 'saltelli_global_2008', 'weichert_copy_1980', 'dup_key_2024']);

    const clean = parseBibtex(BIB);
    assert.deepEqual(checkHygiene(clean, parseRegister(REGISTER, new Set(clean.map((e) => e.key)))), {
      duplicateDois: [],
      duplicateKeys: [],
      missingRegister: [],
    });
  });
});
