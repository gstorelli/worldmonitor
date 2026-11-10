/**
 * Risk Sentinel — Policy Analysis registry endpoint.
 *
 * GET /api/policy/registry
 *   → { entries: <curated open normative registry (data/policy-registry.json)>,
 *       monitor: <latest policy-monitor items from n8n (policy:monitor:v1) or []> }
 *
 * The registry is a curated static dataset of EU/Italian open normative
 * sources mapped to the doctoral risk categories; the `monitor` array is fed
 * by the n8n "policy-monitor" pipeline through POST /api/n8n/ingest.
 */

import { getPublicCorsHeaders } from '../_cors.js';
import { unwrapEnvelope } from '../_seed-envelope.js';
import registryEntries from './_registry-data.js';

const MONITOR_KEY = 'policy:monitor:v1';
// Recent EU acts for the thesis goods / trade defence, written every 6h by
// scripts/seed-policy-eu-acts.mjs (Publications Office SPARQL).
const EU_ACTS_KEY = 'policy:eu-acts:v1';

async function redisGet(url, token, key) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
    signal: AbortSignal.timeout(10_000),
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

export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, OPTIONS');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const entries = Array.isArray(registryEntries) ? registryEntries : [];

  let monitor = [];
  let acts = null;
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || '';
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (restUrl && restToken) {
    const cached = await redisGet(restUrl, restToken, MONITOR_KEY).catch(() => null);
    if (cached && typeof cached === 'object') {
      monitor = Array.isArray(cached.items) ? cached.items : [];
    }
    const euActs = unwrapEnvelope(await redisGet(restUrl, restToken, EU_ACTS_KEY).catch(() => null)).data;
    if (euActs && typeof euActs === 'object' && Array.isArray(euActs.acts)) {
      acts = { since: euActs.since ?? null, windowDays: euActs.windowDays ?? null, scanned: euActs.scanned ?? null, items: euActs.acts };
    }
  }

  return new Response(
    JSON.stringify({ entries, monitor, acts, fetchedAt: new Date().toISOString() }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
