import { readJsonFromUpstash, readJsonBatchFromUpstashWithStatus } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

/** Importers watched for single-supplier concentration on strategic HS4 lines. */
const WATCHLIST = ['IT', 'DE', 'FR', 'ES', 'NL', 'BE', 'PL', 'US', 'CN', 'TR'];

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

/** Minimum ranked partners required before a share is meaningful. */
const MIN_PARTNERS_FOR_CONCENTRATION = 3;

/**
 * UN Comtrade partner codes for the partners we see in the watchlist data,
 * used when the seeder could not resolve `partnerIso2` (raw numeric codes such
 * as 842 used to leak into the alert titles).
 */
const PARTNER_ISO2_FALLBACK = {
  36: 'AU', 56: 'BE', 76: 'BR', 124: 'CA', 156: 'CN', 250: 'FR', 251: 'FR', 276: 'DE',
  380: 'IT', 392: 'JP', 410: 'KR', 484: 'MX', 528: 'NL', 616: 'PL', 643: 'RU', 682: 'SA',
  699: 'IN', 704: 'VN', 710: 'ZA', 724: 'ES', 757: 'CH', 784: 'AE', 792: 'TR', 804: 'UA',
  818: 'EG', 826: 'GB', 840: 'US', 842: 'US',
};

function partnerLabel(top) {
  if (top.partnerIso2) return top.partnerIso2;
  const code = String(top.partnerCode ?? '');
  return PARTNER_ISO2_FALLBACK[code] || code;
}

/**
 * Derive single-supplier concentration alerts from the seeded UN Comtrade
 * bilateral HS4 payloads (`comtrade:bilateral-hs4:<ISO2>:v1`).
 *
 * Only products with at least {@link MIN_PARTNERS_FOR_CONCENTRATION} ranked
 * partners qualify: with one or two partners every "share" collapses to ~100%
 * and the alert would be noise (the public Comtrade preview returns very thin
 * partner coverage — authenticated COMTRADE_API_KEYS return the full set).
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
      const exporters = Array.isArray(product?.topExporters) ? product.topExporters : [];
      const top = exporters[0];
      if (!top || typeof top.share !== 'number' || !product?.hs4) continue;
      if (exporters.length < MIN_PARTNERS_FOR_CONCENTRATION) continue;
      if (top.share >= 0.999) continue;
      const share = top.share;
      let severity = null;
      if (share >= 0.75) severity = 'critical';
      else if (share >= 0.6) severity = 'high';
      else if (share >= 0.45) severity = 'medium';
      if (!severity) continue;

      const partner = partnerLabel(top);
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
    title: '[DATA PENDING] Copertura partner insufficiente per l\'analisi di concentrazione',
    severity: 'low',
    timestamp: new Date().toISOString(),
    metadata: {
      note: 'Nessuna linea HS4 con >=3 partner classificati. Esegui scripts/seed-comtrade-bilateral-hs4.mjs e/o configura COMTRADE_API_KEYS per la copertura completa.',
    },
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
