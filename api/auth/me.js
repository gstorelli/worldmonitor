import { getPublicCorsHeaders } from '../_cors.js';
import { getUserById, publicUser } from '../_users.js';
import { clearSessionCookie, getSessionFromRequest, useSecureCookie } from '../_user-session.js';

/**
 * GET /api/auth/me →
 *   { authRequired, authenticated, user }
 *
 * Always 200 so the SPA can decide between booting the app or showing the
 * login screen. Public path (exempt from the session gate).
 */
export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, OPTIONS');
  const json = (body, status = 200, extra = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const authRequired = process.env.AUTH_REQUIRED === 'true';
  const secret = process.env.WM_SESSION_SECRET || '';
  if (!secret) return json({ authRequired, authenticated: false, user: null });

  const session = await getSessionFromRequest(request, secret);
  if (!session) return json({ authRequired, authenticated: false, user: null });

  let user = null;
  try {
    user = await getUserById(session.sub);
  } catch {
    return json({ authRequired, authenticated: false, user: null, error: 'User store unavailable' });
  }
  if (!user) {
    // Session references a deleted user — clear the stale cookie.
    return json(
      { authRequired, authenticated: false, user: null },
      200,
      { 'Set-Cookie': clearSessionCookie({ secure: useSecureCookie(request) }) },
    );
  }

  return json({ authRequired, authenticated: true, user: publicUser(user) });
}
