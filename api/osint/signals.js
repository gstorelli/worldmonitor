// OSINT workspace: the signal layer of the thesis model, as structured data.
//
// The n8n notification digest (/api/notify/digest) flattens every pipeline to
// a title and a severity, which is fine for Telegram/email but unreadable as a
// page. This endpoint returns the same Redis data with its fields, and the
// workspace (src/apps/osint/) ties it to the critical nodes and strategic
// goods. Triggers on the nodes come from /api/thesis/triggers (EMSC), not
// from here. Signals anticipate and corroborate; they never measure a hazard.
import { jsonResponse } from '../_json-response.js';
import { readJsonBatchFromUpstashWithStatus } from '../_upstash-json.js';

export const config = { runtime: 'edge' };

const KEYS = {
  quotes: 'market:commodities-bootstrap:v1', // Yahoo Finance, seed-commodity-quotes (every 20')
  climate: 'risk_sentinel:n8n:openmeteo', // n8n workflow 03, Open-Meteo, 15 zones
  comtradeIT: 'comtrade:bilateral-hs4:IT:v1', // UN Comtrade, seed-comtrade-bilateral-hs4
};

function num(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function asArray(value, ...fields) {
  if (Array.isArray(value)) return value;
  for (const f of fields) if (value && Array.isArray(value[f])) return value[f];
  return [];
}

export function shapeQuotes(raw) {
  return asArray(raw, 'quotes')
    .map((q) => ({ symbol: String(q?.symbol ?? ''), price: num(q?.price), change: num(q?.change) }))
    .filter((q) => q.symbol);
}

export function shapeClimate(raw) {
  return asArray(raw, 'data', 'items', 'anomalies')
    .map((z) => ({
      zone: String(z?.zone ?? z?.title ?? ''),
      lat: num(z?.location?.latitude),
      lon: num(z?.location?.longitude),
      tempDelta: num(z?.tempDelta),
      precipDelta: num(z?.precipDelta),
      severity: String(z?.severity ?? ''),
      type: String(z?.type ?? ''),
      period: String(z?.period ?? ''),
    }))
    .filter((z) => z.zone && z.lat !== null && z.lon !== null);
}

export function shapeComtrade(raw) {
  const products = asArray(raw, 'products').map((p) => ({
    hs4: String(p?.hs4 ?? ''),
    year: num(p?.year),
    description: String(p?.description ?? ''),
    suppliers: asArray(p?.topExporters).slice(0, 3).map((e) => ({
      iso2: e?.partnerIso2 ? String(e.partnerIso2) : null,
      code: num(e?.partnerCode),
      share: num(e?.share),
    })),
  }));
  return { reporter: 'IT', fetchedAt: raw?.fetchedAt ?? null, products: products.filter((p) => p.hs4) };
}

export default async function handler() {
  const names = Object.keys(KEYS);
  const results = await readJsonBatchFromUpstashWithStatus(names.map((n) => KEYS[n]));
  const byName = Object.fromEntries(names.map((n, i) => [n, results[i]]));
  const status = Object.fromEntries(names.map((n) => [n, byName[n]?.status ?? 'error']));
  const value = (n) => (byName[n]?.status === 'hit' ? byName[n].value : null);
  return jsonResponse(
    {
      generatedAt: new Date().toISOString(),
      status,
      quotes: shapeQuotes(value('quotes')),
      climate: shapeClimate(value('climate')),
      comtradeIT: shapeComtrade(value('comtradeIT')),
    },
    200,
    { 'Cache-Control': 'private, max-age=120' },
  );
}
