/**
 * Research — BibTeX/RIS import parsers.
 *
 * Tolerant, dependency-free parsers for pasting bibliography exports into the
 * workbench. They return partial sources; `assignRefs` gives them stable ids
 * above IMPORTED_REF_BASE. Pure helpers (unit-tested).
 */

import { IMPORTED_REF_BASE, nextImportedRef } from './model';
import type { ResearchSource } from './types';

export interface ParsedSource {
  authors: string;
  year: number;
  title: string;
  type: string;
  venue: string;
  doi: string | null;
  url: string;
}

const BIBTEX_TYPE_MAP: Record<string, string> = {
  article: 'journal',
  inproceedings: 'conference',
  conference: 'conference',
  proceedings: 'conference',
  techreport: 'report',
  report: 'report',
  phdthesis: 'report',
  mastersthesis: 'report',
  book: 'book',
  misc: 'preprint',
  software: 'software',
  online: 'webpage',
};

const RIS_TYPE_MAP: Record<string, string> = {
  JOUR: 'journal',
  CPAPER: 'conference',
  CONF: 'conference',
  RPRT: 'report',
  UNPB: 'preprint',
  COMP: 'software',
  BOOK: 'book',
  ELEC: 'webpage',
  WEB: 'webpage',
};

function scanEntries(text: string): string[] {
  const entries: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf('@', cursor);
    if (at === -1) break;
    const brace = text.indexOf('{', at);
    if (brace === -1) break;
    let depth = 0;
    let end = brace;
    for (; end < text.length; end += 1) {
      if (text[end] === '{') depth += 1;
      else if (text[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    entries.push(text.slice(at, end + 1));
    cursor = end + 1;
  }
  return entries;
}

function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const pattern = /(\w+)\s*=\s*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    const cursor = pattern.lastIndex;
    const char = body[cursor];
    let value = '';
    if (char === '{') {
      let depth = 0;
      let end = cursor;
      for (; end < body.length; end += 1) {
        if (body[end] === '{') depth += 1;
        else if (body[end] === '}') {
          depth -= 1;
          if (depth === 0) {
            end += 1;
            break;
          }
        }
      }
      value = body.slice(cursor + 1, end - 1);
      pattern.lastIndex = end;
    } else if (char === '"') {
      const end = body.indexOf('"', cursor + 1);
      value = body.slice(cursor + 1, end === -1 ? body.length : end);
      pattern.lastIndex = end === -1 ? body.length : end + 1;
    } else {
      const end = body.indexOf(',', cursor);
      const stop = end === -1 ? body.length : end;
      value = body.slice(cursor, stop);
      pattern.lastIndex = stop;
    }
    const fieldName = match[1];
    if (!fieldName) continue;
    fields[fieldName.toLowerCase()] = value
      .replace(/\s+/g, ' ')
      .replace(/[{}]/g, '')
      .trim();
  }
  return fields;
}

export function parseBibtex(text: string): ParsedSource[] {
  const parsed: ParsedSource[] = [];
  for (const entry of scanEntries(text)) {
    const header = /^@(\w+)\s*\{([^,]*),/.exec(entry);
    if (!header) continue;
    const [headerText = '', headerType = ''] = header;
    const fields = parseFields(entry.slice(headerText.length - 1));
    if (!fields.title) continue;
    parsed.push({
      authors: (fields.author || '').split(/\s+and\s+/i).map((author) => author.trim()).filter(Boolean).join('; '),
      year: Number.parseInt(fields.year || fields.date || '', 10) || 0,
      title: fields.title,
      type: BIBTEX_TYPE_MAP[headerType.toLowerCase()] ?? 'preprint',
      venue: fields.journal || fields.booktitle || fields.institution || fields.publisher || '',
      doi: fields.doi || null,
      url: fields.url || '',
    });
  }
  return parsed;
}

export function parseRis(text: string): ParsedSource[] {
  const parsed: ParsedSource[] = [];
  for (const record of text.split(/\nER\s{2}-[^\n]*\n?/)) {
    if (!record.trim()) continue;
    const authors: string[] = [];
    let title = '';
    let year = 0;
    let venue = '';
    let doi: string | null = null;
    let url = '';
    let type = 'preprint';
    for (const line of record.split(/\r?\n/)) {
      const match = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/.exec(line);
      if (!match) continue;
      const [tag = '', value = ''] = match.slice(1);
      if (tag === 'AU') authors.push(value.trim());
      else if (tag === 'TI' && !title) title = value.trim();
      else if (tag === 'PY') year = Number.parseInt(value, 10) || year;
      else if (tag === 'JO' || tag === 'T2' || tag === 'JF') venue = venue || value.trim();
      else if (tag === 'DO') doi = value.trim() || null;
      else if (tag === 'UR') url = value.trim();
      else if (tag === 'TY') type = RIS_TYPE_MAP[value.trim()] ?? 'preprint';
    }
    if (title) parsed.push({ authors: authors.join('; '), year, title, type, venue, doi, url });
  }
  return parsed;
}

export function parseBibliography(text: string): ParsedSource[] {
  if (/@\w+\s*\{/.test(text)) return parseBibtex(text);
  if (/^TY\s{2}-/m.test(text)) return parseRis(text);
  return [];
}

/** Convert parsed entries into ResearchSource records with unique refs. */
export function assignRefs(parsed: ParsedSource[], existing: ResearchSource[]): ResearchSource[] {
  let nextRef = Math.max(nextImportedRef(existing), IMPORTED_REF_BASE);
  return parsed.map((entry) => ({
    ref: nextRef++,
    authors: entry.authors,
    year: entry.year,
    title: entry.title,
    type: entry.type,
    venue: entry.venue,
    doi: entry.doi,
    url: entry.url,
    themeArea: '',
    summary: '',
    limitation: '',
    contribution: '',
    dimensions: [],
    verified: false,
  }));
}
