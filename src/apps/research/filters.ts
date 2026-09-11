/**
 * Research — bibliography search (field qualifiers) and sorting.
 *
 * Query grammar (whitespace separated, case-insensitive):
 *   author:anderson   year:2025   theme:A   type:journal   dim:tradeExposure
 *   <other words>     → free-text over title/authors/venue/summary
 *
 * Pure helpers (unit-tested).
 */

import { normalizeDimension } from './coverage';
import type { ReadingEntry } from './model';
import type { ResearchSource } from './types';

export interface ResearchQuery {
  text: string;
  author: string;
  year: string;
  theme: string;
  type: string;
  dimension: string;
  status: string;
  priority: string;
  tag: string;
}

const FIELD_PATTERN = /^(author|year|theme|type|dim|dimension|status|priority|prio|tag):(.*)$/i;

export function parseResearchQuery(input: string): ResearchQuery {
  const query: ResearchQuery = {
    text: '',
    author: '',
    year: '',
    theme: '',
    type: '',
    dimension: '',
    status: '',
    priority: '',
    tag: '',
  };
  const free: string[] = [];
  for (const token of String(input ?? '').trim().split(/\s+/).filter(Boolean)) {
    const match = FIELD_PATTERN.exec(token);
    if (!match) {
      free.push(token.toLowerCase());
      continue;
    }
    const [rawField = '', rawValue = ''] = match.slice(1);
    const field = rawField.toLowerCase();
    const value = rawValue.toLowerCase();
    if (field === 'author') query.author = value;
    else if (field === 'year') query.year = value;
    else if (field === 'theme') query.theme = value.toUpperCase();
    else if (field === 'type') query.type = value;
    else if (field === 'status') query.status = value;
    else if (field === 'priority' || field === 'prio') query.priority = value;
    else if (field === 'tag') query.tag = value;
    else query.dimension = value;
  }
  query.text = free.join(' ');
  return query;
}

export function matchesResearchQuery(
  source: ResearchSource,
  query: ResearchQuery,
  reading?: ReadingEntry,
): boolean {
  if (query.author && !source.authors.toLowerCase().includes(query.author)) return false;
  if (query.year && String(source.year) !== query.year) return false;
  if (query.theme && source.themeArea.toUpperCase() !== query.theme) return false;
  if (query.type && source.type.toLowerCase() !== query.type) return false;
  if (query.status && (reading?.state ?? '') !== query.status) return false;
  if (query.priority && (reading?.priority ?? '') !== query.priority) return false;
  if (query.tag && !(reading?.tags ?? []).some((tag) => tag.toLowerCase().includes(query.tag))) return false;
  if (query.dimension) {
    const wanted = normalizeDimension(query.dimension) ?? query.dimension;
    const has = (source.dimensions ?? []).some((raw) => (normalizeDimension(raw) ?? raw) === wanted);
    if (!has) return false;
  }
  if (query.text) {
    const haystack = `${source.title} ${source.authors} ${source.venue} ${source.summary} ${source.contribution}`.toLowerCase();
    for (const term of query.text.split(/\s+/)) {
      if (!haystack.includes(term)) return false;
    }
  }
  return true;
}

export type SortKey = 'ref' | 'year' | 'authors' | 'title' | 'venue' | 'themeArea';
export type SortDirection = 'asc' | 'desc';

export function sortSources(sources: ResearchSource[], key: SortKey, direction: SortDirection): ResearchSource[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...sources].sort((a, b) => {
    const left = key === 'year' || key === 'ref' ? a[key] : String(a[key]).toLowerCase();
    const right = key === 'year' || key === 'ref' ? b[key] : String(b[key]).toLowerCase();
    if (left < right) return -1 * factor;
    if (left > right) return 1 * factor;
    return 0;
  });
}
