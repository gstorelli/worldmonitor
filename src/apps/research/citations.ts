/**
 * Research — bibliographic citation formatting.
 *
 * Pure helpers (unit-tested) that turn the curated literature-review entries
 * into citable artefacts: APA strings, BibTeX entries/collections, RIS records
 * and CSV. No DOM, no network.
 */

import type { ResearchSource } from './types';

const BIBTEX_TYPE: Record<string, string> = {
  journal: 'article',
  conference: 'inproceedings',
  report: 'techreport',
  preprint: 'misc',
  institutional: 'misc',
  software: 'misc',
};

const RIS_TYPE: Record<string, string> = {
  journal: 'JOUR',
  conference: 'CPAPER',
  report: 'RPRT',
  preprint: 'UNPB',
  institutional: 'RPRT',
  software: 'COMP',
};

/** Split an author string ("Anderson, D.; Belcineanu, A.") into individuals. */
export function splitAuthors(authors: string): string[] {
  return String(authors ?? '')
    .split(';')
    .map((author) => author.trim())
    .filter(Boolean);
}

/** First author's family name used as the citation-key prefix. */
export function firstAuthorToken(authors: string): string {
  const first = splitAuthors(authors)[0] ?? 'anon';
  const beforeComma = first.split(',')[0]?.trim() || first;
  return beforeComma
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase() || 'anon';
}

/** Stable-ish BibTeX key: `<author><year><firstTitleWord>`, e.g. `european2024customs`. */
export function citationKey(source: ResearchSource): string {
  const word = String(source.title ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .find((token) => token.length > 3);
  return `${firstAuthorToken(source.authors)}${source.year}${(word ?? 'source').toLowerCase()}`;
}

/** APA 7-ish: `Authors (Year). Title. Venue. https://doi.org/...` */
export function formatApa(source: ResearchSource): string {
  const authors = splitAuthors(source.authors).join('; ') || 'Anonimo';
  const parts = [`${authors} (${source.year}). ${source.title}.`];
  if (source.venue) parts.push(`${source.venue}.`);
  if (source.doi) parts.push(`https://doi.org/${source.doi}`);
  else if (source.url) parts.push(source.url);
  return parts.join(' ');
}

function escapeBibtex(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_])/g, '\\$1')
    .replace(/[{}]/g, (match) => `\\${match}`);
}

export function formatBibtex(source: ResearchSource): string {
  const entryType = BIBTEX_TYPE[source.type] ?? 'misc';
  const authors = splitAuthors(source.authors).join(' and ');
  const venueField = entryType === 'article' ? 'journal' : entryType === 'inproceedings' ? 'booktitle' : 'institution';
  const lines: string[] = [
    `@${entryType}{${citationKey(source)},`,
    `  author    = {${escapeBibtex(authors)}},`,
    `  title     = {${escapeBibtex(source.title)}},`,
    `  year      = {${source.year}},`,
  ];
  if (source.venue) lines.push(`  ${venueField} = {${escapeBibtex(source.venue)}},`);
  if (source.doi) lines.push(`  doi       = {${escapeBibtex(source.doi)}},`);
  if (source.url) lines.push(`  url       = {${escapeBibtex(source.url)}},`);
  lines.push(`  note      = {Risk Sentinel literature review — theme ${source.themeArea}}`);
  lines.push('}');
  return lines.join('\n');
}

export function formatRis(source: ResearchSource): string {
  const lines: string[] = [`TY  - ${RIS_TYPE[source.type] ?? 'GEN'}`];
  for (const author of splitAuthors(source.authors)) lines.push(`AU  - ${author}`);
  lines.push(`TI  - ${source.title}`);
  lines.push(`PY  - ${source.year}`);
  if (source.venue) lines.push(`JO  - ${source.venue}`);
  if (source.doi) lines.push(`DO  - ${source.doi}`);
  if (source.url) lines.push(`UR  - ${source.url}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

export function toBibtexCollection(sources: ResearchSource[]): string {
  return sources.map(formatBibtex).join('\n\n');
}

export function toRisCollection(sources: ResearchSource[]): string {
  return sources.map(formatRis).join('\n\n');
}

function csvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? '');
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function toCsv(sources: ResearchSource[]): string {
  const header = ['ref', 'authors', 'year', 'title', 'type', 'venue', 'doi', 'url', 'themeArea', 'dimensions', 'verified'];
  const rows = sources.map((source) =>
    [
      source.ref,
      source.authors,
      source.year,
      source.title,
      source.type,
      source.venue,
      source.doi ?? '',
      source.url,
      source.themeArea,
      (source.dimensions ?? []).join(' '),
      source.verified ? 'yes' : 'no',
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}
