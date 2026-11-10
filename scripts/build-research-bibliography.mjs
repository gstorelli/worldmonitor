#!/usr/bin/env node
// Build the Research bibliography (data/zotero-sources.json and its Edge mirror
// api/zotero/_sources-data.js) from the thesis repository (13/10/2026).
//
//   node scripts/build-research-bibliography.mjs \
//     ../risk-sentinel-thesis/thesis/references.bib \
//     ../risk-sentinel-thesis/docs/FONTI_VERIFICATE.md
//
// Source of truth: thesis/references.bib (metadata) and docs/FONTI_VERIFICATE.md
// (which sources were verified, how, and in which section of the register). The
// thesis repository is private and this one is public, so ONLY bibliographic
// metadata, the model layer and the verification level (T/P/S) are copied. The
// "Verificato" notes of the register stay private (Giuseppe's choice, 13/10).
// Sources listed under "Da non usare" are left out.
//
// Refs are stable: an entry that already exists in data/zotero-sources.json (same
// bib key, DOI or title) keeps its ref, so per-user notes and reading states
// (keyed by ref) stay attached; new entries get the next free refs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = resolve(ROOT, 'data/zotero-sources.json');
const OUT_MIRROR = resolve(ROOT, 'api/zotero/_sources-data.js');

// Register section -> layers of the six-layer model (plus method/platform).
export const SECTION_LAYERS = {
  'Pericoli, cataloghi e metodi sismologici': ['trigger'],
  'Geologia dei nodi produttivi': ['node'],
  'Nodi, commercio e beni strategici': ['node', 'good'],
  'Criticità UE e misure (modulatori)': ['supply', 'modulator'],
  'Dogana e IA per le dogane': ['customs'],
  Metodo: ['method'],
};
const EXCLUDED_SECTIONS = new Set(['Da non usare']);
const UNVERIFIED_SECTIONS = new Set(['Candidati da verificare prima di usarli']);

// ── BibTeX ──────────────────────────────────────────────────────────────────
function readBraced(text, start) {
  // text[start] is '{' or '"'; returns [value, endIndex].
  const open = text[start];
  if (open === '"') {
    const end = text.indexOf('"', start + 1);
    return [text.slice(start + 1, end), end + 1];
  }
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return [text.slice(start + 1, i), i + 1];
    }
  }
  throw new Error(`unbalanced braces at ${start}`);
}

export function parseBibtex(text) {
  const entries = [];
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let match;
  while ((match = re.exec(text))) {
    const type = match[1].toLowerCase();
    const key = match[2];
    let i = re.lastIndex;
    const fields = {};
    for (;;) {
      while (i < text.length && /[\s,]/.test(text[i])) i++;
      if (text[i] === '}' || i >= text.length) break;
      const fm = /^(\w+)\s*=\s*/.exec(text.slice(i));
      if (!fm) break;
      const name = fm[1].toLowerCase();
      i += fm[0].length;
      let value;
      if (text[i] === '{' || text[i] === '"') [value, i] = readBraced(text, i);
      else {
        const vm = /^[^,}\s]+/.exec(text.slice(i));
        value = vm ? vm[0] : '';
        i += value.length;
      }
      fields[name] = value;
    }
    re.lastIndex = i;
    entries.push({ type, key, fields });
  }
  return entries;
}

const ACCENTS = { '"': '\u0308', "'": '\u0301', '`': '\u0300', '^': '\u0302', '~': '\u0303', '=': '\u0304', '.': '\u0307', u: '\u0306', v: '\u030C', H: '\u030B', c: '\u0327', k: '\u0328' };

export function cleanLatex(value) {
  return String(value ?? '')
    // \"{a}, \"a, \'{e}, \v{s}, \c{c} ... -> combining marks, then NFC.
    .replace(/\\(["'`^~=.])\{?([A-Za-z])\}?/g, (_, mark, ch) => ch + ACCENTS[mark])
    .replace(/\\([uvHck])\{([A-Za-z])\}/g, (_, mark, ch) => ch + ACCENTS[mark])
    .replace(/\\ss\{?\}?/g, 'ß')
    .replace(/\\l\b\{?\}?/g, 'ł').replace(/\\L\b\{?\}?/g, 'Ł').replace(/\\o\b\{?\}?/g, 'ø').replace(/\\aa\b\{?\}?/g, 'å')
    .replace(/\\url\{([^}]*)\}/g, '$1')
    .replace(/\\textendash\{?\}?/g, '–')
    .replace(/\\textemdash\{?\}?/g, '—')
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\_/g, '_')
    .replace(/--/g, '–')
    .replace(/~/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
}

function initials(given) {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.split('-').map((p) => `${p[0]}.`).join('-'))
    .join(' ');
}

/** BibTeX author list -> "Family, I.; Family, I." (corporate names kept whole). */
export function formatAuthors(raw) {
  return String(raw ?? '')
    .split(/\s+and\s+/)
    .map((author) => author.trim())
    .filter(Boolean)
    .map((author) => {
      if (/^\{.*\}$/.test(author)) return cleanLatex(author); // corporate author
      const clean = cleanLatex(author);
      if (clean.includes(',')) {
        const [family, given = ''] = clean.split(',').map((s) => s.trim());
        return given ? `${family}, ${initials(given)}` : family;
      }
      const parts = clean.split(/\s+/);
      const family = parts.pop() ?? clean;
      return parts.length ? `${family}, ${initials(parts.join(' '))}` : family;
    })
    .join('; ');
}

function sourceType(entry) {
  const how = cleanLatex(entry.fields.howpublished || entry.fields.note || '');
  if (entry.type === 'article') return 'journal';
  if (entry.type === 'inproceedings' || entry.type === 'incollection') return 'conference';
  if (entry.type === 'book' || entry.type === 'techreport') return 'report';
  if (/arxiv/i.test(how)) return 'preprint';
  if (/^\{.*\}$/.test(String(entry.fields.author ?? '').trim())) return 'institutional';
  return 'report';
}

function sourceUrl(entry) {
  const how = String(entry.fields.howpublished ?? '');
  const fromHow = /\\url\{([^}]*)\}/.exec(how)?.[1];
  if (entry.fields.url) return cleanLatex(entry.fields.url);
  if (fromHow) return fromHow;
  if (entry.fields.doi) return `https://doi.org/${cleanLatex(entry.fields.doi)}`;
  const arxiv = /arXiv:(\d{4}\.\d{4,5})/i.exec(`${how} ${entry.fields.note ?? ''}`)?.[1];
  return arxiv ? `https://arxiv.org/abs/${arxiv}` : '';
}

function sourceVenue(entry) {
  const f = entry.fields;
  const how = /\\url\{/.test(f.howpublished ?? '') ? '' : f.howpublished;
  return cleanLatex(f.journal || f.booktitle || f.publisher || how || f.institution || '');
}

// ── Register (docs/FONTI_VERIFICATE.md) ─────────────────────────────────────
export function parseRegister(markdown, bibKeys) {
  const byKey = new Map();
  let section = null;
  for (const line of String(markdown).split('\n')) {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      continue;
    }
    if (!section || !line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 2 || /^-+$/.test(cells[0].replace(/[:\s]/g, ''))) continue;
    const keys = [...cells[0].matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((k) => bibKeys.has(k));
    // "Come": T = full text, P = publisher/catalogue/abstract, S = secondary
    // copy, API = figures extracted from the source's own data service.
    // A full export of the source's database ("Export completo", TARIC) counts as API.
    const how = /^export\b/i.test(cells[2] ?? '') ? 'API' : (/^(API|T|P|S)\b/.exec(cells[2] ?? '')?.[1] ?? null);
    for (const key of keys) {
      const prev = byKey.get(key);
      const rank = { T: 4, API: 3, P: 2, S: 1 };
      const best = prev?.how && (!how || rank[prev.how] >= rank[how]) ? prev.how : how;
      byKey.set(key, { sections: [...new Set([...(prev?.sections ?? []), section])], how: best });
    }
  }
  return byKey;
}

const normTitle = (t) => cleanLatex(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function buildSources(entries, register, previous = []) {
  const prevByKey = new Map(previous.filter((s) => s.key).map((s) => [s.key, s]));
  const prevByDoi = new Map(previous.filter((s) => s.doi).map((s) => [String(s.doi).toLowerCase(), s]));
  const prevByTitle = new Map(previous.map((s) => [normTitle(s.title), s]));
  let nextRef = Math.max(0, ...previous.map((s) => Number(s.ref) || 0)) + 1;
  const out = [];
  for (const entry of entries) {
    const reg = register.get(entry.key);
    if (reg?.sections.some((s) => EXCLUDED_SECTIONS.has(s))) continue;
    const doi = entry.fields.doi ? cleanLatex(entry.fields.doi) : null;
    const title = cleanLatex(entry.fields.title);
    const prev = prevByKey.get(entry.key)
      ?? (doi ? prevByDoi.get(doi.toLowerCase()) : undefined)
      ?? prevByTitle.get(normTitle(title));
    const layers = [...new Set((reg?.sections ?? []).flatMap((s) => SECTION_LAYERS[s] ?? []))];
    const verified = Boolean(reg) && !reg.sections.every((s) => UNVERIFIED_SECTIONS.has(s));
    out.push({
      ref: prev?.ref ?? nextRef++,
      key: entry.key,
      authors: formatAuthors(entry.fields.author),
      year: Number.parseInt(cleanLatex(entry.fields.year), 10) || 0,
      title,
      type: sourceType(entry),
      venue: sourceVenue(entry),
      doi,
      url: sourceUrl(entry),
      layers: layers.length ? layers : ['platform'],
      verified,
      verification: verified ? reg.how : null,
      // Public reading summaries already published before 13/10 are kept.
      summary: prev?.summary ?? '',
      limitation: prev?.limitation ?? '',
    });
  }
  return out.sort((a, b) => a.ref - b.ref);
}

function main() {
  const [bibPath, registerPath] = process.argv.slice(2);
  if (!bibPath || !registerPath) {
    console.error('usage: build-research-bibliography.mjs <references.bib> <FONTI_VERIFICATE.md>');
    process.exit(2);
  }
  const entries = parseBibtex(readFileSync(bibPath, 'utf8'));
  const register = parseRegister(readFileSync(registerPath, 'utf8'), new Set(entries.map((e) => e.key)));
  const previous = JSON.parse(readFileSync(OUT_JSON, 'utf8')).sources ?? [];
  const sources = buildSources(entries, register, previous);
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    $comment:
      'Generated by scripts/build-research-bibliography.mjs from the thesis repository (thesis/references.bib + docs/FONTI_VERIFICATE.md). Do not edit by hand. Only metadata, model layer and verification level (T = full text read, API = figures from the data service of the source, P = publisher/catalogue/abstract, S = secondary copy) are published; the verification notes stay in the private thesis repository. Sources marked "Da non usare" are omitted.',
    schema_version: 2,
    updated_at: today,
    sources,
  };
  writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(
    OUT_MIRROR,
    '// Edge-compatible ESM literal mirror (no node: built-ins, no JSON import attributes).\n'
      + '// Source of truth: data/zotero-sources.json\n'
      + '// Regenerate when the JSON changes; tests/api-data-mirrors.test.mjs enforces parity.\n'
      + `export default ${JSON.stringify(sources, null, 2)};\n`,
  );
  const verified = sources.filter((s) => s.verified).length;
  console.log(`research bibliography: ${sources.length} sources (${verified} verified), ${entries.length - sources.length} excluded`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
