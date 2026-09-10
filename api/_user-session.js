/**
 * Risk Sentinel — USER session cookie helpers (distinct from `_session.js`,
 * which issues the anonymous `wms_` browser tokens).
 *
 * Stateless, HMAC-SHA256 signed sessions: the cookie value is
 * `<base64url(payload)>.<base64url(hmac)>` where payload is
 * `{ sub, role, iat, exp }`. The signing secret is `WM_SESSION_SECRET`.
 *
 * Edge-compatible on purpose (Web Crypto only, no node:* imports) because the
 * same module is loaded by `api/auth/*` edge entries and by the self-hosted
 * local API server's user-session gate.
 */

export const SESSION_COOKIE = 'rs_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Constant-time string comparison (length is not secret for fixed-size MACs). */
export function constantTimeEqual(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(userId, role, secret, nowMs = Date.now(), ttlMs = SESSION_TTL_MS) {
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ sub: userId, role, iat: nowMs, exp: nowMs + ttlMs })),
  );
  const signature = await hmacSha256(secret, payload);
  return `${payload}.${signature}`;
}

/** Returns the decoded payload, or null when malformed/tampered/expired. */
export async function verifySessionToken(token, secret, nowMs = Date.now()) {
  const [payload, signature] = String(token ?? '').split('.');
  if (!payload || !signature || !secret) return null;
  const expected = await hmacSha256(secret, payload);
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (typeof data?.sub !== 'string' || typeof data?.exp !== 'number') return null;
    if (data.exp < nowMs) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  for (const part of String(cookieHeader ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

export function sessionCookieValue(token, { secure, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000) } = {}) {
  const attributes = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function clearSessionCookie({ secure } = {}) {
  const attributes = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

/** True when cookies should carry Secure. Defaults on unless explicitly local http. */
export function useSecureCookie(request) {
  if (process.env.AUTH_COOKIE_INSECURE === 'true') return false;
  if (process.env.AUTH_COOKIE_SECURE === 'false') return false;
  const forwardedProto = request?.headers?.get?.('x-forwarded-proto');
  if (forwardedProto) return forwardedProto.split(',')[0].trim() === 'https';
  return true;
}

/** Extract + verify the session from a Request. Returns null when absent/invalid. */
export async function getSessionFromRequest(request, secret) {
  const cookies = parseCookies(request?.headers?.get?.('cookie'));
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token, secret);
}
