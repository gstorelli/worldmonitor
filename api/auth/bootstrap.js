import { getPublicCorsHeaders } from '../_cors.js';
import { timingSafeEqualSecret } from '../_crypto.js';
import { createUser, listUsers, publicUser } from '../_users.js';

/**
 * POST /api/auth/bootstrap — one-shot first-admin creation.
 *
 * Security model:
 *   - requires the `N8N_INGEST_SECRET` bearer (the operator already holds it);
 *   - only works while there are ZERO users, so it cannot mint admins later;
 *   - never echoes the password back.
 *
 * Use `scripts/create-user.sh` for any subsequent user management.
 */
export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('POST, OPTIONS');
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = process.env.N8N_INGEST_SECRET || '';
  if (!secret) return json({ error: 'Bootstrap is not configured' }, 503);

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(await timingSafeEqualSecret(token, secret))) return json({ error: 'Unauthorized' }, 401);

  let users;
  try {
    users = await listUsers();
  } catch {
    return json({ error: 'User store unavailable' }, 503);
  }
  if (users.length > 0) return json({ error: 'Bootstrap already completed' }, 409);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const user = await createUser({ username: body?.username, password: body?.password, role: 'admin' });
    return json({ ok: true, user: publicUser(user) }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'invalid body' }, 400);
  }
}
