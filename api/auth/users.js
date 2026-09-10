import { getPublicCorsHeaders } from '../_cors.js';
import {
  createUser,
  deleteUser,
  getUserById,
  getUserByUsername,
  listUsers,
  publicUser,
  updateUser,
} from '../_users.js';
import { getSessionFromRequest } from '../_session.js';

/**
 * Admin-only user management.
 *   GET    /api/auth/users            → { users: [...] }
 *   POST   /api/auth/users            → create { username, password, role? }
 *   PATCH  /api/auth/users            → update { username, password?, role? }
 *   DELETE /api/auth/users?username=  → delete
 *
 * Guards against locking yourself out: an admin cannot demote or delete their
 * own account, and the last remaining admin cannot be demoted/deleted.
 */
async function requireAdmin(request) {
  const secret = process.env.WM_SESSION_SECRET || '';
  if (!secret) return { status: 503, error: 'Auth is not configured' };
  const session = await getSessionFromRequest(request, secret);
  if (!session) return { status: 401, error: 'Unauthorized' };
  let user;
  try {
    user = await getUserById(session.sub);
  } catch {
    return { status: 503, error: 'User store unavailable' };
  }
  if (!user) return { status: 401, error: 'Unauthorized' };
  if (user.role !== 'admin') return { status: 403, error: 'Forbidden' };
  return { user };
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  if (/already exists|invalid username|password must|role must|user not found/.test(message)) return message;
  if (/Redis/i.test(message)) return 'User store unavailable';
  return 'Unexpected error';
}

export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, POST, PATCH, DELETE, OPTIONS');
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const guard = await requireAdmin(request);
  if (guard.error) return json({ error: guard.error }, guard.status);
  const admin = guard.user;

  try {
    if (request.method === 'GET') {
      return json({ users: await listUsers() });
    }

    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const created = await createUser({ username: body?.username, password: body?.password, role: body?.role ?? 'user' });
      return json({ ok: true, user: created }, 201);
    }

    if (request.method === 'PATCH') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const target = await getUserByUsername(body?.username);
      if (!target) return json({ error: 'user not found' }, 404);
      if (body?.role !== undefined && body.role !== target.role) {
        if (target.id === admin.id) return json({ error: 'cannot change your own role' }, 400);
        if (target.role === 'admin' && body.role !== 'admin') {
          const admins = (await listUsers()).filter((u) => u.role === 'admin');
          if (admins.length <= 1) return json({ error: 'cannot remove the last admin' }, 400);
        }
      }
      const updated = await updateUser(body.username, { password: body?.password, role: body?.role });
      return json({ ok: true, user: updated });
    }

    if (request.method === 'DELETE') {
      const username = new URL(request.url).searchParams.get('username') || '';
      const target = await getUserByUsername(username);
      if (!target) return json({ error: 'user not found' }, 404);
      if (target.id === admin.id) return json({ error: 'cannot delete your own account' }, 400);
      if (target.role === 'admin') {
        const admins = (await listUsers()).filter((u) => u.role === 'admin');
        if (admins.length <= 1) return json({ error: 'cannot remove the last admin' }, 400);
      }
      await deleteUser(username);
      return json({ ok: true, deleted: publicUser(target) });
    }
  } catch (error) {
    return json({ error: friendlyError(error) }, 400);
  }

  return json({ error: 'Method not allowed' }, 405);
}
