/**
 * Risk Sentinel — n8n Ingestion Endpoint
 *
 * Receives scored and processed data from n8n workflows and writes
 * it to Redis (Upstash) for consumption by the frontend panels.
 *
 * POST /api/n8n-ingest
 * Body: { source: string, pipeline: string, ...data }
 *
 * Supported pipelines:
 *   - customs-intelligence (GDELT scored articles)
 *   - seismic-trade-impact (USGS earthquakes)
 *   - climate-trade-anomalies (Open-Meteo anomalies)
 *   - commodity-customs-tracker (Yahoo Finance commodity prices)
 *   - conflict-trade-impact (ACLED conflict events)
 */

import { getPublicCorsHeaders } from './_cors.js';

// ─── Redis helpers (inline for Edge Function isolation) ───

async function redisSet(url, token, key, value, ttlSeconds) {
  const payload = JSON.stringify(value);
  const cmd = ttlSeconds
    ? ['SET', key, payload, 'EX', ttlSeconds]
    : ['SET', key, payload];
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Redis SET failed: HTTP ${resp.status}`);
  return resp.json();
}

async function redisSeedMeta(url, token, domain, resource, count) {
  const metaKey = `seed-meta:${domain}:${resource}`;
  const meta = { fetchedAt: Date.now(), recordCount: count, sourceVersion: 'n8n' };
  await redisSet(url, token, metaKey, meta, 86400 * 7);
}

// ─── Pipeline → Redis key mapping ───

const PIPELINE_CONFIG = {
  'customs-intelligence': {
    redisKey: 'intelligence:gdelt-intel:v1',
    ttl: 86400,        // 24h
    domain: 'intelligence',
    resource: 'gdelt-intel',
    transform: (data) => ({
      topics: [{
        id: 'customs',
        articles: (data.alerts || data.scoredArticles || []).map(a => ({
          title: a.title || '',
          url: a.url || '',
          source: a.domain || a.source || '',
          date: a.seendate || a.date || '',
          image: a.socialimage || a.image || '',
          language: a.language || 'English',
          tone: a.tone || 0,
          riskScore: a.riskScore,
          riskLevel: a.riskLevel,
          dimensions: a.dimensions,
          matchedRoute: a.matchedRoute,
          matchedCommodity: a.matchedCommodity,
        })),
        fetchedAt: data.processedAt || new Date().toISOString(),
      }],
      fetchedAt: data.processedAt || new Date().toISOString(),
    }),
    count: (data) => (data.alerts || data.scoredArticles || []).length,
  },

  'seismic-trade-impact': {
    redisKey: 'seismology:earthquakes:v1',
    ttl: 21600,         // 6h
    domain: 'seismology',
    resource: 'earthquakes',
    transform: (data) => ({
      earthquakes: (data.earthquakes || []).map(e => ({
        id: e.id || '',
        place: e.place || '',
        magnitude: e.magnitude || 0,
        depthKm: e.depthKm || 0,
        location: e.location || { latitude: 0, longitude: 0 },
        occurredAt: e.occurredAt || 0,
        sourceUrl: e.sourceUrl || '',
        nearTradeRoute: e.nearTradeRoute,
        tradeImpactScore: e.tradeImpactScore,
        nearTestSite: e.nearTestSite,
        testSiteName: e.testSiteName,
      })),
    }),
    count: (data) => (data.earthquakes || []).length,
  },

  'climate-trade-anomalies': {
    redisKey: 'climate:anomalies:v2',
    ttl: 10800,         // 3h
    domain: 'climate',
    resource: 'anomalies',
    transform: (data) => ({
      anomalies: (data.anomalies || []).map(a => ({
        zone: a.zone || '',
        location: a.location || { latitude: 0, longitude: 0 },
        tempDelta: a.tempDelta || 0,
        precipDelta: a.precipDelta || 0,
        severity: a.severity === 'Extreme' ? 'ANOMALY_SEVERITY_EXTREME'
                : a.severity === 'Moderate' ? 'ANOMALY_SEVERITY_MODERATE'
                : 'ANOMALY_SEVERITY_NORMAL',
        type: a.type ? `ANOMALY_TYPE_${a.type.toUpperCase()}` : 'ANOMALY_TYPE_STABLE',
        period: a.period || '',
        tradeRelevance: a.tradeRelevance,
        tradeImpact: a.tradeImpact,
      })),
      pagination: undefined,
    }),
    count: (data) => (data.anomalies || []).length,
  },

  'commodity-customs-tracker': {
    redisKey: 'market:commodities-bootstrap:v1',
    ttl: 1800,          // 30min
    domain: 'market',
    resource: 'commodities',
    transform: (data) => ({
      quotes: (data.quotes || []).map(q => ({
        symbol: q.symbol || '',
        name: q.name || q.symbol || '',
        display: q.name || q.symbol || '',
        price: q.price || 0,
        change: q.change || 0,
        sparkline: q.sparkline || [],
        hsCode: q.hsCode,
        category: q.category,
        sensitivity: q.sensitivity,
        alertLevel: q.alertLevel,
        volatility: q.volatility,
      })),
    }),
    count: (data) => (data.quotes || []).length,
  },

  'conflict-trade-impact': {
    redisKey: 'conflict:acled:v1:all:0:0',
    ttl: 900,           // 15min
    domain: 'conflict',
    resource: 'acled-intel',
    transform: (data) => ({
      events: (data.events || []).map(e => ({
        id: e.id || '',
        eventType: e.eventType || '',
        country: e.country || '',
        location: e.location || { latitude: 0, longitude: 0 },
        occurredAt: e.occurredAt || 0,
        fatalities: e.fatalities || 0,
        actors: e.actors || [],
        source: e.source || '',
        admin1: e.admin1 || '',
        nearChokepoint: e.nearChokepoint,
        chokepointDistanceKm: e.chokepointDistanceKm,
        severityScore: e.severityScore,
      })),
      pagination: undefined,
    }),
    count: (data) => (data.events || []).length,
  },
};

// ─── Handler ───

export default async function handler(req) {
  const cors = getPublicCorsHeaders('POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Auth: simple shared secret (set N8N_INGEST_SECRET in env)
  const secret = process.env.N8N_INGEST_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (token !== secret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return new Response(JSON.stringify({ error: 'Redis not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const pipeline = body.pipeline;
  const config = PIPELINE_CONFIG[pipeline];

  if (!config) {
    return new Response(JSON.stringify({
      error: `Unknown pipeline: ${pipeline}`,
      supported: Object.keys(PIPELINE_CONFIG),
    }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const transformed = config.transform(body);
    const recordCount = config.count(body);

    await redisSet(redisUrl, redisToken, config.redisKey, transformed, config.ttl);
    await redisSeedMeta(redisUrl, redisToken, config.domain, config.resource, recordCount);

    return new Response(JSON.stringify({
      ok: true,
      pipeline,
      redisKey: config.redisKey,
      recordCount,
      ttl: config.ttl,
      processedAt: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Redis write failed',
      message: err.message || String(err),
    }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}

export const config = {
  runtime: 'edge',
};
