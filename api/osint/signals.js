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
  climateEra5: 'climate:anomalies:v2', // seed-climate-anomalies, ERA5 archive vs monthly normals
  euSupply: 'trade:eu-goods:v1', // seed-eu-trade, Eurostat Comext extra-EU imports
};

// Freshness record written next to each data key (runSeed and the n8n ingest
// write `seed-meta:<domain>:<resource>` = { fetchedAt (ms), recordCount, sourceVersion }).
const META_KEYS = {
  quotes: 'seed-meta:market:commodities',
  climate: 'seed-meta:n8n:openmeteo',
  comtradeIT: 'seed-meta:comtrade:bilateral-hs4',
  climateEra5: 'seed-meta:climate:anomalies',
  euSupply: 'seed-meta:trade:eu-goods',
};

const DATASETS = {
  quotes: 'Yahoo Finance (seed-commodity-quotes)',
  climate: 'Open-Meteo (n8n workflow 03)',
  comtradeIT: 'UN Comtrade bilateral HS4 (IT)',
  climateEra5: 'Open-Meteo ERA5 archive (seed-climate-anomalies)',
  euSupply: 'Eurostat Comext DS-045409',
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

// v2: climate anomalies of scripts/seed-climate-anomalies.mjs, mean of the
// last 7 daily ERA5 observations minus the zone's monthly normal. Values only:
// the seeder's severity/type labels and any threshold stay out of this layer.
export function shapeClimateEra5(raw, meta) {
  const declared = typeof meta?.sourceVersion === 'string' ? meta.sourceVersion : null;
  const period = declared?.match(/(\d{4})-(\d{4})/);
  const zones = asArray(raw, 'anomalies')
    .map((z) => ({
      zone: String(z?.zone ?? ''),
      lat: num(z?.location?.latitude),
      lon: num(z?.location?.longitude),
      tempDelta: num(z?.tempDelta),
      precipDelta: num(z?.precipDelta),
      period: String(z?.period ?? ''),
    }))
    .filter((z) => z.zone && z.lat !== null && z.lon !== null && (z.tempDelta !== null || z.precipDelta !== null));
  return {
    baseline: period ? `${period[1]}-${period[2]}` : null,
    sourceVersion: declared,
    units: { tempDelta: '°C', precipDelta: 'mm/day' },
    zones,
  };
}

// v2: measured supply indicators (layer 4) written by scripts/seed-eu-trade.mjs
// on the EU27 extra-EU imports of each strategic good.
export function shapeEuSupply(raw) {
  const goods = raw && typeof raw === 'object' && raw.goods && typeof raw.goods === 'object' ? raw.goods : {};
  const products = Object.entries(goods)
    .map(([hs4, entry]) => {
      const eu = entry?.imports?.EU27_2020;
      if (!eu || typeof eu !== 'object') return null;
      const s = eu.supply && typeof eu.supply === 'object' ? eu.supply : null;
      return {
        hs4: String(hs4),
        year: num(eu.year),
        extraEuEur: num(eu.extraEuEur),
        supply: s
          ? {
            hhi: num(s.hhi),
            nodeOrigins: Array.isArray(s.nodeOrigins) ? s.nodeOrigins.map(String) : [],
            nodeOriginShare: num(s.nodeOriginShare),
          }
          : null,
      };
    })
    .filter((p) => p && /^\d{4}$/.test(p.hs4));
  return { reporter: 'EU27_2020', basis: 'extra-EU imports', products };
}

function isoTime(v) {
  const n = num(v);
  const d = n !== null ? new Date(n) : typeof v === 'string' ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// Per source: the read status of the data key, when it was fetched (payload
// fetchedAt first, then its seed-meta record) and the dataset it comes from.
// A miss or an error never carries a fetchedAt.
export function shapeSources(byName, metaByName) {
  return Object.fromEntries(Object.keys(KEYS).map((n) => {
    const status = byName[n]?.status ?? 'error';
    const payload = status === 'hit' ? byName[n].value : null;
    const meta = metaByName[n]?.status === 'hit' ? metaByName[n].value : null;
    const fetchedAt = status === 'hit' ? isoTime(payload?.fetchedAt) ?? isoTime(meta?.fetchedAt) : null;
    return [n, { status, fetchedAt, source: DATASETS[n] }];
  }));
}

export default async function handler() {
  const names = Object.keys(KEYS);
  const results = await readJsonBatchFromUpstashWithStatus([
    ...names.map((n) => KEYS[n]),
    ...names.map((n) => META_KEYS[n]),
  ]);
  const byName = Object.fromEntries(names.map((n, i) => [n, results[i]]));
  const metaByName = Object.fromEntries(names.map((n, i) => [n, results[names.length + i]]));
  const status = Object.fromEntries(names.map((n) => [n, byName[n]?.status ?? 'error']));
  const value = (n) => (byName[n]?.status === 'hit' ? byName[n].value : null);
  const meta = (n) => (metaByName[n]?.status === 'hit' ? metaByName[n].value : null);
  return jsonResponse(
    {
      generatedAt: new Date().toISOString(),
      status,
      quotes: shapeQuotes(value('quotes')),
      climate: shapeClimate(value('climate')),
      comtradeIT: shapeComtrade(value('comtradeIT')),
      // v2 (additive; the fields above stay for one release)
      climateEra5: shapeClimateEra5(value('climateEra5'), meta('climateEra5')),
      euSupply: shapeEuSupply(value('euSupply')),
      sources: shapeSources(byName, metaByName),
    },
    200,
    { 'Cache-Control': 'private, max-age=120' },
  );
}
