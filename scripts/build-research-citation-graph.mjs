#!/usr/bin/env node
// Build the Research citation graph (data/research-citations.json and its Edge
// mirror api/zotero/_citations-data.js) from the private thesis repository.
//
//   node scripts/build-research-citation-graph.mjs [--check] [--out-dir <dir>] <thesis-repo-root>
//
// Inputs (relative to <thesis-repo-root>): thesis/chapters/ch0*.tex,
// literature-review/literature_review.tex, thesis/references.bib.
//
// The thesis repository is private and this one is public, so ONLY these fields
// are published: bib keys, document id (ch01.. / lr), section NUMBER ids
// ("3.6.2", "S3.3", "A"; an unnumbered section gets the enclosing number + '*'),
// and for the placeholders (\PH..., [SOURCE NEEDED ...], [VERIFY ...]) only the
// macro kind and the code given as first argument (e.g. "P3-17"). No section
// title, label, placeholder text or sentence of the thesis is published; doing
// so needs Giuseppe's explicit OK.
//
// The output is deterministic (no dates): --check rebuilds in memory and exits 1
// when the committed files differ (stale graph).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBibtex } from './build-research-bibliography.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = resolve(ROOT, 'data/research-citations.json');
const OUT_MIRROR = resolve(ROOT, 'api/zotero/_citations-data.js');

// Placeholder macros of thesis/main.tex; the kind published is the macro name.
export const PLACEHOLDER_KINDS = ['PH', 'PHyeartwo', 'PHfield', 'PHsource', 'PHverify', 'PHcode', 'SOURCE NEEDED', 'VERIFY'];
// A placeholder code ("P3-17", "LR-01"); anything else is not published.
const CODE_RE = /^[A-Z]{1,3}\d*-\d{1,3}[a-z]?$/;

const LEVELS = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };

// ── LaTeX helpers ───────────────────────────────────────────────────────────
function stripComments(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/(^|[^\\])%.*$/, '$1'))
    .join('\n');
}

/** Body between \begin{document} and \end{document}, or the whole file (chapters). */
function documentBody(text) {
  const begin = text.indexOf('\\begin{document}');
  const body = begin >= 0 ? text.slice(begin + '\\begin{document}'.length) : text;
  const end = body.indexOf('\\end{document}');
  return end >= 0 ? body.slice(0, end) : body;
}

/** Reads a group opened at text[start] ('{' or '['); returns [content, endIndex] or null. */
function readGroup(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return [text.slice(start + 1, i), i + 1];
    }
  }
  return null;
}

function skipSpace(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

const toLetter = (n) => String.fromCharCode(64 + n);

// ── Parser ──────────────────────────────────────────────────────────────────
/**
 * Scans one document. `chapter` is the chapter number for ch0X files (the
 * literature review has no chapter). Returns cites ({key, doc, section}) and
 * placeholders ({doc, section, kind, code}), both in document order.
 */
export function parseTexDocument(source, { doc, chapter = null }) {
  const text = documentBody(stripComments(source));
  const counters = [chapter ?? 0, 0, 0, 0];
  let appendix = false;
  const numberOf = (level) => {
    const parts = [];
    const first = chapter == null ? 1 : 0;
    for (let l = first; l <= level; l++) {
      const value = counters[l];
      parts.push(appendix && l === (chapter == null ? 1 : 0) ? toLetter(value) : String(value));
    }
    return parts.join('.');
  };
  let section = chapter == null ? '0' : String(chapter);
  const cites = [];
  const placeholders = [];
  const re = /\\(appendix|chapter|section|subsection|subsubsection|cite[a-zA-Z]*|PH[a-zA-Z]*)(?![a-zA-Z])|\[(SOURCE NEEDED|VERIFY)\b/g;
  let match;
  while ((match = re.exec(text))) {
    const name = match[1];
    let i = re.lastIndex;
    if (match[2]) {
      // Literal bracket placeholder: [SOURCE NEEDED – ...] / [VERIFY: ...].
      placeholders.push({ doc, section, kind: match[2], code: null });
      continue;
    }
    if (name === 'appendix') {
      appendix = true;
      counters[chapter == null ? 1 : 0] = 0;
      continue;
    }
    if (name in LEVELS) {
      let starred = false;
      if (text[i] === '*') {
        starred = true;
        i++;
      }
      i = skipSpace(text, i);
      if (text[i] === '[') i = readGroup(text, i)?.[1] ?? i;
      i = skipSpace(text, i);
      const title = readGroup(text, i);
      if (!title) continue;
      const level = LEVELS[name];
      if (chapter == null && level === 0) continue;
      if (!starred) {
        // The chapter number comes from the file name (ch03.tex -> 3).
        if (!(level === 0 && chapter != null && !appendix)) counters[level]++;
        for (let l = level + 1; l < counters.length; l++) counters[l] = 0;
      }
      // Unnumbered headings: the number written at the start of the title
      // ("S3.1 Completeness ..." -> "S3.1", only the number is kept), else the
      // number of the preceding numbered heading at the same level (or of the
      // parent when there is none) with '*'.
      const ownNumber = /^\s*(S\d+(\.\d+)*)(?=[\s~])/.exec(title[0])?.[1];
      const enclosing = counters[level] ? numberOf(level) : level > 0 ? numberOf(level - 1) : '';
      section = starred ? (ownNumber ?? `${enclosing || '0'}*`) : numberOf(level);
      re.lastIndex = title[1];
      continue;
    }
    if (name.startsWith('cite')) {
      if (text[i] === '*') i++;
      for (;;) {
        const j = skipSpace(text, i);
        if (text[j] !== '[') break;
        const opt = readGroup(text, j);
        if (!opt) break;
        i = opt[1];
      }
      const group = readGroup(text, skipSpace(text, i));
      if (!group) continue;
      for (const key of group[0].split(',').map((k) => k.trim()).filter(Boolean)) {
        cites.push({ key, doc, section });
      }
      continue;
    }
    if (name.startsWith('PH')) {
      if (!PLACEHOLDER_KINDS.includes(name)) continue;
      const first = readGroup(text, skipSpace(text, i));
      if (!first) continue;
      const code = first[0].trim();
      placeholders.push({ doc, section, kind: name, code: CODE_RE.test(code) ? code : null });
      // Scanning resumes after the macro name, so cites inside the arguments count.
    }
  }
  return { cites, placeholders };
}

// ── Graph ───────────────────────────────────────────────────────────────────
/**
 * docs: [{doc, chapter, text}] in output order; bibKeys: keys of references.bib.
 */
export function buildCitationGraph(docs, bibKeys) {
  const citations = new Map();
  const placeholders = [];
  for (const { doc, chapter, text } of docs) {
    const parsed = parseTexDocument(text, { doc, chapter });
    for (const cite of parsed.cites) {
      const uses = citations.get(cite.key) ?? [];
      const { key: _key, ...use } = cite;
      if (!uses.some((u) => u.doc === use.doc && u.section === use.section)) uses.push(use);
      citations.set(cite.key, uses);
    }
    placeholders.push(...parsed.placeholders);
  }
  const bib = new Set(bibKeys);
  const cited = [...citations.keys()].sort();
  const byDoc = {};
  for (const { doc } of docs) {
    byDoc[doc] = {
      citedKeys: cited.filter((key) => citations.get(key).some((u) => u.doc === doc)).length,
      placeholders: placeholders.filter((p) => p.doc === doc).length,
    };
  }
  return {
    $comment:
      'Generated by scripts/build-research-citation-graph.mjs from the private thesis repository (thesis/chapters/ch0*.tex, literature-review/literature_review.tex, thesis/references.bib). Do not edit by hand. Only bib keys, document ids, section numbers and placeholder kinds and codes are published: no section title, label, placeholder text or thesis sentence.',
    schema_version: 1,
    docs: docs.map(({ doc }) => doc),
    counts: {
      citedKeys: cited.length,
      bibKeys: bib.size,
      uncited: [...bib].filter((key) => !citations.has(key)).length,
      missing: cited.filter((key) => !bib.has(key)).length,
      placeholders: placeholders.length,
      byDoc,
    },
    citations: Object.fromEntries(cited.map((key) => [key, citations.get(key)])),
    uncited: [...bib].filter((key) => !citations.has(key)).sort(),
    missing: cited.filter((key) => !bib.has(key)),
    placeholders,
  };
}

export function readThesisDocs(thesisRoot) {
  const chaptersDir = join(thesisRoot, 'thesis/chapters');
  const chapters = readdirSync(chaptersDir)
    .filter((file) => /^ch0\d+\.tex$/.test(file))
    .sort()
    .map((file) => {
      const doc = file.replace(/\.tex$/, '');
      return { doc, chapter: Number.parseInt(doc.slice(2), 10), text: readFileSync(join(chaptersDir, file), 'utf8') };
    });
  const lrPath = join(thesisRoot, 'literature-review/literature_review.tex');
  const lr = existsSync(lrPath) ? [{ doc: 'lr', chapter: null, text: readFileSync(lrPath, 'utf8') }] : [];
  return [...chapters, ...lr];
}

export function renderOutputs(graph) {
  return {
    json: `${JSON.stringify(graph, null, 2)}\n`,
    mirror:
      '// Edge-compatible ESM literal mirror (no node: built-ins, no JSON import attributes).\n'
      + '// Source of truth: data/research-citations.json\n'
      + '// Regenerate when the JSON changes; tests/api-data-mirrors.test.mjs enforces parity.\n'
      + `export default ${JSON.stringify(graph, null, 2)};\n`,
  };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const outDirAt = args.indexOf('--out-dir');
  const outDir = outDirAt >= 0 ? args[outDirAt + 1] : null;
  const [thesisRoot] = args.filter((arg, i) => !arg.startsWith('--') && (outDirAt < 0 || i !== outDirAt + 1));
  if (!thesisRoot || (outDirAt >= 0 && !outDir)) {
    console.error('usage: build-research-citation-graph.mjs [--check] [--out-dir <dir>] <thesis-repo-root>');
    process.exit(2);
  }
  const docs = readThesisDocs(thesisRoot);
  const bibKeys = parseBibtex(readFileSync(join(thesisRoot, 'thesis/references.bib'), 'utf8')).map((e) => e.key);
  const graph = buildCitationGraph(docs, bibKeys);
  const { json, mirror } = renderOutputs(graph);
  const outJson = outDir ? resolve(outDir, 'research-citations.json') : OUT_JSON;
  const outMirror = outDir ? resolve(outDir, '_citations-data.js') : OUT_MIRROR;
  const c = graph.counts;
  const summary = `research citation graph: ${c.citedKeys} cited keys, ${c.uncited} uncited, ${c.missing} missing from .bib, ${c.placeholders} placeholders (${Object.entries(c.byDoc).map(([doc, v]) => `${doc} ${v.placeholders}`).join(', ')})`;
  if (check) {
    const stale = [[outJson, json], [outMirror, mirror]].filter(([path, content]) => !existsSync(path) || readFileSync(path, 'utf8') !== content);
    for (const [path] of stale) console.error(`error: ${path} is stale; rerun without --check`);
    console.log(summary);
    process.exit(stale.length ? 1 : 0);
  }
  writeFileSync(outJson, json);
  writeFileSync(outMirror, mirror);
  console.log(summary);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
