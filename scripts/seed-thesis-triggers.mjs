#!/usr/bin/env node
// Seismic triggers of the thesis view (EMSC, USGS fallback, 30 days, M>=4.5)
// written to Redis for /api/thesis/triggers. Same fetch and normalisation as
// the endpoint (api/thesis/_catalogue.js, mirrored in _thesis-catalogue.mjs).
// Runs hourly in the `thesis` tier of scripts/seed-cron.sh.

import { loadEnvFile, runSeed } from './_seed-utils.mjs';
import { TRIGGERS_REDIS_KEY, fetchSeismicTriggers } from './_thesis-catalogue.mjs';

loadEnvFile(import.meta.url);

const CACHE_TTL = 3 * 60 * 60; // 3h: survives two missed hourly runs

async function fetchTriggers() {
  const payload = await fetchSeismicTriggers({ timeoutMs: 30_000 });
  if (!payload.source) throw new Error(`both catalogues failed: ${JSON.stringify(payload.status)}`);
  console.log(`  [THESIS_TRIGGERS] ${payload.quakes.length} events from ${payload.source}`);
  return payload;
}

function validate(data) {
  return Boolean(data?.source) && Array.isArray(data?.quakes) && data.quakes.length >= 1;
}

export function declareRecords(data) {
  return Array.isArray(data?.quakes) ? data.quakes.length : 0;
}

runSeed('thesis', 'triggers', TRIGGERS_REDIS_KEY, fetchTriggers, {
  validateFn: validate,
  ttlSeconds: CACHE_TTL,
  sourceVersion: 'emsc-usgs-fallback-30d-m4.5-v1',
  declareRecords,
  schemaVersion: 1,
  maxStaleMin: 90, // hourly VPS cron (api/health.js)
}).catch((err) => {
  const cause = err.cause ? ` (cause: ${err.cause.message || err.cause.code || err.cause})` : '';
  console.error('FATAL:', (err.message || err) + cause);
  process.exit(1);
});
