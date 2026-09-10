import { getPublicCorsHeaders } from '../_cors.js';
import { clearSessionCookie, useSecureCookie } from '../_user-session.js';

/** POST /api/auth/logout → clears the session cookie. */
export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('POST, OPTIONS');
  const json = (body, status = 200, extra = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie({ secure: useSecureCookie(request) }) });
}
