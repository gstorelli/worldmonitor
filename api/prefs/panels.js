import { getPublicCorsHeaders } from '../_cors.js';
import { getRequestUser } from '../_users.js';
import { redisGetJson, redisSetJson } from '../_redis.js';

/**
 * Per-user panel preferences.
 *
 *   GET /api/prefs/panels → { panels: Record<string, PanelConfig> | null, updatedAt: string | null }
 *   PUT /api/prefs/panels → authenticated; { panels: Record<string, PanelConfig>, updatedAt?: string }
 *
 * Stored at `rs:user:<id>:panel-prefs` as `{ panels, updatedAt }`. The SPA keeps
 * localStorage as an offline cache and hydrates from here on login; it sends its
 * own `updatedAt` so a stale server snapshot can never resurrect panels the
 * operator hid locally (a lost push used to bring them back on every reload).
 * Legacy bare panel-map records are read transparently.
 *
 * Anonymous deployments (no AUTH_REQUIRED) get `panels: null` and keep working
 * client-side only.
 */

const MAX_BYTES = 200_000;

function prefsKey(userId) {
  return `rs:user:${userId}:panel-prefs`;
}

function validatePanels(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('panels must be an object');
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_BYTES) throw new Error('panels payload is too large');
  for (const [key, config] of Object.entries(value)) {
    if (typeof key !== 'string' || !key || key.length > 64) throw new Error('invalid panel id');
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`invalid config for panel ${key}`);
    }
    if (typeof config.enabled !== 'boolean') {
      throw new Error(`panel ${key} must have a boolean enabled flag`);
    }
  }
  return value;
}

function looksLikePanelMap(value) {
  const entries = Object.entries(value);
  if (entries.length === 0) return false;
  return entries.every(([, config]) =>
    config && typeof config === 'object' && !Array.isArray(config) && typeof config.enabled === 'boolean');
}

function normalizeStored(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return { panels: null, updatedAt: null };
  }
  if (stored.panels && typeof stored.panels === 'object' && !Array.isArray(stored.panels)) {
    return {
      panels: stored.panels,
      updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : null,
    };
  }
  if (looksLikePanelMap(stored)) {
    return { panels: stored, updatedAt: null };
  }
  return { panels: null, updatedAt: null };
}

function normalizeUpdatedAt(value) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, PUT, OPTIONS');
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  let user = null;
  try {
    user = await getRequestUser(request);
  } catch {
    return json({ error: 'User store unavailable' }, 503);
  }

  if (request.method === 'GET') {
    if (!user) return json({ panels: null, updatedAt: null });
    try {
      const { panels, updatedAt } = normalizeStored(await redisGetJson(prefsKey(user.id)));
      return json({ panels, updatedAt });
    } catch {
      return json({ panels: null, updatedAt: null });
    }
  }

  if (request.method === 'PUT') {
    if (!user) return json({ error: 'Unauthorized' }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    let panels;
    try {
      panels = validatePanels(body?.panels);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'invalid body' }, 400);
    }
    const updatedAt = normalizeUpdatedAt(body?.updatedAt);
    try {
      await redisSetJson(prefsKey(user.id), { panels, updatedAt });
    } catch {
      return json({ error: 'Failed to persist preferences' }, 503);
    }
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'Method not allowed' }, 405);
}
