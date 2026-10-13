/**
 * Research — bibliography search (field qualifiers) and sorting.
 *
 * Query grammar (whitespace separated, case-insensitive):
 *   author:anderson   year:2025   layer:trigger (or layer:innesco)   type:journal
 *   verif:T           status:reviewed   prio:high   tag:customs
 *   <other words>     → free-text over title/authors/venue/summary/bib key
 * (`theme:` is kept as an alias of `layer:`; the v0 `dim:` qualifier was removed
 * with the 8-dimension matrix on 13/10/2026.)
 *
 * Pure helpers (unit-tested).
 */

import { resolveLayer, sourceLayers } from './layers';
import type { ReadingEntry } from './model';
import type { ResearchSource } from './types';

export interface ResearchQuery {
  text: string;
  author: string;
  year: string;
  layer: string;
  type: string;
  verification: string;
  status: string;
  priority: string;
  tag: string;
}

const FIELD_PATTERN = /^(author|year|layer|theme|type|verif|verification|status|priority|prio|tag):(.*)$/i;

export function parseResearchQuery(input: string): ResearchQuery {
  const query: ResearchQuery = {
    text: '',
    author: '',
    year: '',
    layer: '',
    type: '',
    verification: '',
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
    else if (field === 'layer' || field === 'theme') query.layer = resolveLayer(value) ?? value;
    else if (field === 'type') query.type = value;
    else if (field === 'verif' || field === 'verification') query.verification = value.toUpperCase();
    else if (field === 'status') query.status = value;
    else if (field === 'priority' || field === 'prio') query.priority = value;
    else if (field === 'tag') query.tag = value;
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
  if (query.layer && !sourceLayers(source).includes(query.layer)) return false;
  if (query.verification && String(source.verification ?? '').toUpperCase() !== query.verification) return false;
  if (query.type && source.type.toLowerCase() !== query.type) return false;
  if (query.status && (reading?.state ?? '') !== query.status) return false;
  if (query.priority && (reading?.priority ?? '') !== query.priority) return false;
  if (query.tag && !(reading?.tags ?? []).some((tag) => tag.toLowerCase().includes(query.tag))) return false;
  if (query.text) {
    const haystack = `${source.title} ${source.authors} ${source.venue} ${source.summary ?? ''} ${source.key ?? ''}`.toLowerCase();
    for (const term of query.text.split(/\s+/)) {
      if (!haystack.includes(term)) return false;
    }
  }
  return true;
}

export type SortKey = 'ref' | 'year' | 'authors' | 'title' | 'venue' | 'layers';
export type SortDirection = 'asc' | 'desc';

export function sortSources(sources: ResearchSource[], key: SortKey, direction: SortDirection): ResearchSource[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...sources].sort((a, b) => {
    const value = (source: ResearchSource) =>
      key === 'year' || key === 'ref'
        ? source[key]
        : key === 'layers'
          ? sourceLayers(source).join(' ')
          : String(source[key] ?? '').toLowerCase();
    const left = value(a);
    const right = value(b);
    if (left < right) return -1 * factor;
    if (left > right) return 1 * factor;
    return 0;
  });
}
