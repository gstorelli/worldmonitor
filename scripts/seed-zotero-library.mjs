/**
 * Risk Sentinel — Zotero library prewarm seed.
 *
 * Writes the curated bibliography (data/zotero-sources.json) and, when
 * ZOTERO_API_KEY / ZOTERO_USER_ID are set, the live Zotero library into
 * Redis for the Source Validation panel. The /api/zotero/library endpoint
 * self-fetches on cache miss, so this seed is an optional warm-up (run it
 * once after first deployment or after clearing Redis).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function redisCmd(url, token, command) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`Redis ${command[0]} failed: HTTP ${resp.status}`);
  return resp.json();
}

const restUrl = process.env.UPSTASH_REDIS_REST_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!restUrl || !restToken) {
  console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
  process.exit(1);
}

// 1) Curated bibliography (always available)
const sourcesPath = path.resolve(__dirname, '../data/zotero-sources.json');
const curated = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
await redisCmd(restUrl, restToken, ['SET', 'zotero:sources:v1', JSON.stringify(curated.sources ?? []), 'EX', 86400 * 30]);
console.log(`curated sources: ${(curated.sources ?? []).length} written`);

// 2) Live Zotero library (optional)
const userId = process.env.ZOTERO_USER_ID || '';
const apiKey = process.env.ZOTERO_API_KEY || '';
if (userId && apiKey) {
  try {
    const numericId = /^\d+$/.test(userId)
      ? userId
      : (async () => {
          const keyResp = await fetch(`https://api.zotero.org/keys/${encodeURIComponent(apiKey)}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(15_000),
          });
          if (!keyResp.ok) throw new Error(`Zotero key resolution HTTP ${keyResp.status}`);
          const keyData = await keyResp.json();
          return keyData?.userID ? String(keyData.userID) : null;
        })();
    const resp = await fetch(
      `https://api.zotero.org/users/${encodeURIComponent(await numericId)}/items?format=json&limit=100&sort=dateAdded&direction=desc`,
      { headers: { 'Zotero-API-Key': apiKey, 'Zotero-API-Version': '3' }, signal: AbortSignal.timeout(30_000) },
    );
    if (!resp.ok) throw new Error(`Zotero API HTTP ${resp.status}`);
    const items = await resp.json();
    await redisCmd(restUrl, restToken, ['SET', 'zotero:library:v1', JSON.stringify(items), 'EX', 86400]);
    console.log(`zotero library: ${items.length} items cached`);
  } catch (err) {
    console.error(`zotero library fetch failed: ${err.message}`);
  }
} else {
  console.log('ZOTERO_API_KEY/ZOTERO_USER_ID not set — skipping live library');
}
