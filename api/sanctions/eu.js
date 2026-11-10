// EU consolidated financial sanctions list, aggregated (counts only, no
// personal data), written by scripts/seed-eu-sanctions.mjs (thesis issue #92).
import { jsonResponse } from '../_json-response.js';
import { readJsonFromUpstashWithStatus } from '../_upstash-json.js';

export const config = { runtime: 'edge' };

const EU_SANCTIONS_KEY = 'sanctions:eu:v1';

export default async function handler() {
  const { status, value } = await readJsonFromUpstashWithStatus(EU_SANCTIONS_KEY);
  if (status !== 'hit' || !value || typeof value !== 'object') {
    return jsonResponse({ available: false, status }, 200, { 'Cache-Control': 'no-store' });
  }
  return jsonResponse({ available: true, ...value }, 200, { 'Cache-Control': 'private, max-age=600' });
}
