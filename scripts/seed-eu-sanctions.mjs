#!/usr/bin/env node
// EU consolidated financial sanctions list (Financial Sanctions Files,
// European Commission), aggregated: counts by regime, enterprises by country,
// designations of the last 30 days. No personal data is stored (thesis #92).
// Runs every 6 hours in the `slow` tier, next to OFAC.

import sax from 'sax';
import { CHROME_UA, loadEnvFile, runSeed } from './_seed-utils.mjs';
import { EU_SANCTIONS_KEY, FSF_XML_URL, aggregateFsf, createFsfCollector } from './_eu-sanctions.mjs';

loadEnvFile(import.meta.url);

const CACHE_TTL = 3 * 24 * 60 * 60;

async function fetchEuSanctions() {
  const res = await fetch(FSF_XML_URL, { headers: { 'User-Agent': CHROME_UA, Accept: 'application/xml' }, signal: AbortSignal.timeout(180_000) });
  if (!res.ok || !res.body) throw new Error(`FSF HTTP ${res.status}`);
  const collector = createFsfCollector();
  let generationDate = null;
  const parser = sax.parser(true, { trim: false, xmlns: false });
  parser.onopentag = (node) => {
    if (!generationDate && /(^|:)export$/.test(node.name)) generationDate = node.attributes.generationDate ?? null;
    collector.onOpen(node.name, node.attributes);
  };
  parser.onclosetag = (name) => collector.onClose(name);
  const decoder = new TextDecoder();
  for await (const chunk of res.body) parser.write(decoder.decode(chunk, { stream: true }));
  parser.write(decoder.decode()).close();
  const data = aggregateFsf(collector.records, { generationDate });
  console.log(`  [EU_SANCTIONS] ${data.total} entities (${data.persons} persons, ${data.enterprises} enterprises), ${data.recent} in ${data.recentDays} days, list of ${generationDate}`);
  return { source: 'EU Financial Sanctions Files (consolidated list)', ...data };
}

function validate(data) {
  return Number(data?.total) > 1000 && Array.isArray(data?.programmes);
}

export function declareRecords(data) {
  return Number(data?.total) || 0;
}

runSeed('sanctions', 'eu', EU_SANCTIONS_KEY, fetchEuSanctions, {
  validateFn: validate,
  ttlSeconds: CACHE_TTL,
  sourceVersion: 'fsf-xml-1.1-aggregates-v1',
  declareRecords,
  schemaVersion: 1,
  maxStaleMin: 1080,
  lockTtlMs: 300_000,
}).catch((err) => {
  const cause = err.cause ? ` (cause: ${err.cause.message || err.cause.code || err.cause})` : '';
  console.error('FATAL:', (err.message || err) + cause);
  process.exit(1);
});
