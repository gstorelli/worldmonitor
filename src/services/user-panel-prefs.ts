/**
 * Risk Sentinel — per-user panel preferences (server sync).
 *
 * localStorage stays the offline cache and the single source of truth while
 * unauthenticated. When a user session exists:
 *   - boot: hydrate localStorage from `GET /api/prefs/panels` before App init;
 *   - save: push the panel settings to the server (debounced, plus a final
 *     `pagehide` flush with keepalive so a quick toggle + reload is not lost).
 */

import { STORAGE_KEYS } from '@/config';
import type { PanelConfig } from '@/types';
import { saveToStorage } from '@/utils';
import { getAuthState } from './user-auth';

const PUSH_DEBOUNCE_MS = 1500;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pendingPanels: Record<string, PanelConfig> | null = null;

export async function hydratePanelPrefs(): Promise<void> {
  if (!getAuthState().authenticated) return;
  try {
    const res = await fetch('/api/prefs/panels', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { panels?: Record<string, PanelConfig> | null };
    // An empty object is treated as "no server snapshot": a wiped server record
    // must not erase the operator's local layout.
    if (
      data.panels &&
      typeof data.panels === 'object' &&
      !Array.isArray(data.panels) &&
      Object.keys(data.panels).length > 0
    ) {
      saveToStorage(STORAGE_KEYS.panels, data.panels);
    }
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
  try {
    const res = await fetch('/api/prefs/panels', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels }),
    });
    if (!res.ok) {
      console.warn('[PanelPrefs] push rejected:', res.status, await res.text().catch(() => ''));
    }
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
  try {
    void fetch('/api/prefs/panels', {
      method: 'PUT',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels }),
    });
  } catch {
    // Nothing else to do during unload.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingPush);
  window.addEventListener('beforeunload', flushPendingPush);
}
