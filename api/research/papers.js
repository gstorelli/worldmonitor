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
  const target = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=from_publication_date:${from}&sort=publication_date:desc&per-page=${limit}&mailto=${encodeURIComponent(mailto)}`;

  let payload;
  try {
    const res = await fetch(target, {
      headers: { Accept: 'application/json', 'User-Agent': `RiskSentinelResearch/1.0 (mailto:${mailto})` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return json({ items: [], error: `OpenAlex HTTP ${res.status}` }, 502);
    payload = await res.json();
  } catch (error) {
    return json({ items: [], error: error instanceof Error ? error.message : 'OpenAlex unreachable' }, 502);
  }

  const items = Array.isArray(payload?.results)
    ? payload.results.map(normalizeOpenAlexWork).filter((entry) => entry && entry.title)
    : [];
  const body = { query, from, items, fetchedAt: new Date().toISOString() };
  try {
    await redisSetJson(key, body, CACHE_TTL_SECONDS);
  } catch {
    // best effort
  }
  return json(body);
}
