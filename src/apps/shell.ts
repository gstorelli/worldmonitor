/**
 * Risk Sentinel — shared application shell.
 *
 * Header + footer shared by the standalone apps (OSINT / Research / Policy).
 * The dashboard keeps its own richer shell; these apps only need the brand,
 * the app switcher, the logout control and the credits footer.
 */

import { ACTIVE_APP, APPS, switchAppHref } from '@/config/apps';
import type { WorkspaceLoader } from './types';

const GITHUB_URL = 'https://github.com/gstorelli/worldmonitor';

export async function mountAppShell(container: HTMLElement, loadWorkspace: WorkspaceLoader): Promise<void> {
  container.innerHTML = `
    <div class="rs-app-shell" data-app="${ACTIVE_APP.id}">
      <header class="header rs-app-header">
        <div class="header-left">
          <span class="logo">SENTINEL</span><span class="logo-mobile">Risk Sentinel</span>
          <span class="rs-app-title">${ACTIVE_APP.label}</span>
        </div>
        <div class="header-right">
          <div class="rs-app-switcher">
            ${APPS.map(
              (app) =>
                `<a class="rs-app-link${app.id === ACTIVE_APP.id ? ' active' : ''}" href="${switchAppHref(app.id)}" title="${app.description}">${app.label}</a>`,
            ).join('')}
          </div>
        </div>
      </header>
      <main class="rs-app-main" id="rsAppRoot" data-app="${ACTIVE_APP.id}"></main>
      <footer class="rs-app-footer">
        <span class="site-footer-copy">RISK SENTINEL — PHD RESEARCH · UNIVERSITÀ DI BARI / ADM</span>
        <a href="${GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
        <span class="site-footer-copy">&copy; ${new Date().getFullYear()} Risk Sentinel</span>
      </footer>
    </div>
  `;

  const root = container.querySelector<HTMLElement>('#rsAppRoot');
  if (!root) return;
  const workspace = await loadWorkspace();
  await workspace.mount(root);
}
