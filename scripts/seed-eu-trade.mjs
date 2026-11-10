#!/usr/bin/env node
// Imports (Eurostat Comext) and EU duties (WTO) for the 8 strategic goods of
// the thesis, for the Trade Policy panel and OSINT (thesis issue #91).
// Annual data that changes at most monthly: runs in the `context` tier.

import { CHROME_UA, loadEnvFile, runSeed } from './_seed-utils.mjs';
import {
  EU_TRADE_KEY, THESIS_HS4, comextUrl, comextValuesByPartner, dutiesBySubheading, summariseImports, wtoUrl,
} from './_eu-trade.mjs';

loadEnvFile(import.meta.url);

const CACHE_TTL = 14 * 24 * 60 * 60; // 14 days: annual data, a missed week is harmless
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': CHROME_UA, ...headers }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
  // WTO answers 204 (empty body) when a series has no data.
  const text = res.status === 204 ? '' : await res.text();
  return text.trim() ? JSON.parse(text) : null;
}

/** Latest year with data for a reporter/good: current year − 1, else − 2. */
async function comextLatest(reporter, hs4) {
  const now = new Date().getUTCFullYear();
  for (const year of [now - 1, now - 2]) {
    const json = await getJson(comextUrl(reporter, hs4, year));
    const values = comextValuesByPartner(json);
    if (Object.keys(values).length) {
      const labels = json?.dimension?.partner?.category?.label ?? {};
      return summariseImports(reporter, year, values, labels);
    }
    await sleep(500);
  }
  return null;
}

async function fetchEuTrade() {
  const wtoKey = process.env.WTO_API_KEY || '';
  if (!wtoKey) console.warn('  [EU_TRADE] WTO_API_KEY not set: duties skipped');
  const now = new Date().getUTCFullYear();
  const years = [now - 4, now - 3, now - 2, now - 1];
  const goods = {};
  let importsOk = 0;
  let dutiesOk = 0;
  for (const hs4 of THESIS_HS4) {
    const entry = { imports: {}, duties: [] };
    for (const reporter of ['IT', 'EU27_2020']) {
      try {
        const summary = await comextLatest(reporter, hs4);
        if (summary) { entry.imports[reporter] = summary; importsOk++; }
      } catch (err) {
        console.warn(`  [EU_TRADE] Comext ${reporter} ${hs4}: ${err.message}`);
      }
      await sleep(500);
    }
    if (wtoKey) {
      try {
        const headers = { 'Ocp-Apim-Subscription-Key': wtoKey };
        const mfn = await getJson(wtoUrl('HS_A_0010', hs4, years), headers);
        await sleep(500);
        const pref = await getJson(wtoUrl('HS_P_0070', hs4, years), headers);
        entry.duties = dutiesBySubheading(mfn?.Dataset, pref?.Dataset);
        if (entry.duties.length) dutiesOk++;
      } catch (err) {
        console.warn(`  [EU_TRADE] WTO ${hs4}: ${err.message}`);
      }
      await sleep(500);
    }
    goods[hs4] = entry;
  }
  console.log(`  [EU_TRADE] imports ${importsOk}/${THESIS_HS4.length * 2}, duties ${dutiesOk}/${THESIS_HS4.length}`);
  return {
    sources: { imports: 'Eurostat Comext DS-045409', duties: 'WTO Timeseries HS_A_0010, HS_P_0070 (EU, 918)' },
    importsOk,
    dutiesOk,
    goods,
  };
}

function validate(data) {
  return Number(data?.importsOk) >= THESIS_HS4.length; // at least half the reporter × good pairs
}

export function declareRecords(data) {
  return Number(data?.importsOk) || 0;
}

runSeed('trade', 'eu-goods', EU_TRADE_KEY, fetchEuTrade, {
  validateFn: validate,
  ttlSeconds: CACHE_TTL,
  sourceVersion: 'comext-ds045409-wto-hs-v1',
  declareRecords,
  schemaVersion: 1,
  maxStaleMin: 1080, // context tier every 6h, 3 missed runs
  lockTtlMs: 300_000,
}).catch((err) => {
  const cause = err.cause ? ` (cause: ${err.cause.message || err.cause.code || err.cause})` : '';
  console.error('FATAL:', (err.message || err) + cause);
  process.exit(1);
});
