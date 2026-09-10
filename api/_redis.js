/**
 * Shared Redis JSON helpers for the fork endpoints.
 *
 * Upstash Redis REST dialect (`POST` a `["GET", key]` / `["SET", key, value]`).
 * `redisGetJson` throws on transport/HTTP/parse failures and returns null ONLY
 * when the key is missing, so callers can distinguish "absent" from "broken".
 * Edge-compatible (fetch + AbortSignal only).
 */

export function redisConfigured() {
  return Boolean((process.env.UPSTASH_REDIS_REST_URL || '') && (process.env.UPSTASH_REDIS_REST_TOKEN || ''));
}

async function command(body) {
  const url = process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!url || !token) throw new Error('Redis is not configured (UPSTASH_REDIS_REST_URL/TOKEN)');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Redis command failed: HTTP ${resp.status}`);
  return resp.json();
}

export async function redisGetJson(key) {
  const data = await command(['GET', key]);
  const raw = data?.result ?? null;
  if (raw === null) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Corrupt JSON in Redis key ${key}`);
  }
}

export async function redisSetJson(key, value) {
  await command(['SET', key, JSON.stringify(value)]);
}
