/**
 * Risk Sentinel — per-user panel preferences (server sync).
 *
 * localStorage stays the offline cache and the single source of truth while
 * unauthenticated. When a user session exists:
 *   - boot: hydrate localStorage from `GET /api/prefs/panels` before App init;
 *   - save: push the panel settings to the server (debounced, plus a final
 *     `pagehide` flush with keepalive so a quick toggle + reload is not lost).
 *
 * Every snapshot carries an `updatedAt` stamp on both sides: a server copy older
 * than the local edits (a push lost to a reload, an offline session, an old
 * service-worker bundle) can no longer overwrite the local layout and resurrect
 * hidden panels — the local state is pushed instead.
 */

import { STORAGE_KEYS } from '@/config';
import type { PanelConfig } from '@/types';
import { loadFromStorage, saveToStorage } from '@/utils';
import { getAuthState } from './user-auth';

const PUSH_DEBOUNCE_MS = 1500;
const LOCAL_STAMP_KEY = 'rs-panel-prefs-updated-at';
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pendingPanels: Record<string, PanelConfig> | null = null;

function readLocalStamp(): string | null {
  try {
    return localStorage.getItem(LOCAL_STAMP_KEY);
  } catch {
    return null;
  }
}

function writeLocalStamp(value: string): void {
  try {
    localStorage.setItem(LOCAL_STAMP_KEY, value);
  } catch {
    // private mode: stamping is best-effort
  }
}

function isPanelMap(value: unknown): value is Record<string, PanelConfig> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

export async function hydratePanelPrefs(): Promise<void> {
  if (!getAuthState().authenticated) return;
  try {
    const res = await fetch('/api/prefs/panels', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { panels?: Record<string, PanelConfig> | null; updatedAt?: string | null };
    const serverPanels = data.panels;
    if (!isPanelMap(serverPanels)) return;

    const serverStamp = typeof data.updatedAt === 'string' ? data.updatedAt : null;
    const localPanels = loadFromStorage<Record<string, PanelConfig>>(STORAGE_KEYS.panels, {}) ?? {};
    const localStamp = readLocalStamp();
    const serverIsOlder =
      isPanelMap(localPanels) &&
      localStamp !== null &&
      (serverStamp === null || Date.parse(localStamp) > Date.parse(serverStamp));

    if (serverIsOlder) {
      // The local layout is newer than the stored one: keep it and re-sync,
      // instead of adopting a snapshot that would bring hidden panels back.
      void pushPanelPrefs(localPanels);
      return;
    }

    saveToStorage(STORAGE_KEYS.panels, serverPanels);
    if (serverStamp) writeLocalStamp(serverStamp);
  } catch {
    // Offline/server error: keep the local cache and boot normally.
  }
}

export function schedulePanelPrefsPush(panels: Record<string, PanelConfig>): void {
  if (!getAuthState().authenticated) return;
  pendingPanels = panels;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    void pushPanelPrefs(panels);
  }, PUSH_DEBOUNCE_MS);
}

async function pushPanelPrefs(panels: Record<string, PanelConfig>): Promise<void> {
  const updatedAt = new Date().toISOString();
  try {
    const res = await fetch('/api/prefs/panels', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels, updatedAt }),
    });
    if (!res.ok) {
      console.warn('[PanelPrefs] push rejected:', res.status, await res.text().catch(() => ''));
      return;
    }
    writeLocalStamp(updatedAt);
  } catch (error) {
    // Best effort: the local cache remains authoritative until the next save.
    console.warn('[PanelPrefs] push failed:', error);
  }
}

/**
 * Flush a pending push when the page is being hidden/closed. `fetch(keepalive)`
 * survives the unload, unlike the debounced timer which would be discarded.
 */
function flushPendingPush(): void {
  if (!pendingPanels) return;
  const panels = pendingPanels;
  pendingPanels = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = undefined;
  }
  const updatedAt = new Date().toISOString();
  writeLocalStamp(updatedAt);
  try {
    void fetch('/api/prefs/panels', {
      method: 'PUT',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels, updatedAt }),
    });
  } catch {
    // Nothing else to do during unload.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingPush);
  window.addEventListener('beforeunload', flushPendingPush);
}
