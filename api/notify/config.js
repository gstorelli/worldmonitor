/**
 * Risk Sentinel — intelligence notification configuration.
 *
 * GET  /api/notify/config → { config: {...} | null }
 * POST /api/notify/config → validates and stores the notification config
 *                            (Redis notify:config:v1). The n8n workflow
 *                            "07-intelligence-notifications" reads this
 *                            endpoint and delivers Telegram/email digests.
 *
 * Config shape:
 * {
 *   endpoints: {
 *     telegram: { enabled: boolean, botToken: string, chatId: string },
 *     email:    { enabled: boolean, smtpUrl: string, from: string, to: string }
 *   },
 *   frequency: 'realtime' | 'hourly' | 'daily' | 'weekly',
 *   topics: string[],        // chokepoints, commodities, conflicts, climate, seismic, policy
 *   enrichment: 'fact' | 'analysis' | 'regulatory'
 * }
 */

import { getPublicCorsHeaders } from '../_cors.js';

const CONFIG_KEY = 'notify:config:v1';
const ALLOWED_FREQUENCIES = ['realtime', 'hourly', 'daily', 'weekly'];
const ALLOWED_ENRICHMENT = ['fact', 'analysis', 'regulatory'];

async function redisGet(url, token, key) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.result ?? null;
}

async function redisSet(url, token, key, value) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, JSON.stringify(value)]),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Redis SET failed: HTTP ${resp.status}`);
  return resp.json();
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('config must be an object');
  if (config.frequency && !ALLOWED_FREQUENCIES.includes(config.frequency)) {
    throw new Error(`frequency must be one of: ${ALLOWED_FREQUENCIES.join(', ')}`);
  }
  if (config.enrichment && !ALLOWED_ENRICHMENT.includes(config.enrichment)) {
    throw new Error(`enrichment must be one of: ${ALLOWED_ENRICHMENT.join(', ')}`);
  }
  if (config.topics && !Array.isArray(config.topics)) throw new Error('topics must be an array');
  if (config.endpoints && typeof config.endpoints !== 'object') throw new Error('endpoints must be an object');
  return true;
}

export default async function handler(request, context = {}) {
  const corsHeaders = getPublicCorsHeaders('GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const restUrl = process.env.UPSTASH_REDIS_REST_URL || '';
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (request.method === 'GET') {
    let config = null;
    if (restUrl && restToken) {
      config = await redisGet(restUrl, restToken, CONFIG_KEY).catch(() => null);
    }
    return json({ config, fetchedAt: new Date().toISOString() });
  }

  if (request.method === 'POST') {
    if (!restUrl || !restToken) {
      return json({ error: 'Redis not configured' }, 500);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    try {
      validateConfig(body);
    } catch (err) {
      return json({ error: err.message }, 400);
    }
    await redisSet(restUrl, restToken, CONFIG_KEY, body);
    return json({ ok: true, config: body });
  }

  return json({ error: 'Method not allowed' }, 405);
}
