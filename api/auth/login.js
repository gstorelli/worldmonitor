import { getPublicCorsHeaders } from '../_cors.js';
import { getUserByUsername, isValidUsername, publicUser, verifyPassword } from '../_users.js';
import { createSessionToken, sessionCookieValue, useSecureCookie } from '../_user-session.js';

/**
 * POST /api/auth/login → { ok, user } + Set-Cookie rs_session
 * Public path (exempt from the session gate).
 */
export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('POST, OPTIONS');
  const json = (body, status = 200, extra = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = process.env.WM_SESSION_SECRET || '';
  if (!secret) return json({ error: 'Auth is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const username = body?.username;
  const password = body?.password;
  if (!isValidUsername(username) || typeof password !== 'string' || !password) {
    return json({ error: 'Invalid credentials' }, 401);
  }

  let user;
  try {
    user = await getUserByUsername(username);
  } catch {
    return json({ error: 'User store unavailable' }, 503);
  }

  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!valid) return json({ error: 'Invalid credentials' }, 401);

  const token = await createSessionToken(user.id, user.role, secret);
  return json(
    { ok: true, user: publicUser(user) },
    200,
    { 'Set-Cookie': sessionCookieValue(token, { secure: useSecureCookie(request) }) },
  );
}
