/**
 * Risk Sentinel — Source Validation (PhD literature) endpoint.
 *
 * GET /api/zotero/library
 *   → { sources: <curated 18-entry bibliography from data/zotero-sources.json>,
 *       library: <live Zotero library cache>, librarySource: 'zotero'|'none' }
 *
 * The curated `sources` array is the doctoral literature review with the
 * per-source limit/bias assessment; the live `library` comes from the Zotero
 * Web API v3 (https://api.zotero.org/users/<ZOTERO_USER_ID>/items) and is
 * cached in Redis for 24h. `?refresh=1` forces a refetch.
 */

import { getPublicCorsHeaders } from '../_cors.js';
import { readFileSync } from 'node:fs';

const ZOTERO_CACHE_KEY = 'zotero:library:v1';
const ZOTERO_CACHE_TTL = 86400;

async function redisGet(url, token, key) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.result ?? null;
}

async function redisSet(url, token, key, value, ttlSeconds) {
  const cmd = ttlSeconds ? ['SET', key, JSON.stringify(value), 'EX', ttlSeconds] : ['SET', key, JSON.stringify(value)];
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Redis SET failed: HTTP ${resp.status}`);
  return resp.json();
}

function readCuratedSources() {
  try {
    const raw = readFileSync(new URL('../../data/zotero-sources.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.sources) ? parsed.sources : [];
  } catch {
    return [];
  }
}

async function resolveZoteroUserId(userId, apiKey) {
  if (/^\d+$/.test(userId)) return userId;
  // Non-numeric (username): resolve the numeric userID via the key endpoint.
  const resp = await fetch(`https://api.zotero.org/keys/${encodeURIComponent(apiKey)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Zotero key resolution HTTP ${resp.status}`);
  const data = await resp.json();
  return data?.userID ? String(data.userID) : null;
}

async function fetchZoteroLibrary(userId, apiKey) {
  const numericId = await resolveZoteroUserId(userId, apiKey);
  if (!numericId) throw new Error('Zotero userID could not be resolved');
  const url = `https://api.zotero.org/users/${numericId}/items?format=json&limit=100&sort=dateAdded&direction=desc`;
  const resp = await fetch(url, {
    headers: { 'Zotero-API-Key': apiKey, 'Zotero-API-Version': '3' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`Zotero API HTTP ${resp.status}`);
  return resp.json();
}

export default async function handler(request, context = {}) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';

  const corsHeaders = getPublicCorsHeaders('GET, OPTIONS');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const restUrl = process.env.UPSTASH_REDIS_REST_URL || '';
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
  const userId = process.env.ZOTERO_USER_ID || '';
  const apiKey = process.env.ZOTERO_API_KEY || '';

  let library = null;
  let librarySource = 'none';
  if (restUrl && restToken && !refresh) {
    const cached = await redisGet(restUrl, restToken, ZOTERO_CACHE_KEY);
    if (cached) {
      library = cached;
      librarySource = 'zotero';
    }
  }
  if (!library && userId && apiKey) {
    try {
      library = await fetchZoteroLibrary(userId, apiKey);
      librarySource = 'zotero';
      if (restUrl && restToken) {
        await redisSet(restUrl, restToken, ZOTERO_CACHE_KEY, library, ZOTERO_CACHE_TTL).catch(() => {});
      }
    } catch (err) {
      context.logger?.warn?.(`[zotero] library fetch failed: ${err.message}`);
    }
  }

  const sources = readCuratedSources();

  const body = {
    sources,
    library,
    librarySource,
    zoteroConfigured: Boolean(userId && apiKey),
    userId: userId || '',
    fetchedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
