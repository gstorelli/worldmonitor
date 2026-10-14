// Recent EU legal acts relevant to the thesis goods, from the Publications
// Office SPARQL endpoint (the machine interface behind EUR-Lex). Pure helpers,
// tested in tests/policy-eu-acts.test.mjs; the seeder is
// scripts/seed-policy-eu-acts.mjs.
//
// Why not EUR-Lex search: on 14/10/2026 an automated request to
// eur-lex.europa.eu/search.html answered HTTP 202 with an empty body (a bot
// challenge), so the n8n workflow 06 that scraped it could never find anything.

export const SPARQL_ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';
export const ACTS_WINDOW_DAYS = 30;
export const EU_ACTS_KEY = 'policy:eu-acts:v1';

/**
 * Regulations, decisions and directives (CELEX sector 3, types R/D/L) with an
 * Italian title, dated in the window. Relevance is decided locally with
 * word-boundary keywords: SPARQL substring filters matched words inside other
 * words (e.g. board-appointment decisions).
 */
export function buildActsQuery(sinceIso) {
  const year = sinceIso.slice(0, 4);
  const prefixes = new Set([year, String(new Date().getUTCFullYear())]);
  const celexFilter = [...prefixes]
    .flatMap((y) => ['R', 'D', 'L'].map((t) => `STRSTARTS(STR(?celex), "3${y}${t}")`))
    .join(' || ');
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?date ?title WHERE {
  ?work cdm:resource_legal_id_celex ?celex ;
        cdm:work_date_document ?date .
  FILTER(?date >= "${sinceIso}"^^xsd:date)
  FILTER(${celexFilter})
  ?expr cdm:expression_belongs_to_work ?work ;
        cdm:expression_title ?title ;
        cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ITA> .
} ORDER BY DESC(?date) LIMIT 5000`;
}

/** Italian title keywords per strategic good (HS heading of the thesis). */
export const GOOD_KEYWORDS = {
  8542: 'circuiti integrati|semiconduttori|semiconduttore',
  7403: 'rame',
  7502: 'nichel',
  7601: 'alluminio',
  2709: 'petrolio greggio|oli greggi di petrolio|greggio',
  2711: 'gas naturale|gas naturale liquefatto|gnl|gas di petrolio',
  1001: 'frumento|grano|cereali',
  3105: 'concimi|fertilizzanti|fertilizzante',
};

/** Measure types recognised in the title. */
export const MEASURE_KEYWORDS = {
  antidumping: 'antidumping',
  compensativo: 'antisovvenzioni|dazio compensativo|dazi compensativi',
  dazi: 'dazio|dazi|contingenti tariffari|contingente tariffario|tariffa doganale comune',
  classificazione: 'nomenclatura combinata',
  sanzioni: 'misure restrittive',
};

function matches(text, alternatives) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

/** Goods and measure types named in an act title (keyword match, not analysis). */
export function classifyAct(title) {
  const t = String(title ?? '');
  return {
    goods: Object.entries(GOOD_KEYWORDS).filter(([, kw]) => matches(t, kw)).map(([hs]) => hs),
    measures: Object.entries(MEASURE_KEYWORDS).filter(([, kw]) => matches(t, kw)).map(([m]) => m),
  };
}

/**
 * Keep an act when it names a thesis good, or when it is a trade-defence,
 * tariff or classification measure. Restrictive measures (sanctions) are kept
 * only when they name a good: most are listings of persons.
 */
export function isRelevant({ goods, measures }) {
  if (goods.length) return true;
  return measures.some((m) => m !== 'sanzioni');
}

export function eurLexUrl(celex) {
  return `https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:${encodeURIComponent(celex)}`;
}

/** SPARQL JSON bindings → relevant acts, newest first, one per CELEX number. */
export function actsFromBindings(json) {
  const seen = new Set();
  const acts = [];
  for (const b of json?.results?.bindings ?? []) {
    const celex = b?.celex?.value;
    const date = b?.date?.value;
    const title = String(b?.title?.value ?? '').replace(/\s+/g, ' ').trim();
    if (!celex || !date || !title || seen.has(celex)) continue;
    seen.add(celex);
    const cls = classifyAct(title);
    if (!isRelevant(cls)) continue;
    acts.push({ celex, date, title, url: eurLexUrl(celex), goods: cls.goods, measures: cls.measures });
  }
  return acts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
