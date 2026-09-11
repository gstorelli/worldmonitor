import { getPublicCorsHeaders } from '../_cors.js';
import { redisGetJson, redisSetJson } from '../_redis.js';

export const config = { runtime: 'edge' };

const CACHE_TTL_SECONDS = 6 * 3600;
const MAX_LIMIT = 25;

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
 * GET /api/research/papers?q=<keywords>&days=180&limit=12
 * OpenAlex search for recent scholarly works (no API key), cached 6h.
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

  const key = await cacheKey(`${query}|${from}|${limit}`);
  try {
    const cached = await redisGetJson(key);
    if (cached) return json({ ...cached, cached: true });
  } catch {
    // cache miss path
  }

  const mailto = process.env.CROSSREF_MAILTO || 'research@risksentinel.opencyber.org';
  const userAgent = `RiskSentinelResearch/1.0 (mailto:${mailto})`;

  // Crossref is the primary source: it is reliably reachable from the VPS,
  // while OpenAlex throttles shared datacenter IPs (HTTP 429). OpenAlex is the
  // fallback when Crossref returns nothing.
  let items = [];
  let providerError = '';
  const today = new Date().toISOString().slice(0, 10);
  try {
    // Relevance-sorted (no sort/order override) and bounded to the window;
    // date-sorting would return newest-but-irrelevant works.
    const target = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&filter=from-pub-date:${from},until-pub-date:${today}&rows=${limit}&select=DOI,title,author,issued,container-title,publisher,type,URL,abstract,is-referenced-by-count&mailto=${encodeURIComponent(mailto)}`;
    const res = await fetch(target, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const payload = await res.json();
      items = Array.isArray(payload?.message?.items)
        ? payload.message.items.map(normalizeCrossrefItem).filter((entry) => entry && entry.title)
        : [];
    } else {
      providerError = `Crossref HTTP ${res.status}`;
    }
  } catch (error) {
    providerError = error instanceof Error ? error.message : 'Crossref unreachable';
  }

  if (items.length === 0) {
    try {
      // title_and_abstract.search requires ALL terms (AND semantics) and the
      // relevance score keeps the results on-topic.
      const target = `https://api.openalex.org/works?filter=title_and_abstract.search:${encodeURIComponent(query)},from_publication_date:${from},to_publication_date:${today}&sort=relevance_score:desc&per-page=${limit}&mailto=${encodeURIComponent(mailto)}`;
      const res = await fetch(target, {
        headers: { Accept: 'application/json', 'User-Agent': userAgent },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const payload = await res.json();
        items = Array.isArray(payload?.results)
          ? payload.results.map(normalizeOpenAlexWork).filter((entry) => entry && entry.title)
          : [];
        if (items.length > 0) providerError = '';
      } else if (!providerError) {
        providerError = `OpenAlex HTTP ${res.status}`;
      }
    } catch (error) {
      if (!providerError) providerError = error instanceof Error ? error.message : 'OpenAlex unreachable';
    }
  }

  const body = items.length > 0 ? { query, from, items, fetchedAt: new Date().toISOString() } : { query, from, items: [], error: providerError || 'No results', fetchedAt: new Date().toISOString() };
  try {
    await redisSetJson(key, body, CACHE_TTL_SECONDS);
  } catch {
    // best effort
  }
  return json(body);
}
