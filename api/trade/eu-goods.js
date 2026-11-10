// EU and Italian imports (Eurostat Comext) and EU duties (WTO) for the 8
// strategic goods of the thesis, written by scripts/seed-eu-trade.mjs.
// Read by the Trade Policy panel and the OSINT workspace (thesis issue #91).
import { jsonResponse } from '../_json-response.js';
import { readJsonFromUpstashWithStatus } from '../_upstash-json.js';

export const config = { runtime: 'edge' };

const EU_TRADE_KEY = 'trade:eu-goods:v1';

export default async function handler() {
  const { status, value } = await readJsonFromUpstashWithStatus(EU_TRADE_KEY);
  if (status !== 'hit' || !value || typeof value !== 'object') {
    return jsonResponse({ available: false, status, goods: {} }, 200, { 'Cache-Control': 'no-store' });
  }
  return jsonResponse({ available: true, ...value }, 200, { 'Cache-Control': 'private, max-age=600' });
}
