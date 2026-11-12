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
 *
 * `includeOjCNotices` (default OFF) also scans OJ C information notices
 * (CELEX sector 5, type XC: e.g. "Avviso di apertura di un procedimento
 * antidumping", "Avviso di imminente scadenza", expiry-review initiations).
 * The CELEX shape was checked with one read-only query on 13/11/2026 (notices
 * 52026XC05783, 52026XC05566 returned with an Italian title and
 * cdm:work_date_document), but the volume of a full 30-day XC scan and the
 * effect on the LIMIT were not: before switching it on, run the seeder once
 * against the live endpoint and compare `scanned` with and without it.
 */
export function buildActsQuery(sinceIso, { includeOjCNotices = false } = {}) {
  const year = sinceIso.slice(0, 4);
  const prefixes = new Set([year, String(new Date().getUTCFullYear())]);
  const celexFilter = [...prefixes]
    .flatMap((y) => [
      ...['R', 'D', 'L'].map((t) => `STRSTARTS(STR(?celex), "3${y}${t}")`),
      ...(includeOjCNotices ? [`STRSTARTS(STR(?celex), "5${y}XC")`] : []),
    ])
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

/**
 * Italian title keywords per strategic good (HS heading of the thesis).
 *
 * 2709: only petroleum phrases. A bare "greggio" means "unwrought" for metals
 * ("nichel greggio" 7502, "alluminio greggio" 7601), so it never tags crude oil.
 * 1001: only "frumento"/"grano". "cereali" covers maize, barley, rice, … and
 * does not identify wheat; a cereal act without them links to 1001 only
 * through the CN code (see cnHeadings).
 */
export const GOOD_KEYWORDS = {
  8542: 'circuiti integrati|semiconduttori|semiconduttore',
  7403: 'rame',
  7502: 'nichel',
  7601: 'alluminio',
  2709: 'petrolio greggio|greggio di petrolio|oli greggi di petrolio|oli greggi di minerali bituminosi',
  2711: 'gas naturale|gas naturale liquefatto|gnl|gas di petrolio',
  1001: 'frumento|grano',
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

/**
 * Approvals of active substances (biocides, plant protection products) name a
 * metal (e.g. "rame granulato … biocidi", 24/9/2026) without being trade
 * measures on the good: they never link to a good.
 */
export const NOT_A_GOOD_MEASURE = 'biocidi|biocida|fitosanitari|fitosanitario|sostanza attiva|sostanze attive';

/**
 * CN/HS codes cited in a title: a 4-digit heading optionally followed by up to
 * two 2-digit groups, separated by nothing, a dot or a space ("7601",
 * "7601 10 00", "7601.10", "codice NC 8542 31"). Numbers touching a slash or a
 * hyphen, or preceded by a dot, are act numbers or dates ("(UE) 2026/2711",
 * "2658/87", "1.1.2026"), not codes.
 * Returns the thesis headings matched by prefix.
 */
const CN_CODE = /(?<![\p{L}\p{N}/.-])(\d{4})(?:[ .]?\d{2}){0,2}(?![\p{L}\p{N}/-]|[.,]\d)/gu;
export function cnHeadings(title) {
  const headings = new Set(Object.keys(GOOD_KEYWORDS));
  const found = [];
  for (const m of String(title ?? '').matchAll(CN_CODE)) {
    if (headings.has(m[1]) && !found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

/**
 * Goods and measure types named in an act title (keyword or CN-code match, not
 * analysis). `goodMatches` records how each good was found: 'cn' when the
 * title cites a CN code of that heading (takes precedence), else 'keyword'.
 */
export function classifyAct(title) {
  const t = String(title ?? '');
  const goodsAllowed = !matches(t, NOT_A_GOOD_MEASURE);
  const cn = goodsAllowed ? cnHeadings(t) : [];
  const goodMatches = goodsAllowed
    ? Object.entries(GOOD_KEYWORDS)
        .filter(([hs, kw]) => cn.includes(hs) || matches(t, kw))
        .map(([hs]) => ({ hs, match: cn.includes(hs) ? 'cn' : 'keyword' }))
    : [];
  return {
    goods: goodMatches.map((g) => g.hs),
    goodMatches,
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

/**
 * SPARQL JSON bindings → relevant acts, newest first, one per CELEX number.
 * `date` is kept for existing consumers; `documentDate` names what it is
 * (cdm:work_date_document, the date of the act, not its entry into force).
 * `inForceFrom` is null: the query does not read an entry-into-force date.
 */
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
    acts.push({
      celex,
      date,
      documentDate: date,
      inForceFrom: null,
      title,
      url: eurLexUrl(celex),
      goods: cls.goods,
      goodMatches: cls.goodMatches,
      measures: cls.measures,
    });
  }
  return acts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
