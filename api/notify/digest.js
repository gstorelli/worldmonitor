/**
 * Risk Sentinel — intelligence digest endpoint (fork-native notifications).
 *
 * GET /api/notify/digest?topics=chokepoints,conflicts&limit=5
 *   → { digest: { sections: [{ topic, title, items: [{ title, summary,
 *        url, severity, score, source }] }], fetchedAt }
 *
 * Aggregates the dedicated n8n keys (risk_sentinel:n8n:*) plus the policy
 * monitor (policy:monitor:v1) into a delivery-ready digest. The n8n
 * workflow "07-intelligence-notifications" consumes this endpoint to
 * compose Telegram/email messages according to notify:config:v1.
 */

import { getPublicCorsHeaders } from '../_cors.js';

const TOPIC_SOURCES = {
  chokepoints: ['risk_sentinel:n8n:acled', 'risk_sentinel:n8n:usgs'],
  conflicts: ['risk_sentinel:n8n:acled'],
  commodities: ['risk_sentinel:n8n:commodities', 'risk_sentinel:n8n:gdelt'],
  climate: ['risk_sentinel:n8n:openmeteo'],
  seismic: ['risk_sentinel:n8n:usgs'],
  policy: ['policy:monitor:v1'],
};

const TOPIC_LABELS = {
  chokepoints: 'Chokepoints & Trade Routes',
  conflicts: 'Conflict Events',
  commodities: 'Commodities & Customs',
  climate: 'Climate Anomalies',
  seismic: 'Seismic Activity',
  policy: 'Policy Monitor (EU)',
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

async function redisGet(url, token, key) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
    signal: AbortSignal.timeout(3_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const rawValue = data?.result ?? null;
  if (rawValue === null) return null;
  if (typeof rawValue !== 'string') return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function severityRank(item) {
  const sev = String(item.severity || item.riskLevel || item.alertLevel || '').toLowerCase();
  if (sev.includes('critical') || sev.includes('extreme')) return 4;
  if (sev.includes('high') || sev.includes('elevated')) return 3;
  if (sev.includes('moderate')) return 2;
  if (sev.includes('low') || sev.includes('normal')) return 1;
  return 0;
}

function scoreOf(item) {
  const n = Number(item.tradeImpactScore ?? item.severityScore ?? item.riskScore ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDigestItem(source, item) {
  const severity = String(item.severity || item.riskLevel || item.alertLevel || 'moderate');
  const url = item.url || item.sourceUrl || '';
  return {
    title: String(item.title || item.place || item.zone || item.symbol || item.name || 'Signal'),
    summary: String(item.summary || item.matchedRoute || item.nearChokepoint || item.country || ''),
    url,
    severity,
    score: scoreOf(item),
    source,
  };
}

function sectionFor(topic, items) {
  return { topic, title: TOPIC_LABELS[topic] || topic, items };
}

export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, OPTIONS');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const restUrl = process.env.UPSTASH_REDIS_REST_URL || '';
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!restUrl || !restToken) {
    return json({ error: 'Redis not configured' }, 500);
  }

  const url = new URL(request.url);
  const requestedTopics = (url.searchParams.get('topics') || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && Object.prototype.hasOwnProperty.call(TOPIC_SOURCES, t));
  const topics = requestedTopics.length > 0 ? requestedTopics : Object.keys(TOPIC_SOURCES);

  const rawLimit = Number(url.searchParams.get('limit') || DEFAULT_LIMIT);
  const limit = Math.min(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, MAX_LIMIT);

  const sections = [];
  for (const topic of topics) {
    const keys = TOPIC_SOURCES[topic];
    const items = [];
    for (const key of keys) {
      const raw = await redisGet(restUrl, restToken, key).catch(() => null);
      if (raw == null) continue;
      const list = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
      for (const item of list.slice(0, limit * 2)) {
        if (item && typeof item === 'object') items.push(toDigestItem(key.split(':').pop(), item));
      }
    }
    items.sort((a, b) => severityRank(b) - severityRank(a) || b.score - a.score);
    sections.push(sectionFor(topic, items.slice(0, limit)));
  }

  return json({
    digest: { sections: sections.filter((s) => s.items.length > 0) },
    fetchedAt: new Date().toISOString(),
  });
}
