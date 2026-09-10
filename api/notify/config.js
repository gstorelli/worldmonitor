/**
 * Risk Sentinel — intelligence notification configuration.
 *
 * GET  /api/notify/config → { config, redacted, fetchedAt }
 *      Unauthenticated callers get a REDACTED view: delivery credentials
 *      (Telegram botToken, SMTP URL) and destination identifiers (chatId, to)
 *      are omitted, but `enabled` and `connected` are preserved so the
 *      settings UI can render channel state. Callers presenting
 *      `Authorization: Bearer <N8N_INGEST_SECRET>` (the n8n workflow) get the
 *      full config needed to deliver.
 * POST /api/notify/config → validates and MERGES the notification config into
 *      the stored `notify:config:v1`.
 *      - Omitted credentials are preserved, so the redacted round-trip (UI
 *        GETs a redacted config then POSTs unrelated field changes) cannot
 *        wipe the stored bot token / SMTP URL.
 *      - Disabling a channel never deletes its stored credentials.
 *      - Changing a credential that is already set (for example redirecting
 *        `chatId`/`to`, or replacing the bot token) requires the bearer token,
 *        so an anonymous caller cannot silently hijack notifications.
 *      - A failed pre-write read aborts the POST instead of merging against a
 *        phantom empty config.
 *
 * Config shape:
 * {
 *   endpoints: {
 *     telegram: { enabled: boolean, connected?: boolean, botToken: string, chatId: string },
 *     email:    { enabled: boolean, connected?: boolean, smtpUrl: string, from: string, to: string }
 *   },
 *   frequency: 'realtime' | 'hourly' | 'daily' | 'weekly',
 *   topics: string[],        // chokepoints, commodities, conflicts, climate, seismic, policy
 *   enrichment: 'fact' | 'analysis' | 'regulatory'
 * }
 */

import { getPublicCorsHeaders } from '../_cors.js';
import { timingSafeEqualSecret } from '../_crypto.js';

const CONFIG_KEY = 'notify:config:v1';
const ALLOWED_FREQUENCIES = ['realtime', 'hourly', 'daily', 'weekly'];
const ALLOWED_ENRICHMENT = ['fact', 'analysis', 'regulatory'];

// Credential fields never exposed to unauthenticated callers and preserved
// across a redacted round-trip unless the caller supplies a replacement.
const TELEGRAM_CREDENTIALS = ['botToken', 'chatId'];
const EMAIL_CREDENTIALS = ['smtpUrl', 'to'];

class RedisReadError extends Error {}

/**
 * Read the stored config. Throws RedisReadError on transport/HTTP/parse
 * failures, and returns null ONLY when the key genuinely does not exist, so a
 * transient failure can never be mistaken for "no stored credentials".
 */
async function redisGet(url, token, key) {
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', key]),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new RedisReadError(`redis GET transport error: ${err?.message || err}`);
  }
  if (!resp.ok) throw new RedisReadError(`redis GET HTTP ${resp.status}`);
  let data;
  try {
    data = await resp.json();
  } catch {
    throw new RedisReadError('redis GET returned invalid JSON');
  }
  const rawValue = data?.result ?? null;
  if (rawValue === null) return null;
  if (typeof rawValue !== 'string') return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch {
    throw new RedisReadError('stored config is not valid JSON');
  }
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

async function isAuthorized(request) {
  const secret = process.env.N8N_INGEST_SECRET || '';
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  return timingSafeEqualSecret(token, secret);
}

function computeConnected(channel, hasDestination) {
  return Boolean(channel?.enabled && hasDestination(channel));
}

function redactChannel(channel, hasDestination) {
  if (!channel || typeof channel !== 'object') return channel;
  const redacted = {
    enabled: Boolean(channel.enabled),
    connected: computeConnected(channel, hasDestination),
  };
  if (typeof channel.from === 'string') redacted.from = channel.from;
  return redacted;
}

function redactConfig(config) {
  if (!config || typeof config !== 'object') return config;
  return {
    frequency: config.frequency,
    topics: config.topics,
    enrichment: config.enrichment,
    endpoints: {
      telegram: redactChannel(config.endpoints?.telegram, (c) => c.chatId),
      email: redactChannel(config.endpoints?.email, (c) => c.to),
    },
  };
}

/** Full config plus the same `connected` flags the redacted view exposes. */
function attachConnected(config) {
  if (!config || typeof config !== 'object') return config;
  const telegram = config.endpoints?.telegram;
  const email = config.endpoints?.email;
  return {
    ...config,
    endpoints: {
      telegram: telegram
        ? { ...telegram, connected: computeConnected(telegram, (c) => c.chatId) }
        : telegram,
      email: email ? { ...email, connected: computeConnected(email, (c) => c.to) } : email,
    },
  };
}

/**
 * True when the patch would change a credential that already has a stored
 * value (destination redirection, token replacement, or clearing). Setting a
 * credential for the first time (empty stored value) is allowed anonymously so
 * initial channel setup still works; so are non-credential fields.
 */
function credentialMutationRequested(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') return false;
  const channels = [
    { previous: existing?.endpoints?.telegram, next: incoming?.endpoints?.telegram, keys: TELEGRAM_CREDENTIALS },
    { previous: existing?.endpoints?.email, next: incoming?.endpoints?.email, keys: EMAIL_CREDENTIALS },
  ];
  for (const { previous, next, keys } of channels) {
    if (!next || typeof next !== 'object') continue;
    for (const key of keys) {
      const before = previous?.[key];
      const after = next[key];
      if (typeof before === 'string' && before && after !== undefined && after !== before) {
        return true;
      }
    }
  }
  return false;
}

function preserveCredentials(previous, incoming, credentialKeys) {
  if (!incoming || typeof incoming !== 'object') return previous ?? {};
  const merged = { ...(previous ?? {}), ...incoming };
  delete merged.connected;
  // Disabling a channel never destroys stored credentials, and a redacted
  // round-trip that omits a credential preserves the stored one.
  for (const key of credentialKeys) {
    if (incoming[key] === undefined && previous?.[key] !== undefined) {
      merged[key] = previous[key];
    }
  }
  return merged;
}

function mergeConfig(existing, incoming) {
  const merged = { ...(existing ?? {}), ...incoming };
  merged.endpoints = {
    telegram: preserveCredentials(existing?.endpoints?.telegram, incoming?.endpoints?.telegram, TELEGRAM_CREDENTIALS),
    email: preserveCredentials(existing?.endpoints?.email, incoming?.endpoints?.email, EMAIL_CREDENTIALS),
  };
  return merged;
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

export default async function handler(request, _context = {}) {
  const corsHeaders = getPublicCorsHeaders('GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const restUrl = process.env.UPSTASH_REDIS_REST_URL || '';
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const now = () => new Date().toISOString();

  if (request.method === 'GET') {
    if (!restUrl || !restToken) {
      return json({ config: null, redacted: false, fetchedAt: now() });
    }
    let config;
    try {
      config = await redisGet(restUrl, restToken, CONFIG_KEY);
    } catch {
      return json({ error: 'config read failed' }, 502);
    }
    if (!config) return json({ config: null, redacted: false, fetchedAt: now() });
    const authorized = await isAuthorized(request);
    return json({
      config: authorized ? attachConnected(config) : redactConfig(config),
      redacted: !authorized,
      fetchedAt: now(),
    });
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

    let existing;
    try {
      existing = await redisGet(restUrl, restToken, CONFIG_KEY);
    } catch {
      // Refuse to write when the previous config could not be read: merging
      // against a phantom null would silently wipe stored credentials.
      return json({ error: 'config read failed; refusing to overwrite stored credentials' }, 502);
    }

    const authorized = await isAuthorized(request);
    if (!authorized && credentialMutationRequested(existing, body)) {
      return json(
        {
          error: 'Unauthorized',
          detail: 'changing stored delivery credentials requires the notify admin bearer token',
        },
        401,
      );
    }

    const merged = mergeConfig(existing, body);
    await redisSet(restUrl, restToken, CONFIG_KEY, merged);
    return json({ ok: true, config: redactConfig(merged) });
  }

  return json({ error: 'Method not allowed' }, 405);
}
