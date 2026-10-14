import { getPublicCorsHeaders } from '../_cors.js';
import { redisGetJson, redisSetJson } from '../_redis.js';

export const config = { runtime: 'edge' };

const CACHE_TTL_SECONDS = 6 * 3600;
const MAX_LIMIT = 25;
// Bump when the query/providers change so stale cached bodies are not served.
const CACHE_VERSION = 'v4';

/** Rebuild a plain abstract from OpenAlex's inverted index. */
function invertAbstract(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) words[position] = word;
  }
  return words.filter(Boolean).join(' ');
}

/**
 * Normalize an OpenAlex work into the shape the "Novità accademiche" tab uses.
 * Pure + exported for tests.
 *
 * @param {any} work
 */
export function normalizeOpenAlexWork(work) {
  if (!work || typeof work !== 'object') return null;
  const authors = Array.isArray(work.authorships)
    ? work.authorships
        .slice(0, 6)
        .map((authorship) => authorship?.author?.display_name)
        .filter(Boolean)
        .join('; ')
    : '';
  const doi = typeof work.doi === 'string' ? work.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : '';
  return {
    id: work.id ?? '',
    title: work.title ?? work.display_name ?? '',
    authors,
    year: work.publication_year ?? null,
    date: work.publication_date ?? '',
    venue: work.primary_location?.source?.display_name ?? '',
    doi,
    url: work.primary_location?.landing_page_url || work.doi || '',
    citedByCount: work.cited_by_count ?? 0,
    source: 'openalex',
    abstract: invertAbstract(work.abstract_inverted_index).slice(0, 700),
  };
}

function decodeEntities(value) {
  let text = String(value ?? '');
  // Two passes so double-encoded values (`&amp;nbsp;`) fully resolve.
  for (let pass = 0; pass < 2; pass += 1) {
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'");
  }
  return text;
}

/**
 * Normalize a Crossref work (used for the recent-works search) into the same
 * shape as the OpenAlex items. Pure + exported for tests.
 *
 * @param {any} work
 */
export function normalizeCrossrefItem(work) {
  if (!work || typeof work !== 'object') return null;
  const authors = Array.isArray(work.author)
    ? work.author
        .slice(0, 6)
        .map((author) => [author.family, author.given].filter(Boolean).join(', '))
        .filter(Boolean)
        .join('; ')
    : '';
  const year = work.issued?.['date-parts']?.[0]?.[0];
  const doi = typeof work.DOI === 'string' ? work.DOI : '';
  const abstract = typeof work.abstract === 'string' ? decodeEntities(work.abstract.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
  return {
    id: doi || work.URL || '',
    title: decodeEntities(Array.isArray(work.title) ? work.title[0] ?? '' : String(work.title ?? '')),
    authors: decodeEntities(authors),
    year: Number.isInteger(year) ? year : null,
    date: year ? String(year) : '',
    venue: decodeEntities(Array.isArray(work['container-title']) ? work['container-title'][0] ?? '' : (work.publisher ?? '')),
    doi,
    url: work.URL || (doi ? `https://doi.org/${doi}` : ''),
    citedByCount: Number(work['is-referenced-by-count']) || 0,
    source: 'crossref',
    abstract: abstract.slice(0, 700),
  };
}

async function cacheKey(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `research:papers:${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/**
 * Build the OpenAlex search URL. With OPENALEX_API_KEY the key travels as the
 * `api_key` query parameter (the only form OpenAlex documents); without it the
 * request runs on the anonymous daily budget. Pure + exported for tests.
 *
 * @param {{ query: string, from: string, to: string, limit: number, mailto: string, apiKey?: string }} params
 */
export function buildOpenAlexUrl({ query, from, to, limit, mailto, apiKey }) {
  // title_and_abstract.search requires ALL terms (AND semantics) and the
  // relevance score keeps the results on-topic.
  let target = `https://api.openalex.org/works?filter=title_and_abstract.search:${encodeURIComponent(query)},from_publication_date:${from},to_publication_date:${to}&sort=relevance_score:desc&per-page=${limit}&mailto=${encodeURIComponent(mailto)}`;
  if (apiKey) target += `&api_key=${encodeURIComponent(apiKey)}`;
  return target;
}

/**
 * Order of the providers. OpenAlex goes first only with an API key: the
 * anonymous budget is small and the shared VPS IP was throttled (HTTP 429),
 * while Crossref is always reachable. Pure + exported for tests.
 *
 * @param {string | undefined} apiKey
 * @returns {Array<'openalex' | 'crossref'>}
 */
export function providerOrder(apiKey) {
  return apiKey ? ['openalex', 'crossref'] : ['crossref', 'openalex'];
}

/**
 * GET /api/research/papers?q=<keywords>&days=180&limit=12
 * Search for recent scholarly works (OpenAlex with OPENALEX_API_KEY, Crossref
 * otherwise or as fallback), cached 6h.
 *
 * WIP: this is the backend of the "Novità accademiche" tab. It returns titles
 * and metadata only; adding an item to Zotero goes through /api/zotero/items.
 */
export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, OPTIONS');
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length < 3) return json({ error: 'Provide a q with at least 3 characters' }, 400);
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 180, 7), 3650);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 12, 1), MAX_LIMIT);
  const from = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const key = await cacheKey(`${CACHE_VERSION}|${query}|${from}|${limit}`);
  try {
    const cached = await redisGetJson(key);
    if (cached) return json({ ...cached, cached: true });
  } catch {
    // cache miss path
  }

  const mailto = process.env.CROSSREF_MAILTO || 'research@risksentinel.opencyber.org';
  const userAgent = `RiskSentinelResearch/1.0 (mailto:${mailto})`;

  const apiKey = (process.env.OPENALEX_API_KEY ?? '').trim();
  const today = new Date().toISOString().slice(0, 10);

  async function searchCrossref() {
    // Relevance-sorted (no sort/order override) and bounded to the window;
    // date-sorting would return newest-but-irrelevant works.
    const target = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&filter=from-pub-date:${from},until-pub-date:${today}&rows=${limit}&select=DOI,title,author,issued,container-title,publisher,type,URL,abstract,is-referenced-by-count&mailto=${encodeURIComponent(mailto)}`;
    const res = await fetch(target, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Crossref HTTP ${res.status}`);
    const payload = await res.json();
    return Array.isArray(payload?.message?.items)
      ? payload.message.items.map(normalizeCrossrefItem).filter((entry) => entry && entry.title)
      : [];
  }

  async function searchOpenAlex() {
    const target = buildOpenAlexUrl({ query, from, to: today, limit, mailto, apiKey });
    const res = await fetch(target, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(20_000),
    });
    // Never echo the URL: it carries the API key.
    if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
    const payload = await res.json();
    return Array.isArray(payload?.results)
      ? payload.results.map(normalizeOpenAlexWork).filter((entry) => entry && entry.title)
      : [];
  }

  let items = [];
  let provider = '';
  const errors = [];
  for (const name of providerOrder(apiKey)) {
    try {
      items = name === 'openalex' ? await searchOpenAlex() : await searchCrossref();
    } catch (error) {
      const message = error instanceof Error ? error.message : `${name} unreachable`;
      errors.push(apiKey ? message.split(apiKey).join('***') : message);
      items = [];
    }
    if (items.length > 0) {
      provider = name;
      break;
    }
  }
  const providerError = errors.join('; ');

  const body = items.length > 0 ? { query, from, provider, items, fetchedAt: new Date().toISOString() } : { query, from, items: [], error: providerError || 'No results', fetchedAt: new Date().toISOString() };
  try {
    await redisSetJson(key, body, CACHE_TTL_SECONDS);
  } catch {
    // best effort
  }
  return json(body);
}
