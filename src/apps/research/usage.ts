/**
 * Research — where each source is used in the thesis, and the open gaps.
 *
 * Pure helpers over data/research-citations.json (generated from the private
 * thesis repository by scripts/build-research-citation-graph.mjs and served by
 * /api/zotero/library as `citations`).
 */

export interface CitationUse {
  /** 'ch01'.. for the chapters, 'lr' for the literature review. */
  doc: string;
  /** Section number ("3.6.2", "A") or, for unnumbered sections, label or own number. */
  section: string;
  sectionTitle: string;
  label?: string;
}

export interface ThesisPlaceholder {
  doc: string;
  section: string;
  sectionTitle: string;
  id: string | null;
  kind: string;
  text: string;
}

export interface CitationGraph {
  docs: string[];
  citations: Record<string, CitationUse[]>;
  uncited: string[];
  missing: string[];
  placeholders: ThesisPlaceholder[];
}

export function isCitationGraph(value: unknown): value is CitationGraph {
  const graph = value as CitationGraph | null;
  return Boolean(graph && typeof graph.citations === 'object' && Array.isArray(graph.placeholders));
}

/** "Cap. 3" for ch03, "Rassegna" for the literature review. */
export function docLabel(doc: string): string {
  if (doc === 'lr') return 'Rassegna';
  const chapter = /^ch0*(\d+)$/.exec(doc)?.[1];
  return chapter ? `Cap. ${chapter}` : doc;
}

/** "Cap. 3 §3.6", "Rassegna §4.2", "Cap. 1 · S1.1 Provenance…" for unnumbered sections. */
export function formatUse(use: { doc: string; section: string; sectionTitle: string }): string {
  const doc = docLabel(use.doc);
  const chapter = /^ch0*(\d+)$/.exec(use.doc)?.[1];
  if (chapter && use.section === chapter) return doc;
  if (/^(S?\d+(\.\d+)*|[A-Z](\.\d+)*)$/.test(use.section)) return `${doc} §${use.section}`;
  return use.sectionTitle ? `${doc} · ${use.sectionTitle}` : doc;
}

export function usesOf(graph: CitationGraph | null, key: string | undefined): CitationUse[] {
  if (!graph || !key) return [];
  return graph.citations[key] ?? [];
}

/** Placeholder counts per document, in the graph's document order. */
export function placeholdersByDoc(graph: CitationGraph): { doc: string; count: number }[] {
  return graph.docs.map((doc) => ({ doc, count: graph.placeholders.filter((p) => p.doc === doc).length }));
}
