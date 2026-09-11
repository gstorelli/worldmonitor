import { getPublicCorsHeaders } from '../_cors.js';
import { redisGetJson, redisSetJson } from '../_redis.js';

export const config = { runtime: 'edge' };

const CACHE_TTL_SECONDS = 7 * 24 * 3600;

/**
 * Normalize a Crossref `/works/{doi}` payload into the fields the bibliography
 * uses. Pure + exported for tests.
 *
 * @param {any} work
 */
export function normalizeCrossrefWork(work) {
  if (!work || typeof work !== 'object') return { found: false };
  const authors = Array.isArray(work.author)
    ? work.author
        .map((author) => [author.family, author.given].filter(Boolean).join(', '))
        .filter(Boolean)
        .join('; ')
    : '';
  const year = work.issued?.['date-parts']?.[0]?.[0];
  const doi = typeof work.DOI === 'string' ? work.DOI : '';
  return {
    found: true,
    doi,
    title: Array.isArray(work.title) ? work.title[0] ?? '' : String(work.title ?? ''),
    authors,
    year: Number.isInteger(year) ? year : null,
    venue: Array.isArray(work['container-title']) ? work['container-title'][0] ?? '' : (work.publisher ?? ''),
    url: work.URL || (doi ? `https://doi.org/${doi}` : ''),
    type: work.type ?? '',
  };
}

async function cacheKey(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `research:doi:${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/**
 * GET /api/research/doi?doi=... | ?title=...
 * Crossref metadata lookup (no API key). Cached in Redis for a week.
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
  const rawDoi = (url.searchParams.get('doi') ?? '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  const title = (url.searchParams.get('title') ?? '').trim();
  if (!rawDoi && !title) return json({ error: 'Provide a doi or a title' }, 400);

  const lookup = rawDoi ? `doi:${rawDoi.toLowerCase()}` : `title:${title.toLowerCase()}`;
  const key = await cacheKey(lookup);
  try {
    const cached = await redisGetJson(key);
    if (cached) return json({ ...cached, cached: true });
  } catch {
    // cache miss path is fine
  }

  const mailto = process.env.CROSSREF_MAILTO || 'research@risksentinel.opencyber.org';
  const target = rawDoi
    ? `https://api.crossref.org/works/${encodeURIComponent(rawDoi)}`
    : `https://api.crossref.org/works?rows=1&select=DOI,title,author,issued,container-title,publisher,type,URL&query.bibliographic=${encodeURIComponent(title)}`;

  let payload;
  try {
    const res = await fetch(target, {
      headers: { Accept: 'application/json', 'User-Agent': `RiskSentinelResearch/1.0 (mailto:${mailto})` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return json({ found: false, error: `Crossref HTTP ${res.status}` }, 502);
    payload = await res.json();
  } catch (error) {
    return json({ found: false, error: error instanceof Error ? error.message : 'Crossref unreachable' }, 502);
  }

  const work = rawDoi ? payload?.message : payload?.message?.items?.[0];
  const normalized = normalizeCrossrefWork(work);
  if (normalized.found) {
    try {
      await redisSetJson(key, normalized, CACHE_TTL_SECONDS);
    } catch {
      // caching is best-effort
    }
  }
  return json(normalized);
}
