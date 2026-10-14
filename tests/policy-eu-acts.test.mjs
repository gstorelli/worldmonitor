import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { actsFromBindings, buildActsQuery, classifyAct, eurLexUrl, isRelevant } from '../scripts/_policy-eu-acts.mjs';

const b = (celex, date, title) => ({ celex: { value: celex }, date: { value: date }, title: { value: title } });

describe('EU acts classification (title keywords, word boundaries)', () => {
  it('finds goods and measure types', () => {
    assert.deepEqual(
      classifyAct('Regolamento di esecuzione (UE) 2026/2101 che istituisce un dazio antidumping definitivo sulle importazioni di fogli di alluminio'),
      { goods: ['7601'], measures: ['antidumping', 'dazi'] },
    );
    assert.deepEqual(classifyAct('che istituisce un dazio compensativo definitivo').measures, ['compensativo', 'dazi']);
    assert.deepEqual(classifyAct('classificazione di talune merci nella nomenclatura combinata').measures, ['classificazione']);
  });

  it('does not match a keyword inside another word', () => {
    assert.deepEqual(classifyAct('sostituzione di un membro del consiglio di amministrazione della Fondazione'), { goods: [], measures: [] });
    assert.deepEqual(classifyAct('in materia di ramerie e grandine').goods, []);
  });

  it('keeps sanctions only when they name a good', () => {
    assert.equal(isRelevant(classifyAct('misure restrittive nei confronti di persone fisiche')), false);
    assert.equal(isRelevant(classifyAct('misure restrittive: divieto di importazione di alluminio')), true);
    assert.equal(isRelevant(classifyAct('nomina del direttore di un\'agenzia')), false);
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

  it('queries regulations, decisions and directives since the given day', () => {
    const q = buildActsQuery('2026-09-14');
    assert.match(q, /"2026-09-14"\^\^xsd:date/);
    assert.match(q, /STRSTARTS\(STR\(\?celex\), "32026R"\)/);
    assert.match(q, /language\/ITA/);
    assert.equal(eurLexUrl('32026R2101'), 'https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32026R2101');
  });
});
