import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', 'scripts', 'build-research-citation-graph.mjs');
const { buildCitationGraph, parseTexDocument, plainText, truncate } = await import(pathToFileURL(script).href);
const usage = await import(pathToFileURL(join(here, '..', 'src', 'apps', 'research', 'usage.ts')).href);

// Body sentences carry a marker that must never reach the output.
const CHAPTER = String.raw`
\chapter{Methodology}
\label{ch:3}
BODYSECRET intro sentence \citep{alpha_2020}.
\section{Data sources}
\label{sec:3-sources}
BODYSECRET as shown by \citet[p.~4]{beta_2021} and \citep[see][ch.~2]{alpha_2020, gamma_2022}.
% \cite{commented_out} BODYSECRET in a comment
\subsection{Catalogue \emph{completeness}}
BODYSECRET text \citealp{beta_2021}. \PHsource{P3-01}{share of declarations by channel, \citep{delta_2019}}
\subsubsection{Deep}
\PHverify{P3-02}{${'x'.repeat(200)}}
\section{Hazard}
\subsection{Results}
BODYSECRET \cite{ghost_key} and [SOURCE NEEDED -- official figure of the office]
\section*{Supplementary material}
\subsection*{S3.1 Completeness}
\citep{alpha_2020}
\PH{P3-09}{DA SCRIVERE}{whole paragraph}
\PHfield{P3-10}
`;

const REVIEW = String.raw`
\documentclass{article}
\newcommand{\PHsource}[2]{\PH{#1}{SOURCE NEEDED}{#2}}
\begin{document}
\section{Introduction}\label{sec:intro}
BODYSECRET \citep{alpha_2020}
\appendix
\section{Corpus}\label{app:corpus}
BODYSECRET [VERIFY: date of the cycle]
\end{document}
`;

const docs = [
  { doc: 'ch03', chapter: 3, text: CHAPTER },
  { doc: 'lr', chapter: null, text: REVIEW },
];
const bibKeys = ['alpha_2020', 'beta_2021', 'gamma_2022', 'delta_2019', 'unused_2018'];

describe('research citation graph', () => {
  const graph = buildCitationGraph(docs, bibKeys);

  it('tracks nested sections, multi-key cites with optional arguments and labels', () => {
    assert.deepEqual(graph.citations.alpha_2020, [
      { doc: 'ch03', section: '3', sectionTitle: 'Methodology', label: 'ch:3' },
      { doc: 'ch03', section: '3.1', sectionTitle: 'Data sources', label: 'sec:3-sources' },
      { doc: 'ch03', section: 'S3.1', sectionTitle: 'S3.1 Completeness' },
      { doc: 'lr', section: '1', sectionTitle: 'Introduction', label: 'sec:intro' },
    ]);
    assert.deepEqual(graph.citations.beta_2021.map((u) => u.section), ['3.1', '3.1.1']);
    assert.equal(graph.citations.beta_2021[1].sectionTitle, 'Catalogue completeness');
    assert.deepEqual(graph.citations.gamma_2022.map((u) => u.section), ['3.1']);
    // A cite inside a placeholder still counts.
    assert.deepEqual(graph.citations.delta_2019.map((u) => u.section), ['3.1.1']);
    assert.equal(graph.citations.commented_out, undefined);
  });

  it('lists uncited and missing keys', () => {
    assert.deepEqual(graph.uncited, ['unused_2018']);
    assert.deepEqual(graph.missing, ['ghost_key']);
    assert.equal(graph.counts.citedKeys, 5);
  });

  it('lists placeholders with doc, section and truncated text', () => {
    const brief = graph.placeholders.map((p) => [p.doc, p.section, p.id, p.kind]);
    assert.deepEqual(brief, [
      ['ch03', '3.1.1', 'P3-01', 'SOURCE NEEDED'],
      ['ch03', '3.1.1.1', 'P3-02', 'VERIFY'],
      ['ch03', '3.2.1', null, 'SOURCE NEEDED'],
      ['ch03', 'S3.1', 'P3-09', 'DA SCRIVERE'],
      ['ch03', 'S3.1', 'P3-10', 'SPERIMENTAZIONE ANNO 3'],
      ['lr', 'A', null, 'VERIFY'],
    ]);
    assert.equal(graph.placeholders[0].text, 'share of declarations by channel, [delta_2019]');
    assert.equal(graph.placeholders[1].text.length, 120);
    assert.equal(graph.placeholders[2].text, 'official figure of the office');
    assert.equal(graph.placeholders[5].text, 'date of the cycle');
    assert.equal(graph.counts.byDoc.lr.placeholders, 1);
  });

  it('ignores the preamble of the literature review', () => {
    assert.ok(!graph.placeholders.some((p) => p.text.includes('#2')));
  });

  it('emits only whitelisted text (no body sentences)', () => {
    const out = JSON.stringify(graph);
    assert.ok(!out.includes('BODYSECRET'));
    const allowed = new Set([
      ...Object.keys(graph.citations),
      ...graph.uncited,
      ...graph.docs,
      ...Object.values(graph.citations).flat().flatMap((u) => [u.doc, u.section, u.sectionTitle, u.label]),
      ...graph.placeholders.flatMap((p) => [p.doc, p.section, p.sectionTitle, p.id, p.kind, p.text]),
      graph.$comment,
    ]);
    const walk = (value) => {
      if (typeof value === 'string') assert.ok(allowed.has(value), `non-whitelisted string: ${value}`);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(graph);
  });

  it('is deterministic', () => {
    assert.deepEqual(buildCitationGraph(docs, bibKeys), graph);
  });

  it('helpers clean LaTeX and truncate', () => {
    assert.equal(plainText(String.raw`Year~2 \emph{protocol} -- draft`), 'Year 2 protocol – draft');
    assert.equal(truncate('abc', 120), 'abc');
    assert.equal(parseTexDocument(String.raw`\section{A}\citep{k}`, { doc: 'ch01', chapter: 1 }).cites[0].section, '1.1');
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
    assert.equal(usage.formatUse({ doc: 'ch03', section: '3.6', sectionTitle: 'X' }), 'Cap. 3 §3.6');
    assert.equal(usage.formatUse({ doc: 'ch03', section: '3', sectionTitle: 'Methodology' }), 'Cap. 3');
    assert.equal(usage.formatUse({ doc: 'lr', section: 'A', sectionTitle: 'Corpus' }), 'Rassegna §A');
    assert.equal(usage.formatUse({ doc: 'ch01', section: 'sec:1-supp', sectionTitle: 'Provenance' }), 'Cap. 1 · Provenance');
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
    for (const p of committed.placeholders) assert.ok(p.text.length <= 120);
  });
});
