#!/usr/bin/env node
// Recent EU legal acts touching the thesis goods or trade defence (antidumping,
// countervailing duties, tariffs, CN classification), from the Publications
// Office SPARQL endpoint. Feeds the Policy workspace "Monitor" tab via
// /api/policy/registry. Runs every 6 hours in the `slow` cron tier.

import { CHROME_UA, loadEnvFile, runSeed } from './_seed-utils.mjs';
import { ACTS_WINDOW_DAYS, EU_ACTS_KEY, SPARQL_ENDPOINT, actsFromBindings, buildActsQuery } from './_policy-eu-acts.mjs';

loadEnvFile(import.meta.url);

const CACHE_TTL = 3 * 24 * 60 * 60; // 3 days: survives a day of SPARQL outages at a 6h cadence

async function fetchActs() {
  const since = new Date(Date.now() - ACTS_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const url = `${SPARQL_ENDPOINT}?${new URLSearchParams({ query: buildActsQuery(since) })}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
  const json = await res.json();
  const total = json?.results?.bindings?.length ?? 0;
  const acts = actsFromBindings(json);
  console.log(`  [EU_ACTS] ${total} acts since ${since}, ${acts.length} relevant`);
  return { windowDays: ACTS_WINDOW_DAYS, since, scanned: total, source: 'Publications Office SPARQL (CELLAR)', acts };
}

function validate(data) {
  // Zero relevant acts in 30 days is possible; zero scanned acts means a broken query.
  return Array.isArray(data?.acts) && Number(data?.scanned) > 0;
}

export function declareRecords(data) {
  return Array.isArray(data?.acts) ? data.acts.length : 0;
}

runSeed('policy', 'eu-acts', EU_ACTS_KEY, fetchActs, {
  validateFn: validate,
  ttlSeconds: CACHE_TTL,
  sourceVersion: 'cellar-sparql-30d-v1',
  declareRecords,
  zeroIsValid: true,
  schemaVersion: 1,
  maxStaleMin: 1080, // 6h cadence (slow tier), 3 missed runs
  lockTtlMs: 180_000,
}).catch((err) => {
  const cause = err.cause ? ` (cause: ${err.cause.message || err.cause.code || err.cause})` : '';
  console.error('FATAL:', (err.message || err) + cause);
  process.exit(1);
});
