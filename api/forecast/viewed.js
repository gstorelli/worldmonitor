// POST /api/forecast/viewed — the Forecast panel was opened. Keeps the hourly
// forecast seeder active for 24 hours (scripts/_forecast-viewer-gate.mjs);
// without views it skips its LLM calls. Behind the session gate like every
// /api route; the body is ignored.
import { jsonResponse } from '../_json-response.js';
import { setCachedData } from '../_upstash-json.js';

export const config = { runtime: 'edge' };

const FORECAST_VIEWED_KEY = 'forecast:viewed:v1';
const TTL_SECONDS = 24 * 60 * 60;

export default async function handler(request) {
  if (request.method !== 'POST') return jsonResponse({ error: 'POST required' }, 405);
  const at = new Date().toISOString();
  const ok = await setCachedData(FORECAST_VIEWED_KEY, { at }, TTL_SECONDS).catch(() => false);
  return jsonResponse({ ok: Boolean(ok), at }, ok ? 200 : 503, { 'Cache-Control': 'no-store' });
}
