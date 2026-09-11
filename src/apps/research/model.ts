/**
 * Research — user state model (notes, reading workflow, enrichment overrides,
 * imported bibliography) and source merging.
 *
 * Pure helpers (unit-tested); persistence lives in `state.ts`.
 */

import type { ResearchSource } from './types';

export type ReadingState = 'to-read' | 'reading' | 'reviewed';
export type ReadingPriority = 'low' | 'medium' | 'high';

export interface ReadingEntry {
  state?: ReadingState;
  priority?: ReadingPriority;
  tags?: string[];
}

export interface SourceOverride {
  doi?: string;
  venue?: string;
  year?: number;
  url?: string;
}

export interface ResearchState {
  notes: Record<string, string>;
  reading: Record<string, ReadingEntry>;
  overrides: Record<string, SourceOverride>;
  imported: ResearchSource[];
}

export const EMPTY_RESEARCH_STATE: ResearchState = { notes: {}, reading: {}, overrides: {}, imported: [] };

export const IMPORTED_REF_BASE = 1000;

export function nextImportedRef(imported: ResearchSource[]): number {
  const max = imported.reduce((acc, source) => Math.max(acc, Number(source.ref) || 0), IMPORTED_REF_BASE - 1);
  return max + 1;
}

export function mergeSource(source: ResearchSource, override?: SourceOverride): ResearchSource {
  if (!override) return source;
  return {
    ...source,
    doi: override.doi !== undefined ? override.doi : source.doi,
    venue: override.venue !== undefined ? override.venue : source.venue,
    year: override.year !== undefined ? override.year : source.year,
    url: override.url !== undefined ? override.url : source.url,
  };
}

export function allSources(curated: ResearchSource[], state: ResearchState): ResearchSource[] {
  return [...curated, ...(state.imported ?? [])].map((source) => mergeSource(source, state.overrides[String(source.ref)]));
}

export function readingEntry(state: ResearchState, ref: number): ReadingEntry {
  return state.reading[String(ref)] ?? {};
}

export function withReading(state: ResearchState, ref: number, patch: Partial<ReadingEntry>): ResearchState {
  const key = String(ref);
  return { ...state, reading: { ...state.reading, [key]: { ...state.reading[key], ...patch } } };
}

export function withNote(state: ResearchState, ref: number, text: string): ResearchState {
  const key = String(ref);
  const notes = { ...state.notes };
  if (text.trim()) notes[key] = text;
  else delete notes[key];
  return { ...state, notes };
}

export function withOverride(state: ResearchState, ref: number, override: SourceOverride): ResearchState {
  return { ...state, overrides: { ...state.overrides, [String(ref)]: { ...state.overrides[String(ref)], ...override } } };
}
