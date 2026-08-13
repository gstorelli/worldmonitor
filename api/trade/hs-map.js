/**
 * Risk Sentinel — strategic HS-code ↔ commodity map endpoint.
 *
 * GET /api/trade/hs-map
 *   → { groups: [ { commodity, strategicTier, hsCodes[], chokepointExposure[],
 *                   downstreamApplications[], keyIndustrialNodes[], sources[] } ] }
 *
 * Serves the curated dataset (data/hs-commodity-map.json) backing the
 * CommoditiesPanel HS filter and the per-code traffic/price analysis.
 */

import { getPublicCorsHeaders } from '../_cors.js';
import { readFileSync } from 'node:fs';

export default async function handler(request, context = {}) {
  const corsHeaders = getPublicCorsHeaders('GET, OPTIONS');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let groups = [];
  try {
    const raw = readFileSync(new URL('../../data/hs-commodity-map.json', import.meta.url), 'utf8');
    groups = JSON.parse(raw).groups ?? [];
  } catch (err) {
    context.logger?.warn?.(`[hs-map] dataset read failed: ${err.message}`);
  }

  return new Response(
    JSON.stringify({ groups, fetchedAt: new Date().toISOString() }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
