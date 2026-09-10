/**
 * Risk Sentinel — app bootstrap helpers.
 *
 * When a user first opens an app (see `src/config/apps.ts`), seed that app's
 * default panel set once so the workspace is coherent instead of inheriting an
 * arbitrary mix from the previous app.
 */

import { STORAGE_KEYS } from '@/config';
import { ACTIVE_APP } from '@/config/apps';
import type { PanelConfig } from '@/types';
import { loadFromStorage, saveToStorage } from '@/utils';

const SEED_FLAG_PREFIX = 'rs-app-seeded:';

export function seedAppDefaults(): void {
  const app = ACTIVE_APP;
  if (app.defaultPanels.length === 0) return;
  const flag = `${SEED_FLAG_PREFIX}${app.id}`;
  try {
    if (localStorage.getItem(flag) === '1') return;
  } catch {
    return;
  }

  const settings = loadFromStorage<Record<string, PanelConfig>>(STORAGE_KEYS.panels, {}) ?? {};
  for (const key of app.defaultPanels) {
    settings[key] = { ...(settings[key] ?? { name: key }), enabled: true };
  }
  saveToStorage(STORAGE_KEYS.panels, settings);
  try {
    localStorage.setItem(flag, '1');
  } catch {
    // private mode: defaults apply for this session only.
  }
}
