// Measured seismic triggers for the thesis trigger layer: earthquakes of the
// last 30 days from the EMSC catalogue (European reference for real time),
// with the USGS catalogue as fallback. Normalised, not scored; the client
// matches them to the critical nodes (src/services/thesis/risk-chain.ts).
import { jsonResponse } from '../_json-response.js';
import { emscQueryUrl, parseEmsc, parseUsgs, usgsQueryUrl } from './_catalogue.js';

export const config = { runtime: 'edge' };

const WINDOW_DAYS = 30;
const MIN_MAG = 4.5;
const TTL_MS = 10 * 60_000;
const UA = 'RiskSentinel/1.0 (+https://risksentinel.opencyber.org; PhD research, UniBA)';

let cache = null;

async function getJson(url) {
  const res = await globalThis.fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204) return { features: [] };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default async function handler() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return jsonResponse(cache.payload, 200, { 'Cache-Control': 'public, max-age=300' });
  }
  const status = {};
  let quakes = [];
  let source = null;
  try {
    quakes = parseEmsc(await getJson(emscQueryUrl(now, WINDOW_DAYS, MIN_MAG)));
    status.emsc = 'ok';
    source = 'EMSC';
  } catch (err) {
    status.emsc = `error: ${err.message}`;
  }
  if (!source) {
    try {
      quakes = parseUsgs(await getJson(usgsQueryUrl(now, WINDOW_DAYS, MIN_MAG)));
      status.usgs = 'ok';
      source = 'USGS';
    } catch (err) {
      status.usgs = `error: ${err.message}`;
    }
  }
  if (!source) {
    if (cache) return jsonResponse({ ...cache.payload, stale: true, status }, 200, { 'Cache-Control': 'no-store' });
    return jsonResponse({ quakes: [], source: null, status, windowDays: WINDOW_DAYS, minMagnitude: MIN_MAG }, 502, { 'Cache-Control': 'no-store' });
  }
  const payload = { generatedAt: new Date(now).toISOString(), windowDays: WINDOW_DAYS, minMagnitude: MIN_MAG, source, status, quakes };
  cache = { at: now, payload };
  return jsonResponse(payload, 200, { 'Cache-Control': 'public, max-age=300' });
}
