/**
 * Lightweight boot for the standalone applications (OSINT, Research, Policy).
 *
 * Thesis issue #87: main.ts imported the whole dashboard (App: map, panels,
 * data loader) statically, so the standalone apps downloaded and parsed it
 * although App.init() branched to the shell before using any of it. main.ts
 * now imports App only for the dashboard apps and calls this for the others.
 */

import { initI18n, t } from '@/services/i18n';
import { ACTIVE_APP } from '@/config/apps';
import { getAppWorkspaceLoader } from './registry';

export async function bootStandaloneApp(containerId: string): Promise<boolean> {
  const loader = getAppWorkspaceLoader(ACTIVE_APP.id);
  const container = document.getElementById(containerId);
  if (!loader || !container) return false;
  await initI18n();
  document.title = t('shell.documentTitle');
  const setMeta = (sel: string, val: string) => document.querySelector(sel)?.setAttribute('content', val);
  setMeta('meta[name="description"]', t('shell.metaDescription'));
  setMeta('meta[property="og:title"]', t('shell.documentTitle'));
  const srH1 = document.querySelector('body > h1');
  if (srH1) srH1.textContent = t('shell.documentTitle');
  const { mountAppShell } = await import('./shell');
  await mountAppShell(container, loader);
  return true;
}
