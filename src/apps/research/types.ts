/** Shared shapes for the Research application (bibliography + Zotero). */

import type { CitationGraph } from './usage';

export interface ResearchSource {
  ref: number;
  /** BibTeX key in the thesis repository (thesis/references.bib); absent for imports. */
  key?: string;
  authors: string;
  year: number;
  title: string;
  type: string;
  venue: string;
  doi: string | null;
  url: string;
  /** Layers of the six-layer model (see layers.ts); empty for imported entries. */
  layers: string[];
  verified: boolean;
  /** How it was verified: T full text, API data service, P publisher/abstract, S secondary. */
  verification?: string | null;
  summary?: string;
  limitation?: string;
  /**
   * Original BibTeX entry type (article, book, incollection, misc, ...) of
   * entries generated from the thesis; absent for imports and older data.
   * The fields below are copied from references.bib only when present, so the
   * BibTeX export round-trips the main fields.
   */
  entryType?: string;
  volume?: string;
  number?: string;
  pages?: string;
  howpublished?: string;
  note?: string;
}

export interface ZoteroItem {
  data?: {
    title?: string;
    creators?: { name?: string; lastName?: string; firstName?: string }[];
    date?: string;
    url?: string;
    DOI?: string;
    publicationTitle?: string;
    itemType?: string;
  };
}

export interface ResearchPayload {
  sources: ResearchSource[];
  /** Where each bib key is cited in the thesis, and the open placeholders. */
  citations?: CitationGraph | null;
  library: ZoteroItem[] | null;
  librarySource: string;
  zoteroConfigured: boolean;
  fetchedAt: string;
}
