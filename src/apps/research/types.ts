/** Shared shapes for the Research application (bibliography + Zotero). */

export interface ResearchSource {
  ref: number;
  authors: string;
  year: number;
  title: string;
  type: string;
  venue: string;
  doi: string | null;
  url: string;
  themeArea: string;
  summary: string;
  limitation: string;
  contribution: string;
  dimensions: string[];
  verified: boolean;
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
