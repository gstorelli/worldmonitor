import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

const citations = await import(pathToFileURL(join(here, '..', 'src', 'apps', 'research', 'citations.ts')).href);

const source = {
  ref: 3,
  authors: 'Anderson, D.; Belcineanu, A. I.; Tzvetkova, M. (European Commission JRC)',
  year: 2025,
  title: 'AI for border management and customs controls',
  type: 'report',
  venue: 'Publications Office of the European Union (EUR)',
  doi: '10.2760/1286492',
  url: 'https://data.europa.eu/doi/10.2760/1286492',
  layers: ['customs'],
  summary: 's',
  limitation: 'l',
  verified: true,
  verification: 'P',
};

describe('research citation formatting', () => {
  it('splits authors and derives a stable citation key', () => {
    assert.deepEqual(citations.splitAuthors(source.authors), [
      'Anderson, D.',
      'Belcineanu, A. I.',
      'Tzvetkova, M. (European Commission JRC)',
    ]);
    assert.equal(citations.citationKey(source), 'anderson2025border');
    // Entries generated from the thesis keep their references.bib key.
    assert.equal(citations.citationKey({ ...source, key: 'european_commission_joint_research_centre_ai_2025' }), 'european_commission_joint_research_centre_ai_2025');
  });

  it('formats APA with DOI preference over URL', () => {
    const apa = citations.formatApa(source);
    assert.match(apa, /^Anderson, D\.; Belcineanu, A\. I\.; Tzvetkova, M\. \(European Commission JRC\) \(2025\)\./);
    assert.match(apa, /https:\/\/doi\.org\/10\.2760\/1286492$/);
  });

  it('maps entry types to BibTeX and escapes special characters', () => {
    const bibtex = citations.formatBibtex(source);
    assert.match(bibtex, /^@techreport\{anderson2025border,/);
    assert.match(bibtex, /author {4}= \{Anderson, D\. and Belcineanu, A\. I\. and Tzvetkova, M\. \(European Commission JRC\)\}/);
    assert.match(bibtex, /doi {7}= \{10\.2760\/1286492\}/);

    const journal = citations.formatBibtex({ ...source, type: 'journal', title: 'A & B study_1' });
    assert.match(journal, /^@article\{/);
    assert.match(journal, /title {5}= \{A \\& B study\\_1\}/);
    assert.match(journal, /journal = \{/);
    assert.match(bibtex, /\}\n\}$/, 'the last field has no trailing comma');
  });

  it('formats RIS with one AU per author and a terminator', () => {
    const ris = citations.formatRis(source);
    assert.match(ris, /^TY {2}- RPRT/);
    assert.equal(ris.split('\n').filter((line) => line.startsWith('AU  - ')).length, 3);
    assert.match(ris, /DO {2}- 10\.2760\/1286492/);
    assert.match(ris, /ER {2}- $/);
  });

  it('exports @book as @book and round-trips volume, number, pages and note (13/11/2026)', () => {
    const book = citations.formatBibtex({ ...source, key: 'saltelli_global_2008', type: 'book', entryType: 'book', venue: 'John Wiley & Sons' });
    assert.match(book, /^@book\{saltelli_global_2008,/);
    assert.match(book, /publisher = \{John Wiley \\& Sons\}/);
    // Older data without entryType: the coarse `book` type still maps to @book.
    assert.match(citations.formatBibtex({ ...source, type: 'book' }), /^@book\{/);

    const article = citations.formatBibtex({
      ...source,
      type: 'journal',
      entryType: 'article',
      venue: 'BSSA',
      volume: '70',
      number: '4',
      pages: '1337–1346',
      note: 'Accessed 8 October 2026',
    });
    assert.match(article, /journal = \{BSSA\}/);
    assert.match(article, /volume {4}= \{70\}/);
    assert.match(article, /number {4}= \{4\}/);
    assert.match(article, /pages {5}= \{1337--1346\}/);
    assert.match(article, /note {6}= \{Accessed 8 October 2026\}/);

    const chapter = citations.formatBibtex({ ...source, type: 'conference', entryType: 'incollection', venue: 'Global Volcanic Hazards and Risk' });
    assert.match(chapter, /^@incollection\{/);
    assert.match(chapter, /booktitle = \{Global Volcanic Hazards and Risk\}/);

    // @misc: the venue that came from howpublished is exported once, as howpublished.
    const misc = citations.formatBibtex({ ...source, type: 'institutional', entryType: 'misc', venue: 'Smithsonian Institution', howpublished: 'Smithsonian Institution' });
    assert.match(misc, /^@misc\{/);
    assert.equal((misc.match(/Smithsonian Institution/g) ?? []).length, 1);
    assert.match(misc, /howpublished = \{Smithsonian Institution\}/);

    const ris = citations.formatRis({ ...source, type: 'book', volume: '70', pages: '1337–1346' });
    assert.match(ris, /^TY {2}- BOOK/);
    assert.match(ris, /VL {2}- 70\nSP {2}- 1337\nEP {2}- 1346/);
  });

  it('exports collections and CSV with quoting', () => {
    const collection = citations.toBibtexCollection([source, { ...source, ref: 4, doi: null, url: 'https://x' }]);
    assert.equal((collection.match(/@techreport/g) ?? []).length, 2);

    const csv = citations.toCsv([{ ...source, title: 'Title, with "quotes"' }]);
    assert.match(csv, /^ref,key,authors,year,title,type,venue,doi,url,layers,verified,verification/);
    assert.match(csv, /"Title, with ""quotes"""/);
  });
});
