/**
 * Research — persistence of the per-user research state.
 *
 * Loads from `GET /api/prefs/research` at boot and pushes changes with a
 * debounce (localStorage stays only as a crash buffer, cleared on logout).
 */

import { EMPTY_RESEARCH_STATE, type ResearchState } from './model';

const SAVE_DEBOUNCE_MS = 1200;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function normalize(raw: unknown): ResearchState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_RESEARCH_STATE };
  const value = raw as Partial<ResearchState>;
  return {
    notes: value.notes && typeof value.notes === 'object' ? value.notes : {},
    reading: value.reading && typeof value.reading === 'object' ? value.reading : {},
    overrides: value.overrides && typeof value.overrides === 'object' ? value.overrides : {},
    imported: Array.isArray(value.imported) ? value.imported : [],
  };
}

export async function loadResearchState(): Promise<ResearchState> {
  try {
    const res = await fetch('/api/prefs/research', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { ...EMPTY_RESEARCH_STATE };
    const data = (await res.json()) as { research?: unknown };
    return normalize(data.research);
  } catch {
    return { ...EMPTY_RESEARCH_STATE };
  }
}

export function scheduleResearchStateSave(state: ResearchState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void persistResearchState(state);
  }, SAVE_DEBOUNCE_MS);
}

export async function persistResearchState(state: ResearchState): Promise<boolean> {
  try {
    const res = await fetch('/api/prefs/research', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ research: state }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
