import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', 'scripts', 'build-research-citation-graph.mjs');
const { buildCitationGraph, parseTexDocument, PLACEHOLDER_KINDS } = await import(pathToFileURL(script).href);
const usage = await import(pathToFileURL(join(here, '..', 'src', 'apps', 'research', 'usage.ts')).href);

// Body sentences, titles, labels and placeholder text carry the marker SECRET,
// which must never reach the output.
const CHAPTER = String.raw`
\chapter{Methodology SECRETTITLE}
\label{ch:SECRETLABEL}
SECRETBODY intro sentence \citep{alpha_2020}.
\section{Data sources SECRETTITLE}
\label{sec:SECRETLABEL}
SECRETBODY as shown by \citet[p.~4]{beta_2021} and \citep[see][ch.~2]{alpha_2020, gamma_2022}.
% \cite{commented_out} SECRETBODY in a comment
\subsection{Catalogue \emph{completeness}}
SECRETBODY text \citealp{beta_2021}. \PHsource{P3-01}{SECRETTEXT share by channel, \citep{delta_2019}}
\subsubsection{Deep}
\PHverify{SECRETTEXT not a code}{SECRETTEXT}
\section{Hazard}
\subsection{Results}
SECRETBODY \cite{ghost_key} and [SOURCE NEEDED -- SECRETTEXT official figure]
\section*{Supplementary SECRETTITLE}
\citep{eps_2017}
\subsection*{S3.1 Completeness}
\citep{alpha_2020}
\PH{P3-09}{DA SCRIVERE}{SECRETTEXT paragraph}
\PHfield{P3-10}
`;

const REVIEW = String.raw`
\documentclass{article}
\newcommand{\PHsource}[2]{\PH{#1}{SOURCE NEEDED}{#2}}
\begin{document}
\section{Introduction SECRETTITLE}\label{sec:SECRETLABEL}
SECRETBODY \citep{alpha_2020}
\appendix
\section{Corpus}\label{app:corpus}
SECRETBODY [VERIFY: SECRETTEXT date]
\end{document}
`;

const docs = [
  { doc: 'ch03', chapter: 3, text: CHAPTER },
  { doc: 'lr', chapter: null, text: REVIEW },
];
const bibKeys = ['alpha_2020', 'beta_2021', 'gamma_2022', 'delta_2019', 'eps_2017', 'unused_2018'];

describe('research citation graph', () => {
  const graph = buildCitationGraph(docs, bibKeys);

  it('tracks nested sections and multi-key cites with optional arguments, by number only', () => {
    assert.deepEqual(graph.citations.alpha_2020, [
      { doc: 'ch03', section: '3' },
      { doc: 'ch03', section: '3.1' },
      { doc: 'ch03', section: 'S3.1' },
      { doc: 'lr', section: '1' },
    ]);
    assert.deepEqual(graph.citations.beta_2021.map((u) => u.section), ['3.1', '3.1.1']);
    assert.deepEqual(graph.citations.gamma_2022.map((u) => u.section), ['3.1']);
    // Unnumbered section without a number in its title: enclosing number + '*'.
    assert.deepEqual(graph.citations.eps_2017.map((u) => u.section), ['3.2*']);
    // A cite inside a placeholder still counts.
    assert.deepEqual(graph.citations.delta_2019.map((u) => u.section), ['3.1.1']);
    assert.equal(graph.citations.commented_out, undefined);
  });

  it('lists uncited and missing keys', () => {
    assert.deepEqual(graph.uncited, ['unused_2018']);
    assert.deepEqual(graph.missing, ['ghost_key']);
    assert.equal(graph.counts.citedKeys, 6);
  });

  it('lists placeholders with doc, section number, kind and code only', () => {
    assert.deepEqual(graph.placeholders, [
      { doc: 'ch03', section: '3.1.1', kind: 'PHsource', code: 'P3-01' },
      { doc: 'ch03', section: '3.1.1.1', kind: 'PHverify', code: null },
      { doc: 'ch03', section: '3.2.1', kind: 'SOURCE NEEDED', code: null },
      { doc: 'ch03', section: 'S3.1', kind: 'PH', code: 'P3-09' },
      { doc: 'ch03', section: 'S3.1', kind: 'PHfield', code: 'P3-10' },
      { doc: 'lr', section: 'A', kind: 'VERIFY', code: null },
    ]);
    for (const p of graph.placeholders) assert.ok(PLACEHOLDER_KINDS.includes(p.kind));
    assert.equal(graph.counts.byDoc.lr.placeholders, 1);
  });

  it('ignores the preamble of the literature review', () => {
    assert.equal(graph.placeholders.filter((p) => p.doc === 'lr').length, 1);
  });

  it('emits only whitelisted text (no titles, labels, placeholder text or sentences)', () => {
    const out = JSON.stringify({ ...graph, $comment: '' });
    for (const marker of ['SECRET', 'Methodology', 'Data sources', 'Introduction', 'Supplementary', 'Catalogue', 'Completeness', 'Deep', 'DA SCRIVERE']) {
      assert.ok(!out.includes(marker), `leaked: ${marker}`);
    }
    const allowed = new Set([
      ...Object.keys(graph.citations),
      ...graph.uncited,
      ...graph.docs,
      ...PLACEHOLDER_KINDS,
      graph.$comment,
    ]);
    const isSection = (v) => /^([A-Z]|S?\d+)(\.\d+)*\*?$/.test(v);
    const isCode = (v) => /^[A-Z]{1,3}\d*-\d{1,3}[a-z]?$/.test(v);
    const walk = (value) => {
      if (typeof value === 'string') assert.ok(allowed.has(value) || isSection(value) || isCode(value), `non-whitelisted string: ${value}`);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(graph);
    for (const use of Object.values(graph.citations).flat()) assert.deepEqual(Object.keys(use), ['doc', 'section']);
  });

  it('is deterministic', () => {
    assert.deepEqual(buildCitationGraph(docs, bibKeys), graph);
  });

  it('numbers the sections of a chapter from the file name', () => {
    assert.equal(parseTexDocument(String.raw`\chapter{X}\section{A}\citep{k}`, { doc: 'ch01', chapter: 1 }).cites[0].section, '1.1');
  });

  it('--check passes on a fresh build and fails when the output is stale', () => {
    const root = mkdtempSync(join(tmpdir(), 'rs-cite-'));
    mkdirSync(join(root, 'thesis', 'chapters'), { recursive: true });
    mkdirSync(join(root, 'literature-review'));
    writeFileSync(join(root, 'thesis', 'chapters', 'ch03.tex'), CHAPTER);
    writeFileSync(join(root, 'literature-review', 'literature_review.tex'), REVIEW);
    writeFileSync(join(root, 'thesis', 'references.bib'), bibKeys.map((key) => `@misc{${key},\n  title = {T}\n}\n`).join('\n'));
    const out = join(root, 'out');
    mkdirSync(out);
    const run = (...args) => spawnSync(process.execPath, [script, ...args, '--out-dir', out, root], { encoding: 'utf8' });
    assert.equal(run('--check').status, 1);
    assert.equal(run().status, 0);
    assert.equal(run('--check').status, 0);
    const written = JSON.parse(readFileSync(join(out, 'research-citations.json'), 'utf8'));
    assert.deepEqual(written.missing, ['ghost_key']);
    writeFileSync(join(root, 'thesis', 'chapters', 'ch03.tex'), `${CHAPTER}\n\\citep{new_2024}`);
    assert.equal(run('--check').status, 1);
  });
});

describe('research usage helpers', () => {
  it('formats uses as chapter and section', () => {
    assert.equal(usage.formatUse({ doc: 'ch03', section: '3.6.2' }), 'Cap. 3 §3.6.2');
    assert.equal(usage.formatUse({ doc: 'ch03', section: '3' }), 'Cap. 3');
    assert.equal(usage.formatUse({ doc: 'lr', section: 'A' }), 'Rassegna §A');
    assert.equal(usage.formatUse({ doc: 'ch01', section: 'S1.1' }), 'Cap. 1 §S1.1');
    assert.equal(usage.formatPlaceholder({ doc: 'ch03', section: '3.2', kind: 'PHyeartwo', code: 'P3-17' }), 'Cap. 3 §3.2 — PHyeartwo P3-17');
    assert.equal(usage.formatPlaceholder({ doc: 'lr', section: 'A', kind: 'VERIFY', code: null }), 'Rassegna §A — VERIFY');
  });

  it('reads uses and placeholder counts from the graph', () => {
    const graph = buildCitationGraph(docs, bibKeys);
    assert.ok(usage.isCitationGraph(graph));
    assert.equal(usage.isCitationGraph(null), false);
    assert.equal(usage.usesOf(graph, 'beta_2021').length, 2);
    assert.deepEqual(usage.usesOf(graph, undefined), []);
    assert.deepEqual(usage.placeholdersByDoc(graph), [
      { doc: 'ch03', count: 5 },
      { doc: 'lr', count: 1 },
    ]);
  });

  it('the committed graph matches its schema', () => {
    const committed = JSON.parse(readFileSync(join(here, '..', 'data', 'research-citations.json'), 'utf8'));
    assert.ok(usage.isCitationGraph(committed));
    for (const p of committed.placeholders) assert.deepEqual(Object.keys(p), ['doc', 'section', 'kind', 'code']);
    for (const use of Object.values(committed.citations).flat()) assert.deepEqual(Object.keys(use), ['doc', 'section']);
  });
});
