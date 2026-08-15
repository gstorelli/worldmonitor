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
import hsGroups from './_hs-map-data.js';

export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, OPTIONS');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const groups = Array.isArray(hsGroups) ? hsGroups : [];

  return new Response(
    JSON.stringify({ groups, fetchedAt: new Date().toISOString() }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
