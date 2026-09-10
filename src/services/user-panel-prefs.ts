/**
 * Risk Sentinel — per-user panel preferences (server sync).
 *
 * localStorage stays the offline cache and the single source of truth while
 * unauthenticated. When a user session exists:
 *   - boot: hydrate localStorage from `GET /api/prefs/panels` before App init;
 *   - save: push the panel settings to the server (debounced).
 */

import { STORAGE_KEYS } from '@/config';
import type { PanelConfig } from '@/types';
import { saveToStorage } from '@/utils';
import { getAuthState } from './user-auth';

const PUSH_DEBOUNCE_MS = 1500;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

export async function hydratePanelPrefs(): Promise<void> {
  if (!getAuthState().authenticated) return;
  try {
    const res = await fetch('/api/prefs/panels', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { panels?: Record<string, PanelConfig> | null };
    if (data.panels && typeof data.panels === 'object' && !Array.isArray(data.panels)) {
      saveToStorage(STORAGE_KEYS.panels, data.panels);
    }
  } catch {
    // Offline/server error: keep the local cache and boot normally.
  }
}

export function schedulePanelPrefsPush(panels: Record<string, PanelConfig>): void {
  if (!getAuthState().authenticated) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    void pushPanelPrefs(panels);
  }, PUSH_DEBOUNCE_MS);
}

async function pushPanelPrefs(panels: Record<string, PanelConfig>): Promise<void> {
  try {
    await fetch('/api/prefs/panels', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels }),
    });
  } catch {
    // Best effort: the local cache remains authoritative until the next save.
  }
}
