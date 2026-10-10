#!/usr/bin/env node
/**
 * Risk Sentinel — ACLED conflict events with customs/trade impact scoring.
 *
 * Replaces the n8n pair (ACLED Token Manager + ACLED Conflict ingestion) for the
 * self-hosted deploy. That pair kept the feed empty: the Token Manager draft was
 * never published, and ACLED moved to OAuth2 password grant with 24h tokens that
 * a two-workflow dance handles badly. Here a fresh token is minted on every run,
 * the last 30 days of conflict events are scored for customs impact (fatalities
 * + trade-chokepoint proximity) and the result is written to the same
 * `risk_sentinel:n8n:acled` key the n8n ingest used, so the digest, the OSINT
 * workspace and api/customs/acled.js keep working unchanged.
 *
 * Credentials come from the environment and are never committed:
 *   ACLED_EMAIL (or ACLED_USERNAME), ACLED_PASSWORD   — required
 *   ACLED_BASE_URL (default https://acleddata.com)
 *
 * ACLED access levels: an "Open" myACLED account can log in but the data
 * endpoint answers 403 {"message":"Access denied"}. API access requires the
 * Research/Partner tier — granted to institutional (university) registrations,
 * or on request to access@acleddata.com. This seeder fails with that exact
 * guidance instead of an opaque HTTP error.
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  loadEnvFile,
  getRedisCredentials,
  redisCommand,
  maskToken,
  writeFreshnessMetadataSafely,
} from './_seed-utils.mjs';

export const REDIS_KEY = 'risk_sentinel:n8n:acled';
const KEY_TTL_SECONDS = 6 * 60 * 60;
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const EVENT_TYPES = 'Battles|Explosions/Remote violence|Violence against civilians|Riots|Strategic developments';
const LOOKBACK_DAYS = 30;
export const MAX_EVENTS = 400;
const TOKEN_TIMEOUT_MS = 30_000;
const FETCH_TIMEOUT_MS = 60_000;
const ACCESS_HINT = 'ACLED data access requires the Research/Partner tier: register with an institutional email or write to access@acleddata.com; an "Open" myACLED account can log in but the data endpoint stays 403.';

/** Same chokepoint set the n8n workflow used, so severity stays comparable. */
export const TRADE_CHOKEPOINTS = [
  { name: 'Red Sea / Bab el-Mandeb', lat: 12.60, lon: 43.33, radiusKm: 500 },
  { name: 'Strait of Hormuz', lat: 26.57, lon: 56.25, radiusKm: 400 },
  { name: 'Suez Canal', lat: 30.45, lon: 32.35, radiusKm: 300 },
  { name: 'Gulf of Aden', lat: 12.78, lon: 45.02, radiusKm: 400 },
  { name: 'Eastern Mediterranean', lat: 34.00, lon: 34.00, radiusKm: 500 },
  { name: 'Black Sea', lat: 43.50, lon: 34.00, radiusKm: 500 },
  { name: 'Gulf of Guinea', lat: 3.00, lon: 3.00, radiusKm: 500 },
  { name: 'Malacca Strait', lat: 2.50, lon: 101.50, radiusKm: 300 },
];

export class AcledAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AcledAccessError';
  }
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function severityFor(score) {
  if (score >= 90) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

/**
 * ACLED raw rows → flat alert array (the shape api/customs/acled.js, the
 * notification digest and the OSINT workspace already consume). Pure and
 * exported so tests lock the chokepoint/severity rules.
 */
export function processEvents(rawEvents, chokepoints = TRADE_CHOKEPOINTS, maxEvents = MAX_EVENTS) {
  const alerts = (Array.isArray(rawEvents) ? rawEvents : [])
    .filter((e) => {
      const lat = parseFloat(e?.latitude ?? '');
      const lon = parseFloat(e?.longitude ?? '');
      return Number.isFinite(lat) && Number.isFinite(lon)
        && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    })
    .map((e) => {
      const lat = parseFloat(e.latitude);
      const lon = parseFloat(e.longitude);
      const fatalities = parseInt(e.fatalities ?? '0', 10) || 0;

      let nearChokepoint = null;
      let chokepointDistanceKm = Infinity;
      for (const cp of chokepoints) {
        const km = haversineKm(lat, lon, cp.lat, cp.lon);
        if (km < cp.radiusKm && km < chokepointDistanceKm) {
          nearChokepoint = cp.name;
          chokepointDistanceKm = km;
        }
      }

      let severityScore = 20;
      if (fatalities >= 50) severityScore = 100;
      else if (fatalities >= 10) severityScore = 75;
      else if (fatalities >= 1) severityScore = 50;
      if (nearChokepoint) severityScore = Math.min(100, severityScore + 25);

      const actors = [e.actor1, e.actor2].filter(Boolean);
      const occurredAt = Number.isFinite(Date.parse(e.event_date || '')) ? Date.parse(e.event_date) : Date.now();
      return {
        id: `acled-${e.event_id_cnty || `${lat},${lon}`}`,
        title: `${e.event_type || 'Event'} — ${e.country || ''}`.trim(),
        summary: [
          fatalities > 0 ? `${fatalities} fatalities` : null,
          nearChokepoint ? `near ${nearChokepoint}` : null,
          actors.length > 0 ? actors.join(' vs ') : null,
        ].filter(Boolean).join(' · '),
        severity: severityFor(severityScore),
        eventType: e.event_type || '',
        subEventType: e.sub_event_type || '',
        country: e.country || '',
        admin1: e.admin1 || '',
        location: { latitude: lat, longitude: lon },
        coordinates: [lon, lat],
        occurredAt,
        timestamp: new Date(occurredAt).toISOString(),
        fatalities,
        actors,
        source: e.source || 'ACLED',
        nearChokepoint,
        chokepointDistanceKm: nearChokepoint ? Math.round(chokepointDistanceKm) : null,
        severityScore,
      };
    })
    .sort((a, b) => b.severityScore - a.severityScore);

  return alerts.slice(0, maxEvents);
}

export async function fetchAcledToken({ baseUrl, email, password, fetchImpl = globalThis.fetch } = {}) {
  const resp = await fetchImpl(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': CHROME_UA,
      Accept: 'application/json',
    },
    body: new URLSearchParams({ username: email, password, grant_type: 'password', client_id: 'acled' }),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  const payload = await resp.json().catch(() => null);
  if (!resp.ok || !payload?.access_token) {
    // 400 invalid_grant on this endpoint means wrong credentials; anything else
    // (or a 200 without a token) is reported verbatim so the cron log is enough.
    throw new Error(`ACLED token request failed (HTTP ${resp.status})${payload?.error ? ` — ${payload.error}` : ''}`);
  }
  return payload.access_token;
}

export async function fetchAcledEvents({ baseUrl, token, lookbackDays = LOOKBACK_DAYS, now = Date.now(), fetchImpl = globalThis.fetch } = {}) {
  const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
  const url = new URL(`${baseUrl}/api/acled/read`);
  url.searchParams.set('_format', 'json');
  url.searchParams.set('limit', String(MAX_EVENTS));
  url.searchParams.set('event_date', `${isoDay(now - lookbackDays * 86_400_000)}|${isoDay(now)}`);
  url.searchParams.set('event_date_where', 'BETWEEN');
  url.searchParams.set('event_type', EVENT_TYPES);

  const resp = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const payload = await resp.json().catch(() => null);
  if (resp.status === 403 || (payload?.message || '').toLowerCase().includes('access denied')) {
    throw new AcledAccessError(`ACLED rejected the data request (HTTP ${resp.status}): ${payload?.message || 'Access denied'}. ${ACCESS_HINT}`);
  }
  if (!resp.ok) {
    throw new Error(`ACLED read failed (HTTP ${resp.status})${payload?.message ? ` — ${payload.message}` : ''}`);
  }
  if (!Array.isArray(payload?.data)) {
    throw new Error(`ACLED read returned no data array (keys: ${payload && typeof payload === 'object' ? Object.keys(payload).join(',') : typeof payload})`);
  }
  return payload.data;
}

// ACLED is disabled in Risk Sentinel. ACLED's EULA forbids using its data with
// AI/ML/LLM systems, academic use included, and ACLED declined an access upgrade for
// this project (October 2026). Never return a token: callers treat null as
// "source unavailable" and continue with the other sources.
export const ACLED_DISABLED = true;

export async function main() {
  if (ACLED_DISABLED) {
    console.log('[acled] disabled: the ACLED licence excludes AI/LLM use — nothing fetched, nothing written');
    return;
  }
  loadEnvFile(import.meta.url);
  const baseUrl = (process.env.ACLED_BASE_URL || 'https://acleddata.com').replace(/\/$/, '');
  const email = process.env.ACLED_EMAIL || process.env.ACLED_USERNAME || '';
  const password = process.env.ACLED_PASSWORD || '';

  if (!email || !password) {
    console.error('[acled] missing ACLED_EMAIL/ACLED_PASSWORD in the environment (.env) — skipping, other sources continue');
    process.exit(1);
  }

  const token = await fetchAcledToken({ baseUrl, email, password });
  console.log(`[acled] oauth ok (${maskToken(token)})`);
  const raw = await fetchAcledEvents({ baseUrl, token });
  const alerts = processEvents(raw);
  if (alerts.length === 0) {
    throw new Error(`ACLED returned ${raw.length} rows but none had usable coordinates`);
  }

  const { url, token: redisToken } = getRedisCredentials();
  await redisCommand(url, redisToken, ['SET', REDIS_KEY, JSON.stringify(alerts), 'EX', String(KEY_TTL_SECONDS)]);
  await writeFreshnessMetadataSafely('n8n', 'acled', alerts.length, 'acled-oauth', KEY_TTL_SECONDS);
  const chokepointHits = alerts.filter((a) => a.nearChokepoint).length;
  console.log(`[acled] published ${alerts.length} events (${chokepointHits} near chokepoints, ${alerts.filter((a) => a.severity === 'critical').length} critical) to ${REDIS_KEY}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`[acled] FAILED: ${err?.message || err}`);
    process.exit(1);
  });
}
