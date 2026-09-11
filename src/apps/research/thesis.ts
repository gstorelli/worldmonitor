/**
 * Research — thesis output generators (Markdown / LaTeX).
 *
 * Produce a literature-review chapter skeleton organised by theme, with the
 * review workflow state, optional reading notes and the 8D coverage table.
 * Pure helpers (unit-tested).
 */

import { formatApa } from './citations';
import { computeDimensionCoverage } from './coverage';
import { readingEntry, type ResearchState } from './model';
import type { ResearchSource } from './types';

const THEME_LABELS: Record<string, string> = {
  A: 'Customs AI',
  B: 'Supply chain / maritime',
  C: 'Multi-hazard / geospatial',
  D: 'LLM / XAI / accountability',
  E: 'Methodology / infrastructure',
};

const STATE_LABELS: Record<string, string> = {
  'to-read': 'da leggere',
  reading: 'in lettura',
  reviewed: 'revisionata',
};

export interface ThesisOptions {
  themes?: string[];
  includeNotes?: boolean;
  includeCoverage?: boolean;
  includeWorkflow?: boolean;
}

function latexEscape(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function groupByTheme(sources: ResearchSource[]): [string, ResearchSource[]][] {
  const groups = new Map<string, ResearchSource[]>();
  for (const source of sources) {
    const key = source.themeArea || '—';
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function workflowLine(source: ResearchSource, state: ResearchState): string {
  const entry = readingEntry(state, source.ref);
  const parts: string[] = [];
  if (entry.state) parts.push(`stato: ${STATE_LABELS[entry.state] ?? entry.state}`);
  if (entry.priority) parts.push(`priorità: ${entry.priority}`);
  if (entry.tags?.length) parts.push(`tag: ${entry.tags.join(', ')}`);
  return parts.join(' · ');
}

export function generateThesisMarkdown(
  sources: ResearchSource[],
  state: ResearchState,
  options: ThesisOptions = {},
): string {
  const { themes, includeNotes = true, includeCoverage = true, includeWorkflow = true } = options;
  const selected = themes?.length ? sources.filter((source) => themes.includes(source.themeArea)) : sources;
  const lines: string[] = [
    '# Risk Sentinel — Literature review',
    '',
    `_Generato il ${new Date().toLocaleString()} · ${selected.length} fonti_`,
    '',
  ];

  for (const [theme, entries] of groupByTheme(selected)) {
    lines.push(`## Tema ${theme} — ${THEME_LABELS[theme] ?? theme}`, '');
    for (const source of entries) {
      lines.push(`- ${formatApa(source)}`);
      if (includeWorkflow) {
        const workflow = workflowLine(source, state);
        if (workflow) lines.push(`  - ${workflow}`);
      }
      if (includeNotes) {
        const note = state.notes[String(source.ref)]?.trim();
        if (note) lines.push(`  > ${note.split('\n').join('\n  > ')}`);
      }
    }
    lines.push('');
  }

  if (includeCoverage) {
    lines.push('## Copertura metodologica (modello 8D)', '', '| Dimensione | Fonti | Riferimenti |', '| --- | --- | --- |');
    for (const entry of computeDimensionCoverage(selected)) {
      lines.push(`| ${entry.label} | ${entry.count} | ${entry.refs.join(', ') || '—'} |`);
    }
    lines.push('');
  }

  lines.push('## Bibliografia', '');
  selected.forEach((source, index) => lines.push(`${index + 1}. ${formatApa(source)}`));
  lines.push('');
  return lines.join('\n');
}

export function generateThesisLatex(
  sources: ResearchSource[],
  state: ResearchState,
  options: ThesisOptions = {},
): string {
  const { themes, includeNotes = true, includeCoverage = true, includeWorkflow = true } = options;
  const selected = themes?.length ? sources.filter((source) => themes.includes(source.themeArea)) : sources;
  const lines: string[] = [
    '% Risk Sentinel — literature review (generato automaticamente)',
    `\\section*{Literature review — Risk Sentinel}`,
    `\\noindent\\emph{${selected.length} fonti · ${latexEscape(new Date().toLocaleString())}}`,
    '',
  ];

  for (const [theme, entries] of groupByTheme(selected)) {
    lines.push(`\\subsection*{Tema ${latexEscape(theme)} — ${latexEscape(THEME_LABELS[theme] ?? theme)}}`, '\\begin{itemize}');
    for (const source of entries) {
      lines.push(`  \\item ${latexEscape(formatApa(source))}`);
      if (includeWorkflow) {
        const workflow = workflowLine(source, state);
        if (workflow) lines.push(`    \\begin{itemize}\\item ${latexEscape(workflow)}\\end{itemize}`);
      }
      if (includeNotes) {
        const note = state.notes[String(source.ref)]?.trim();
        if (note) lines.push(`    \\begin{quote}${latexEscape(note)}\\end{quote}`);
      }
    }
    lines.push('\\end{itemize}', '');
  }

  if (includeCoverage) {
    lines.push('\\subsection*{Copertura metodologica (modello 8D)}', '\\begin{tabular}{lcc}', 'Dimensione & Fonti & Riferimenti \\\\ \\hline');
    for (const entry of computeDimensionCoverage(selected)) {
      lines.push(`${latexEscape(entry.label)} & ${entry.count} & ${latexEscape(entry.refs.join(', ') || '---')} \\\\`);
    }
    lines.push('\\end{tabular}', '');
  }
  return lines.join('\n');
}
