import { getPublicCorsHeaders } from './_cors.js';
import { getRequestUser } from './_users.js';
import { redisGetJson, redisSetJson } from './_redis.js';

/**
 * Global panel policy (admin-controlled).
 *
 *   GET /api/panel-policy → { disabledPanels: string[] }
 *   PUT /api/panel-policy → admin only; { disabledPanels: string[] }
 *
 * Panels listed here are hidden FOR EVERYONE, regardless of per-user
 * preferences. Precedence in the SPA: policy (disable) > user prefs > defaults.
 */

const POLICY_KEY = 'rs:panel-policy';
const MAX_PANELS = 500;
const MAX_ID_LENGTH = 64;

function sanitizePanelIds(value) {
  if (!Array.isArray(value)) throw new Error('disabledPanels must be an array');
  const ids = [];
  for (const entry of value) {
    if (typeof entry !== 'string') throw new Error('disabledPanels entries must be strings');
    const id = entry.trim();
    if (!id || id.length > MAX_ID_LENGTH) throw new Error('invalid panel id');
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > MAX_PANELS) throw new Error(`at most ${MAX_PANELS} panel ids allowed`);
  return ids;
}

export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, PUT, OPTIONS');
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  if (request.method === 'GET') {
    try {
      const policy = await redisGetJson(POLICY_KEY);
      const disabledPanels = Array.isArray(policy?.disabledPanels) ? policy.disabledPanels : [];
      return json({ disabledPanels });
    } catch {
      // Policy is non-critical: degrade to "nothing disabled" instead of 500.
      return json({ disabledPanels: [] });
    }
  }

  if (request.method === 'PUT') {
    let user;
    try {
      user = await getRequestUser(request);
    } catch {
      return json({ error: 'User store unavailable' }, 503);
    }
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    let disabledPanels;
    try {
      disabledPanels = sanitizePanelIds(body?.disabledPanels);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'invalid body' }, 400);
    }

    try {
      await redisSetJson(POLICY_KEY, { disabledPanels, updatedAt: new Date().toISOString() });
    } catch {
      return json({ error: 'Failed to persist policy' }, 503);
    }
    return json({ ok: true, disabledPanels });
  }

  return json({ error: 'Method not allowed' }, 405);
}
