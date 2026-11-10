// Measured seismic triggers for the thesis trigger layer: earthquakes of the
// last 30 days from the EMSC catalogue (European reference for real time),
// with the USGS catalogue as fallback. Normalised, not scored; the client
// matches them to the critical nodes (src/services/thesis/risk-chain.ts).
//
// Served from Redis (thesis:triggers:v1, written hourly by
// scripts/seed-thesis-triggers.mjs in the `thesis` cron tier), so the first
// visitor after a deploy no longer waits for EMSC (up to 15 s) and then USGS.
// The live fetch is kept as fallback when the key is missing or too old.
import { jsonResponse } from '../_json-response.js';
import { readJsonFromUpstashWithStatus } from '../_upstash-json.js';
import { TRIGGERS_REDIS_KEY, TRIGGER_MIN_MAG, TRIGGER_WINDOW_DAYS, fetchSeismicTriggers } from './_catalogue.js';

export const config = { runtime: 'edge' };

const TTL_MS = 10 * 60_000;
// The seeder runs hourly: older than this means the cron missed two runs.
const REDIS_MAX_AGE_MS = 3 * 60 * 60_000;

let cache = null;

function isUsable(payload, now) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.quakes) || !payload.source) return false;
  const at = Date.parse(payload.generatedAt || '');
  return Number.isFinite(at) && now - at <= REDIS_MAX_AGE_MS;
}

export default async function handler() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return jsonResponse(cache.payload, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  const stored = await readJsonFromUpstashWithStatus(TRIGGERS_REDIS_KEY);
  if (stored.status === 'hit' && isUsable(stored.value, now)) {
    const payload = { ...stored.value, servedFrom: 'redis' };
    cache = { at: now, payload };
    return jsonResponse(payload, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  const live = await fetchSeismicTriggers({ nowMs: now });
  if (!live.source) {
    if (cache) return jsonResponse({ ...cache.payload, stale: true, status: live.status }, 200, { 'Cache-Control': 'no-store' });
    return jsonResponse({ quakes: [], source: null, status: live.status, windowDays: TRIGGER_WINDOW_DAYS, minMagnitude: TRIGGER_MIN_MAG }, 502, { 'Cache-Control': 'no-store' });
  }
  const payload = { ...live, servedFrom: 'live' };
  cache = { at: now, payload };
  return jsonResponse(payload, 200, { 'Cache-Control': 'public, max-age=300' });
}
