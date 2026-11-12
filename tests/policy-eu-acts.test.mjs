import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { actsFromBindings, buildActsQuery, classifyAct, cnHeadings, eurLexUrl, isRelevant } from '../scripts/_policy-eu-acts.mjs';

const b = (celex, date, title) => ({ celex: { value: celex }, date: { value: date }, title: { value: title } });

describe('EU acts classification (title keywords, word boundaries)', () => {
  it('finds goods and measure types', () => {
    assert.deepEqual(
      classifyAct('Regolamento di esecuzione (UE) 2026/2101 che istituisce un dazio antidumping definitivo sulle importazioni di fogli di alluminio'),
      { goods: ['7601'], goodMatches: [{ hs: '7601', match: 'keyword' }], measures: ['antidumping', 'dazi'] },
    );
    assert.deepEqual(classifyAct('che istituisce un dazio compensativo definitivo').measures, ['compensativo', 'dazi']);
    assert.deepEqual(classifyAct('classificazione di talune merci nella nomenclatura combinata').measures, ['classificazione']);
  });

  it('does not link biocide or plant-protection approvals to a good', () => {
    assert.deepEqual(
      classifyAct("che posticipa la data di scadenza dell'approvazione del rame granulato ai fini del suo uso nei biocidi del tipo di prodotto 8"),
      { goods: [], goodMatches: [], measures: [] },
    );
  });

  it('does not match a keyword inside another word', () => {
    assert.deepEqual(classifyAct('sostituzione di un membro del consiglio di amministrazione della Fondazione'), { goods: [], goodMatches: [], measures: [] });
    assert.deepEqual(classifyAct('in materia di ramerie e grandine').goods, []);
  });

  it('keeps sanctions only when they name a good', () => {
    assert.equal(isRelevant(classifyAct('misure restrittive nei confronti di persone fisiche')), false);
    assert.equal(isRelevant(classifyAct('misure restrittive: divieto di importazione di alluminio')), true);
    assert.equal(isRelevant(classifyAct('nomina del direttore di un\'agenzia')), false);
  });
});

describe('EU acts classification: crude oil, cereals, CN codes', () => {
  it('does not tag unwrought metals as crude oil', () => {
    assert.deepEqual(classifyAct('dazio antidumping sulle importazioni di nichel greggio').goods, ['7502']);
    assert.deepEqual(classifyAct("contingente tariffario per l'alluminio greggio").goods, ['7601']);
    assert.deepEqual(classifyAct('alluminio greggio non legato').goodMatches, [{ hs: '7601', match: 'keyword' }]);
  });

  it('tags 2709 only on petroleum phrases', () => {
    assert.deepEqual(classifyAct('misure restrittive: prezzo massimo del petrolio greggio').goods, ['2709']);
    assert.deepEqual(classifyAct('importazioni di oli greggi di petrolio').goods, ['2709']);
    assert.deepEqual(classifyAct('greggio di petrolio originario della Russia').goods, ['2709']);
    assert.deepEqual(classifyAct('materiale greggio').goods, []);
  });

  it('does not tag every cereal act as wheat', () => {
    assert.deepEqual(classifyAct("dazi all'importazione nel settore dei cereali").goods, []);
    assert.deepEqual(classifyAct('contingente tariffario per il frumento tenero').goods, ['1001']);
    assert.deepEqual(classifyAct('cereali: grano duro').goods, ['1001']);
    assert.deepEqual(classifyAct('cereali di cui al codice NC 1001 99 00').goodMatches, [{ hs: '1001', match: 'cn' }]);
  });

  it('matches CN codes by heading prefix, with optional dots or spaces', () => {
    assert.deepEqual(classifyAct('classificazione di una merce del codice NC 7601').goodMatches, [{ hs: '7601', match: 'cn' }]);
    assert.deepEqual(cnHeadings('prodotti dei codici NC 7601 10 00 e 7601 20'), ['7601']);
    assert.deepEqual(cnHeadings('sottovoce 7601.10.00'), ['7601']);
    assert.deepEqual(cnHeadings('codice NC 8542 31'), ['8542']);
    assert.deepEqual(cnHeadings('codice NC 85423190'), ['8542']);
    assert.deepEqual(cnHeadings('codici NC 2709 00 e 3105 20 10'), ['2709', '3105']);
    // Headings outside the thesis set do not count.
    assert.deepEqual(cnHeadings('codice NC 7202 21 00'), []);
  });

  it('prefers cn over keyword when both name the same heading', () => {
    assert.deepEqual(classifyAct('alluminio greggio del codice NC 7601').goodMatches, [{ hs: '7601', match: 'cn' }]);
  });

  it('does not read act numbers, years or dates as CN codes', () => {
    assert.deepEqual(cnHeadings('Regolamento di esecuzione (UE) 2026/2711 della Commissione'), []);
    assert.deepEqual(cnHeadings('modifica del regolamento (CEE) n. 2658/87'), []);
    assert.deepEqual(cnHeadings('decisione 2709-2026'), []);
    assert.deepEqual(cnHeadings('applicabile dal 1.1.3105'), []);
    assert.deepEqual(cnHeadings('valore 7601,5'), []);
    assert.deepEqual(cnHeadings('lotto A7601'), []);
  });

  it('does not link a CN code in a biocide approval to a good', () => {
    assert.deepEqual(classifyAct('sostanza attiva rame, codice NC 7403').goods, []);
  });
});

describe('EU acts shaping', () => {
  it('keeps relevant acts, newest first, one per CELEX, with the EUR-Lex link', () => {
    const acts = actsFromBindings({ results: { bindings: [
      b('32026R2088', '2026-09-18', 'dazio antidumping definitivo su ferro-silicio'),
      b('32026R2265', '2026-10-06', 'classificazione di talune merci nella nomenclatura  combinata'),
      b('32026R2265', '2026-10-06', 'duplicato'),
      b('32026D05381', '2026-10-09', 'sostituzione di un membro del consiglio di amministrazione'),
    ] } });
    assert.deepEqual(acts.map((a) => a.celex), ['32026R2265', '32026R2088']);
    assert.equal(acts[0].title, 'classificazione di talune merci nella nomenclatura combinata');
    assert.equal(acts[0].url, 'https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32026R2265');
    assert.deepEqual(actsFromBindings(null), []);
  });

  it('adds documentDate (same as date) and inForceFrom null, and keeps date', () => {
    const [act] = actsFromBindings({ results: { bindings: [b('32026R2101', '2026-10-01', 'antidumping su alluminio greggio, codice NC 7601')] } });
    assert.equal(act.date, '2026-10-01');
    assert.equal(act.documentDate, '2026-10-01');
    assert.equal(act.inForceFrom, null);
    assert.deepEqual(act.goods, ['7601']);
    assert.deepEqual(act.goodMatches, [{ hs: '7601', match: 'cn' }]);
  });

  it('queries regulations, decisions and directives since the given day', () => {
    const q = buildActsQuery('2026-09-14');
    assert.match(q, /"2026-09-14"\^\^xsd:date/);
    assert.match(q, /STRSTARTS\(STR\(\?celex\), "32026R"\)/);
    assert.match(q, /language\/ITA/);
    assert.doesNotMatch(q, /XC/);
    assert.equal(eurLexUrl('32026R2101'), 'https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32026R2101');
  });
});

describe('EU acts query: OJ C notices option', () => {
  it('is off by default and adds sector 5 XC notices when asked', () => {
    assert.equal(buildActsQuery('2026-09-14', {}), buildActsQuery('2026-09-14'));
    const q = buildActsQuery('2026-09-14', { includeOjCNotices: true });
    assert.match(q, /STRSTARTS\(STR\(\?celex\), "52026XC"\)/);
    assert.match(q, /STRSTARTS\(STR\(\?celex\), "32026R"\)/);
    assert.match(q, /language\/ITA/);
  });
});
