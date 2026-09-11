/**
 * Research — conference / call-for-papers calendar (WIP).
 *
 * Curated recurring venues in `calls.json`; a live CFP feed is planned.
 * Pure helpers (unit-tested).
 */

import callsData from './calls.json';

export interface CallForPapers {
  id: string;
  name: string;
  scope: string;
  themes: string[];
  typicalWindow: string;
  deadline: string | null;
  location: string;
  url: string;
  notes: string;
}

export const CALLS_UPDATED_AT: string = callsData.updated_at;

export function listCalls(): CallForPapers[] {
  return Array.isArray(callsData.calls) ? callsData.calls : [];
}

export function daysUntil(deadline: string | null, now: Date = new Date()): number | null {
  if (!deadline) return null;
  const target = new Date(`${deadline}T23:59:59Z`);
  if (Number.isNaN(target.getTime())) return null;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfDeadline = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((startOfDeadline - startOfToday) / (24 * 3600 * 1000));
}

export function callsForThemes(themes: string[], now: Date = new Date()): CallForPapers[] {
  const wanted = new Set(themes);
  return listCalls()
    .filter((call) => wanted.size === 0 || call.themes.some((theme) => wanted.has(theme)))
    .sort((a, b) => {
      const left = daysUntil(a.deadline, now);
      const right = daysUntil(b.deadline, now);
      if (left !== null && right !== null) return left - right;
      if (left !== null) return -1;
      if (right !== null) return 1;
      return a.name.localeCompare(b.name);
    });
}
