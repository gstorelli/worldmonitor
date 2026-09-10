/**
 * Research — Zotero library + document analysis workspace.
 *
 * A standalone application (not a dashboard variant): bibliography browser for
 * the doctoral literature review plus the live Zotero library. Shares only the
 * header/footer shell.
 */

import { escapeHtml } from '@/utils/sanitize';
import type { AppWorkspace } from '../types';

interface ResearchSource {
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

interface ZoteroItem {
  data?: {
    title?: string;
    creators?: { name?: string; lastName?: string; firstName?: string }[];
    date?: string;
    url?: string;
    DOI?: string;
    publicationTitle?: string;
  };
}

interface ResearchPayload {
  sources: ResearchSource[];
  library: ZoteroItem[] | null;
  librarySource: string;
  zoteroConfigured: boolean;
  fetchedAt: string;
}

const THEME_LABELS: Record<string, string> = {
  A: 'Customs AI',
  B: 'Supply chain / maritime',
  C: 'Multi-hazard / geospatial',
  D: 'LLM / XAI / accountability',
  E: 'Methodology / infrastructure',
};

export function createResearchWorkspace(): AppWorkspace {
  return {
    async mount(root: HTMLElement): Promise<void> {
      root.innerHTML = '<div class="rs-ws rs-loading">Caricamento libreria documentale…</div>';

      let payload: ResearchPayload;
      try {
        const res = await fetch('/api/zotero/library', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        payload = (await res.json()) as ResearchPayload;
      } catch (error) {
        root.innerHTML = `<div class="rs-ws"><div class="rs-empty">Impossibile caricare la libreria: ${escapeHtml(
          error instanceof Error ? error.message : String(error),
        )}</div></div>`;
        return;
      }

      const sources = Array.isArray(payload.sources) ? payload.sources : [];
      const library = Array.isArray(payload.library) ? payload.library : [];
      let selectedRef = sources[0]?.ref ?? 0;
      let theme = 'ALL';
      let query = '';

      root.innerHTML = `
        <div class="rs-ws rs-ws-research">
          <div class="rs-ws-toolbar">
            <div class="rs-ws-heading">
              <h1>Document Analysis</h1>
              <p>Literature review, limiti dichiarati e validazione delle fonti (Zotero)</p>
            </div>
            <div class="rs-ws-stats">
              <div class="rs-stat"><span class="rs-stat-value">${sources.length}</span><span class="rs-stat-label">fonti curate</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${library.length}</span><span class="rs-stat-label">item Zotero</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${payload.zoteroConfigured ? 'live' : 'offline'}</span><span class="rs-stat-label">libreria</span></div>
            </div>
          </div>

          <div class="rs-ws-controls">
            <input id="rsResearchQuery" class="rs-input" type="search" placeholder="Cerca per titolo, autore, venue, DOI…">
            <select id="rsResearchTheme" class="rs-select">
              <option value="ALL">Tutti i temi</option>
              ${Object.entries(THEME_LABELS)
                .map(([key, label]) => `<option value="${key}">${key} — ${escapeHtml(label)}</option>`)
                .join('')}
            </select>
            ${payload.zoteroConfigured ? '' : '<span class="rs-ws-hint">ZOTERO_USER_ID / ZOTERO_API_KEY non configurati: la libreria live è vuota.</span>'}
          </div>

          <div class="rs-ws-body">
            <section class="rs-ws-list" id="rsResearchList"></section>
            <aside class="rs-ws-detail" id="rsResearchDetail"></aside>
          </div>

          <section class="rs-ws-section">
            <h2>Libreria Zotero${library.length ? ` (${library.length})` : ''}</h2>
            <div id="rsResearchLibrary"></div>
          </section>
        </div>
      `;

      const listEl = root.querySelector<HTMLElement>('#rsResearchList');
      const detailEl = root.querySelector<HTMLElement>('#rsResearchDetail');
      const libraryEl = root.querySelector<HTMLElement>('#rsResearchLibrary');
      if (!listEl || !detailEl || !libraryEl) return;

      const filtered = () =>
        sources.filter((source) => {
          if (theme !== 'ALL' && source.themeArea !== theme) return false;
          if (!query) return true;
          const haystack = `${source.title} ${source.authors} ${source.venue} ${source.doi ?? ''} ${source.summary}`.toLowerCase();
          return haystack.includes(query);
        });

      const renderDetail = () => {
        const source = sources.find((entry) => entry.ref === selectedRef);
        if (!source) {
          detailEl.innerHTML = '<div class="rs-empty">Seleziona una fonte</div>';
          return;
        }
        detailEl.innerHTML = `
          <div class="rs-detail-head">
            <span class="rs-chip">Tema ${escapeHtml(source.themeArea)} — ${escapeHtml(THEME_LABELS[source.themeArea] ?? '')}</span>
            <span class="rs-chip rs-chip-muted">${escapeHtml(source.type)}</span>
          </div>
          <h2>${escapeHtml(source.title)}</h2>
          <p class="rs-meta">${escapeHtml(source.authors)} · ${source.year} · ${escapeHtml(source.venue)}${source.doi ? ` · DOI ${escapeHtml(source.doi)}` : ''}</p>
          <h3>Sintesi</h3><p>${escapeHtml(source.summary)}</p>
          <h3>Limiti</h3><p>${escapeHtml(source.limitation)}</p>
          <h3>Contributo</h3><p>${escapeHtml(source.contribution)}</p>
          <div class="rs-detail-foot">
            ${(source.dimensions ?? []).map((dim) => `<span class="rs-chip rs-chip-dim">${escapeHtml(dim)}</span>`).join('')}
            ${source.url ? `<a class="rs-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener">Apri fonte ↗</a>` : ''}
          </div>
        `;
      };

      const renderList = () => {
        const items = filtered();
        listEl.innerHTML = items.length
          ? items
              .map(
                (source) => `
            <button class="rs-list-item${source.ref === selectedRef ? ' active' : ''}" data-ref="${source.ref}">
              <span class="rs-list-title">${escapeHtml(source.title)}</span>
              <span class="rs-list-sub">${escapeHtml(source.authors)} · ${source.year}</span>
              <span class="rs-list-tags"><span class="rs-chip">${escapeHtml(source.themeArea)}</span><span class="rs-chip rs-chip-muted">${escapeHtml(source.type)}</span></span>
            </button>`,
              )
              .join('')
          : '<div class="rs-empty">Nessuna fonte corrisponde ai filtri.</div>';
      };

      listEl.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>('[data-ref]');
        if (!button) return;
        selectedRef = Number(button.dataset.ref);
        renderList();
        renderDetail();
      });
      root.querySelector<HTMLInputElement>('#rsResearchQuery')?.addEventListener('input', (event) => {
        query = (event.target as HTMLInputElement).value.trim().toLowerCase();
        renderList();
      });
      root.querySelector<HTMLSelectElement>('#rsResearchTheme')?.addEventListener('change', (event) => {
        theme = (event.target as HTMLSelectElement).value;
        renderList();
      });

      libraryEl.innerHTML = library.length
        ? `<div class="rs-card-grid">${library
            .slice(0, 60)
            .map((item) => {
              const data = item.data ?? {};
              const creators = Array.isArray(data.creators)
                ? data.creators.map((creator) => creator.lastName || creator.name || '').filter(Boolean).join(', ')
                : '';
              const url = data.url || (data.DOI ? `https://doi.org/${data.DOI}` : '');
              return `<article class="rs-card">
                <h3>${escapeHtml(data.title || '(senza titolo)')}</h3>
                <p class="rs-meta">${escapeHtml(creators)}${data.date ? ` · ${escapeHtml(String(data.date).slice(0, 10))}` : ''}</p>
                ${data.publicationTitle ? `<p class="rs-meta">${escapeHtml(data.publicationTitle)}</p>` : ''}
                ${url ? `<a class="rs-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Apri ↗</a>` : ''}
              </article>`;
            })
            .join('')}</div>`
        : `<div class="rs-empty">Nessun item nella cache Zotero. ${
            payload.zoteroConfigured
              ? 'Aggiungi item alla libreria o forza un refresh.'
              : 'Configura ZOTERO_USER_ID e ZOTERO_API_KEY sul server.'
          }</div>`;

      renderList();
      renderDetail();
    },
  };
}
