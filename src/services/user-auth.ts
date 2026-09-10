/**
 * Risk Sentinel — user authentication gate for the SPA.
 *
 * On boot `ensureAuthenticated()` asks `/api/auth/me`. When the server has
 * `AUTH_REQUIRED=true` and no valid `rs_session` cookie is present, it renders
 * a login screen and only resolves once the user signed in. When auth is not
 * required (or the API is unreachable) the app boots unchanged.
 */

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  authRequired: boolean;
  authenticated: boolean;
  user: AuthUser | null;
}

let state: AuthState = { authRequired: false, authenticated: false, user: null };

export function getAuthState(): AuthState {
  return state;
}

async function fetchAuthState(): Promise<AuthState> {
  const res = await fetch('/api/auth/me', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Partial<AuthState>;
  return {
    authRequired: Boolean(data.authRequired),
    authenticated: Boolean(data.authenticated),
    user: (data.user as AuthUser | null) ?? null,
  };
}

/**
 * @returns true when the app should boot. Network failures fail open so an
 * unreachable API never bricks the SPA — individual API calls will 401 anyway.
 */
export async function ensureAuthenticated(): Promise<boolean> {
  try {
    state = await fetchAuthState();
  } catch {
    state = { authRequired: false, authenticated: false, user: null };
    return true;
  }
  if (!state.authRequired || state.authenticated) return true;
  await renderLoginScreen();
  return true;
}

function renderLoginScreen(): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'rs-login-overlay';
    overlay.className = 'rs-login-overlay';

    const form = document.createElement('form');
    form.className = 'rs-login-card';
    form.autocomplete = 'on';

    const brand = document.createElement('div');
    brand.className = 'rs-login-brand';
    brand.textContent = 'RISK SENTINEL';

    const subtitle = document.createElement('p');
    subtitle.className = 'rs-login-subtitle';
    subtitle.textContent = 'Accedi per continuare';

    const username = document.createElement('input');
    username.type = 'text';
    username.name = 'username';
    username.autocomplete = 'username';
    username.placeholder = 'Username';
    username.required = true;

    const password = document.createElement('input');
    password.type = 'password';
    password.name = 'password';
    password.autocomplete = 'current-password';
    password.placeholder = 'Password';
    password.required = true;

    const error = document.createElement('div');
    error.className = 'rs-login-error';
    error.setAttribute('role', 'alert');

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'rs-login-submit';
    submit.textContent = 'Accedi';

    form.append(brand, subtitle, username, password, error, submit);
    overlay.append(form);
    document.body.append(overlay);
    username.focus();

    let busy = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      submit.disabled = true;
      error.textContent = '';
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.value, password: password.value }),
        });
        if (!res.ok) {
          error.textContent = res.status === 401
            ? 'Credenziali non valide'
            : `Errore di accesso (${res.status})`;
          return;
        }
        state = await fetchAuthState();
        if (!state.authenticated) {
          error.textContent = 'Accesso non riuscito';
          return;
        }
        overlay.remove();
        resolve();
      } catch {
        error.textContent = 'Errore di rete';
      } finally {
        busy = false;
        submit.disabled = false;
      }
    });
  });
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // Session cookie is cleared server-side; a reload will re-prompt anyway.
  }
  location.reload();
}

/** Adds a header logout button when the session is authenticated. */
export function installLogoutControl(): void {
  if (!state.authRequired || !state.authenticated) return;
  const header = document.querySelector('.header-right');
  if (!header || document.getElementById('rsLogoutBtn')) return;
  const button = document.createElement('button');
  button.id = 'rsLogoutBtn';
  button.className = 'rs-logout-btn';
  button.type = 'button';
  button.textContent = 'Logout';
  button.title = `Esci (${state.user?.username ?? ''})`;
  button.addEventListener('click', () => {
    void logout();
  });
  header.prepend(button);
}
