/**
 * Risk Sentinel — admin UI: user management (list / create / reset / role /
 * delete) for the UnifiedSettings "Admin" tab. Session-cookie authenticated;
 * the server enforces the admin role.
 */

import { escapeHtml } from '@/utils/sanitize';

interface AdminUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

async function loadUsers(): Promise<AdminUser[]> {
  const res = await api('/api/auth/users');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { users?: AdminUser[] };
  return data.users ?? [];
}

export async function renderAdminUsers(container: HTMLElement): Promise<void> {
  container.innerHTML = '<div class="ai-flow-section-label">Utenti</div><div class="ai-flow-toggle-desc">Caricamento…</div>';

  let users: AdminUser[];
  try {
    users = await loadUsers();
  } catch (error) {
    container.innerHTML = `<div class="ai-flow-section-label">Utenti</div><div class="ai-flow-toggle-desc">Errore: ${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="ai-flow-section-label">Utenti</div>
    <div class="ai-flow-toggle-desc" style="margin-bottom:8px">Crea utenti e reimposta le password. Gli admin vedono questo tab e possono disattivare i pannelli per tutti.</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tbody>
        ${users
          .map(
            (user) => `
          <tr data-user="${escapeHtml(user.username)}" style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <td style="padding:6px 4px">${escapeHtml(user.username)}</td>
            <td style="padding:6px 4px"><span class="panel-tier-badge" data-tier="${user.role === 'admin' ? '1' : '2'}">${escapeHtml(user.role)}</span></td>
            <td style="padding:6px 4px;text-align:right;white-space:nowrap">
              <button class="rs-admin-user-pass" data-action="password" data-user="${escapeHtml(user.username)}">Password</button>
              <button class="rs-admin-user-role" data-action="role" data-user="${escapeHtml(user.username)}" data-role="${user.role === 'admin' ? 'user' : 'admin'}">${user.role === 'admin' ? 'Rendi user' : 'Rendi admin'}</button>
              <button class="rs-admin-user-delete" data-action="delete" data-user="${escapeHtml(user.username)}">Elimina</button>
            </td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div class="ai-flow-section-label" style="margin-top:14px">Nuovo utente</div>
    <form id="rsAdminUserForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <input name="username" placeholder="username" autocomplete="off" style="flex:1;min-width:130px">
      <input name="password" type="password" placeholder="password (min 8)" autocomplete="new-password" style="flex:1;min-width:130px">
      <select name="role">
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      <button type="submit" class="rs-admin-user-create">Crea</button>
    </form>
    <div class="ai-flow-toggle-desc" id="rsAdminUserStatus" style="margin-top:8px"></div>
  `;

  const status = container.querySelector<HTMLElement>('#rsAdminUserStatus');
  const setStatus = (text: string) => {
    if (status) status.textContent = text;
  };

  const refresh = () => {
    void renderAdminUsers(container);
  };

  container.querySelector<HTMLFormElement>('#rsAdminUserForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    setStatus('Creazione…');
    try {
      const res = await api('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          username: String(data.get('username') ?? ''),
          password: String(data.get('password') ?? ''),
          role: String(data.get('role') ?? 'user'),
        }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      setStatus('Utente creato.');
      refresh();
    } catch (error) {
      setStatus(`Errore: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  container.onclick = async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const username = button.dataset.user as string;
    try {
      if (action === 'password') {
        const password = window.prompt(`Nuova password per "${username}" (min 8 caratteri):`);
        if (!password) return;
        const res = await api('/api/auth/users', {
          method: 'PATCH',
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
        setStatus('Password aggiornata.');
      } else if (action === 'role') {
        const res = await api('/api/auth/users', {
          method: 'PATCH',
          body: JSON.stringify({ username, role: button.dataset.role }),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
        setStatus('Ruolo aggiornato.');
        refresh();
      } else if (action === 'delete') {
        if (!window.confirm(`Eliminare l'utente "${username}"?`)) return;
        const res = await api(`/api/auth/users?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
        setStatus('Utente eliminato.');
        refresh();
      }
    } catch (error) {
      setStatus(`Errore: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
