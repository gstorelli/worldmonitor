import { readJsonFromUpstash, readJsonBatchFromUpstashWithStatus } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

/** Importers watched for single-supplier concentration on strategic HS4 lines. */
const WATCHLIST = ['IT', 'DE', 'FR', 'ES', 'NL', 'BE', 'PL', 'US', 'CN', 'TR'];

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Derive single-supplier concentration alerts from the seeded UN Comtrade
 * bilateral HS4 payloads (`comtrade:bilateral-hs4:<ISO2>:v1`).
 *
 * Pure and exported so it can be unit-tested without Redis.
 *
 * @param {unknown[]} payloads
 * @param {{ maxAlerts?: number }} [options]
 * @returns {Array<{id: string, source: string, title: string, severity: string, timestamp: string, metadata: Record<string, unknown>}>}
 */
export function deriveConcentrationAlerts(payloads, { maxAlerts = 20 } = {}) {
  const alerts = [];
  for (const payload of payloads) {
    if (!payload || typeof payload !== 'object') continue;
    const { iso2, products, fetchedAt } = /** @type {any} */ (payload);
    if (!Array.isArray(products)) continue;
    for (const product of products) {
      const top = Array.isArray(product?.topExporters) ? product.topExporters[0] : null;
      if (!top || typeof top.share !== 'number' || !product?.hs4) continue;
      const share = top.share;
      let severity = null;
      if (share >= 0.75) severity = 'critical';
      else if (share >= 0.6) severity = 'high';
      else if (share >= 0.45) severity = 'medium';
      if (!severity) continue;

      const partner = top.partnerIso2 || String(top.partnerCode ?? '');
      alerts.push({
        id: `comtrade-${iso2}-${product.hs4}`,
        source: 'UN_COMTRADE',
        title: `HS ${product.hs4} — dipendenza da fornitore unico (${partner} ${Math.round(share * 100)}%)`,
        severity,
        timestamp: typeof fetchedAt === 'string' ? fetchedAt : new Date().toISOString(),
        metadata: {
          derived: true,
          iso2,
          hs4: product.hs4,
          description: product.description || '',
          year: product.year ?? null,
          totalValue: product.totalValue ?? null,
          topExporter: partner,
          topExporterShare: share,
        },
      });
    }
  }

  return alerts
    .sort(
      (a, b) =>
        (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) ||
        (Number(b.metadata.topExporterShare) || 0) - (Number(a.metadata.topExporterShare) || 0),
    )
    .slice(0, maxAlerts);
}

function mockAlerts() {
  return [{
    id: `comtrade-dummy-${Date.now()}`,
    source: 'UN_COMTRADE',
    title: '[DATA PENDING] Anomalia Baseline Flussi Commerciali',
    severity: 'low',
    timestamp: new Date().toISOString(),
    metadata: { note: 'Nessun dato bilateral HS4 in Redis: esegui scripts/seed-comtrade-bilateral-hs4.mjs.' },
  }];
}

function jsonResponse(body, maxAgeSeconds) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `s-maxage=${maxAgeSeconds}`,
    },
  });
}

export default async function handler(_req) {
  try {
    // 1. A dedicated n8n feed wins when a workflow has pushed one.
    const pushed = await readJsonFromUpstash('risk_sentinel:n8n:comtrade');
    if (Array.isArray(pushed) && pushed.length > 0) {
      return jsonResponse(pushed, 60);
    }

    // 2. Otherwise derive real alerts from the seeded UN Comtrade bilateral data.
    const keys = WATCHLIST.map((iso2) => `comtrade:bilateral-hs4:${iso2}:v1`);
    const batch = await readJsonBatchFromUpstashWithStatus(keys);
    const payloads = batch.filter((entry) => entry.status === 'hit').map((entry) => entry.value);
    const derived = deriveConcentrationAlerts(payloads);
    if (derived.length > 0) {
      return jsonResponse(derived, 300);
    }

    // 3. No bilateral data seeded yet (or all reads failed).
    return jsonResponse(mockAlerts(), 60);
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500 });
  }
}
