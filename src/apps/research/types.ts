/** Shared shapes for the Research application (bibliography + Zotero). */

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
  library: ZoteroItem[] | null;
  librarySource: string;
  zoteroConfigured: boolean;
  fetchedAt: string;
}
