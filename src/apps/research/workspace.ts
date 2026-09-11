/**
 * Research — academic workbench.
 *
 * Independent application (shared shell only) with four views:
 *   Bibliografia — searchable/sortable review table + citation export
 *   Copertura    — literature coverage against the canonical 8 risk dimensions
 *   Zotero       — live library items
 *   Note         — per-source reading notes (local) with Markdown export
 */

import { escapeHtml } from '@/utils/sanitize';
import type { AppWorkspace } from '../types';
import {
  citationKey,
  formatApa,
  formatBibtex,
  toBibtexCollection,
  toCsv,
  toRisCollection,
} from './citations';
import {
  computeDimensionCoverage,
  computeThemeDistribution,
  computeTypeDistribution,
  computeYearHistogram,
} from './coverage';
import { matchesResearchQuery, parseResearchQuery, sortSources, type SortDirection, type SortKey } from './filters';
import type { ResearchPayload, ResearchSource, ZoteroItem } from './types';

const THEME_LABELS: Record<string, string> = {
  A: 'Customs AI',
  B: 'Supply chain / maritime',
  C: 'Multi-hazard / geospatial',
  D: 'LLM / XAI / accountability',
  E: 'Methodology / infrastructure',
};

const NOTES_KEY = 'rs-research-notes';

type TabId = 'library' | 'coverage' | 'zotero' | 'notes';

function loadNotes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveNotes(notes: Record<string, string>): void {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    // private mode: notes stay for the session only
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'ref', label: '#' },
  { key: 'authors', label: 'Autori' },
  { key: 'year', label: 'Anno' },
  { key: 'title', label: 'Titolo' },
  { key: 'venue', label: 'Sede' },
  { key: 'themeArea', label: 'Tema' },
];

export function createResearchWorkspace(): AppWorkspace {
  let sources: ResearchSource[] = [];
  let library: ZoteroItem[] = [];
  let zoteroConfigured = false;
  let fetchedAt = '';
  const notes: Record<string, string> = loadNotes();
  let activeTab: TabId = 'library';
  let queryInput = '';
  let sortKey: SortKey = 'ref';
  let sortDirection: SortDirection = 'asc';
  let selectedRef = 0;
  let notesRef = 0;
  let statusMessage = '';

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

      sources = Array.isArray(payload.sources) ? payload.sources : [];
      library = Array.isArray(payload.library) ? payload.library : [];
      zoteroConfigured = Boolean(payload.zoteroConfigured);
      fetchedAt = payload.fetchedAt ?? new Date().toISOString();
      selectedRef = sources[0]?.ref ?? 0;
      notesRef = selectedRef;

      const setStatus = (message: string) => {
        statusMessage = message;
        const el = root.querySelector<HTMLElement>('#rsResearchStatus');
        if (el) el.textContent = message;
      };

      const filtered = (): ResearchSource[] =>
        sortSources(sources.filter((source) => matchesResearchQuery(source, parseResearchQuery(queryInput))), sortKey, sortDirection);

      const renderLibrary = () => {
        const listEl = root.querySelector<HTMLElement>('#rsResearchTableBody');
        const detailEl = root.querySelector<HTMLElement>('#rsResearchDetail');
        const countEl = root.querySelector<HTMLElement>('#rsResearchResultCount');
        if (!listEl || !detailEl) return;
        const rows = filtered();
        if (countEl) countEl.textContent = `${rows.length}/${sources.length}`;

        listEl.innerHTML = rows.length
          ? rows
              .map(
                (source) => `
            <tr class="rs-bib-row${source.ref === selectedRef ? ' active' : ''}" data-ref="${source.ref}">
              <td class="rs-bib-ref">${source.ref}</td>
              <td>${escapeHtml(source.authors)}</td>
              <td class="rs-bib-year">${source.year}</td>
              <td class="rs-bib-title">${escapeHtml(source.title)}</td>
              <td class="rs-bib-venue">${escapeHtml(source.venue)}</td>
              <td><span class="rs-chip">${escapeHtml(source.themeArea)}</span></td>
              <td class="rs-bib-type">${escapeHtml(source.type)}</td>
            </tr>`,
              )
              .join('')
          : '<tr><td colspan="7"><div class="rs-empty">Nessuna fonte corrisponde alla ricerca.</div></td></tr>';

        const source = sources.find((entry) => entry.ref === selectedRef);
        if (!source) {
          detailEl.innerHTML = '<div class="rs-empty">Seleziona una fonte</div>';
          return;
        }
        detailEl.innerHTML = `
          <div class="rs-detail-head">
            <span class="rs-chip">Tema ${escapeHtml(source.themeArea)} — ${escapeHtml(THEME_LABELS[source.themeArea] ?? '')}</span>
            <span class="rs-chip rs-chip-muted">${escapeHtml(source.type)}</span>
            ${source.verified ? '<span class="rs-chip rs-chip-ok">verificata</span>' : ''}
          </div>
          <h2>${escapeHtml(source.title)}</h2>
          <p class="rs-meta">${escapeHtml(source.authors)} · ${source.year} · ${escapeHtml(source.venue)}</p>
          <div class="rs-bib-citation">
            <div class="rs-bib-citation-label">Citazione (APA)</div>
            <p>${escapeHtml(formatApa(source))}</p>
            <div class="rs-bib-citation-actions">
              <button class="rs-button rs-button-ghost" data-copy="apa" data-ref="${source.ref}">Copia APA</button>
              <button class="rs-button rs-button-ghost" data-copy="bibtex" data-ref="${source.ref}">Copia BibTeX</button>
              <span class="rs-meta">key: ${escapeHtml(citationKey(source))}</span>
            </div>
          </div>
          <h3>Sintesi</h3><p>${escapeHtml(source.summary)}</p>
          <h3>Limiti</h3><p>${escapeHtml(source.limitation)}</p>
          <h3>Contributo alla tesi</h3><p>${escapeHtml(source.contribution)}</p>
          <div class="rs-detail-foot">
            ${(source.dimensions ?? []).map((dim) => `<span class="rs-chip rs-chip-dim">${escapeHtml(dim)}</span>`).join('')}
            ${source.doi ? `<a class="rs-link" href="https://doi.org/${escapeHtml(source.doi)}" target="_blank" rel="noopener">DOI ↗</a>` : ''}
            ${source.url ? `<a class="rs-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener">Fonte ↗</a>` : ''}
          </div>
        `;
      };

      const renderCoverage = () => {
        const container = root.querySelector<HTMLElement>('#rsResearchCoverage');
        if (!container) return;
        const matrix = computeDimensionCoverage(sources);
        const gaps = matrix.filter((entry) => entry.count === 0);
        const fragile = matrix.filter((entry) => entry.count === 1);
        const themes = computeThemeDistribution(sources, THEME_LABELS);
        const types = computeTypeDistribution(sources);
        const years = computeYearHistogram(sources);
        const maxCount = Math.max(1, ...matrix.map((entry) => entry.count));
        const bars = (entries: { key: string; label: string; count: number }[]) => {
          const max = Math.max(1, entries[0]?.count ?? 1);
          return entries
            .map(
              (entry) => `
            <div class="rs-bar-row">
              <span class="rs-bar-label">${escapeHtml(entry.label)}</span>
              <span class="rs-bar-track"><span class="rs-bar-fill" style="width:${Math.round((entry.count / max) * 100)}%"></span></span>
              <span class="rs-bar-value">${entry.count}</span>
            </div>`,
            )
            .join('');
        };

        container.innerHTML = `
          <div class="rs-cov-summary">
            <div class="rs-callout ${gaps.length ? 'rs-callout-warn' : 'rs-callout-ok'}">
              <strong>${gaps.length} dimensioni senza copertura</strong>
              <span>${gaps.map((entry) => escapeHtml(entry.label)).join(', ') || 'nessuna'}</span>
            </div>
            ${fragile.length ? `<div class="rs-callout"><strong>${fragile.length} dimensioni fragili (1 sola fonte)</strong><span>${fragile.map((entry) => escapeHtml(entry.label)).join(', ')}</span></div>` : ''}
          </div>
          <table class="rs-cov-table">
            <thead>
              <tr><th>Dimensione (modello 8D)</th>${sources.map((source) => `<th title="${escapeHtml(source.title)}">${source.ref}</th>`).join('')}<th class="rs-cov-count">Fonti</th></tr>
            </thead>
            <tbody>
              ${matrix
                .map(
                  (entry) => `
                <tr class="${entry.count === 0 ? 'rs-cov-gap' : ''}">
                  <th scope="row">${escapeHtml(entry.label)}</th>
                  ${sources
                    .map((source) => {
                      const covered = entry.refs.includes(source.ref);
                      return `<td class="rs-cov-cell${covered ? ' covered' : ''}">${covered ? '●' : ''}</td>`;
                    })
                    .join('')}
                  <td class="rs-cov-count">
                    <span class="rs-cov-bar"><span style="width:${Math.round((entry.count / maxCount) * 100)}%"></span></span>
                    ${entry.count}
                  </td>
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>
          <div class="rs-cov-distributions">
            <section><h3>Temi</h3>${bars(themes)}</section>
            <section><h3>Tipi</h3>${bars(types)}</section>
            <section><h3>Anni</h3>${bars(years)}</section>
          </div>
        `;
      };

      const renderZotero = () => {
        const container = root.querySelector<HTMLElement>('#rsResearchZotero');
        if (!container) return;
        container.innerHTML = library.length
          ? `<div class="rs-card-grid">${library
              .slice(0, 120)
              .map((item) => {
                const data = item.data ?? {};
                const creators = Array.isArray(data.creators)
                  ? data.creators.map((creator) => creator.lastName || creator.name || '').filter(Boolean).join(', ')
                  : '';
                const url = data.url || (data.DOI ? `https://doi.org/${data.DOI}` : '');
                return `<article class="rs-card">
                  <div class="rs-card-head"><span class="rs-chip rs-chip-muted">${escapeHtml(data.itemType || 'item')}</span></div>
                  <h3>${escapeHtml(data.title || '(senza titolo)')}</h3>
                  <p class="rs-meta">${escapeHtml(creators)}${data.date ? ` · ${escapeHtml(String(data.date).slice(0, 10))}` : ''}</p>
                  ${data.publicationTitle ? `<p class="rs-meta">${escapeHtml(data.publicationTitle)}</p>` : ''}
                  ${url ? `<a class="rs-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Apri ↗</a>` : ''}
                </article>`;
              })
              .join('')}</div>`
          : `<div class="rs-empty">Nessun item nella cache Zotero. ${
              zoteroConfigured
                ? 'Aggiungi item alla libreria o forza un refresh.'
                : 'Configura ZOTERO_USER_ID e ZOTERO_API_KEY sul server.'
            }</div>`;
      };

      const renderNotes = () => {
        const container = root.querySelector<HTMLElement>('#rsResearchNotes');
        if (!container) return;
        const source = sources.find((entry) => entry.ref === notesRef) ?? sources[0];
        if (!source) {
          container.innerHTML = '<div class="rs-empty">Nessuna fonte disponibile.</div>';
          return;
        }
        notesRef = source.ref;
        const value = notes[String(source.ref)] ?? '';
        container.innerHTML = `
          <div class="rs-notes-grid">
            <aside class="rs-notes-list">
              ${sources
                .map(
                  (entry) => `
                <button class="rs-list-item${entry.ref === notesRef ? ' active' : ''}" data-note-ref="${entry.ref}">
                  <span class="rs-list-title">${escapeHtml(entry.title)}</span>
                  <span class="rs-list-sub">#${entry.ref} · ${escapeHtml(entry.authors)} · ${entry.year}</span>
                  ${notes[String(entry.ref)] ? '<span class="rs-chip rs-chip-ok">nota</span>' : ''}
                </button>`,
                )
                .join('')}
            </aside>
            <section class="rs-notes-editor">
              <h2>${escapeHtml(source.title)}</h2>
              <p class="rs-meta">${escapeHtml(source.authors)} · ${source.year} · ${escapeHtml(source.venue)}</p>
              <textarea id="rsResearchNoteText" class="rs-notes-textarea" placeholder="Note di lettura: tesi dell'autore, metodo, dati, criticità, collegamenti con il progetto…">${escapeHtml(value)}</textarea>
              <div class="rs-notes-actions">
                <span class="rs-meta" id="rsResearchNoteCount">${value.length} caratteri</span>
                <button class="rs-button rs-button-ghost" id="rsResearchNotesExport">Esporta note (.md)</button>
              </div>
            </section>
          </div>
        `;
      };

      const renderTabs = () => {
        root.querySelectorAll<HTMLElement>('.rs-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === activeTab));
        root.querySelectorAll<HTMLElement>('.rs-tab-panel').forEach((panel) => {
          panel.hidden = panel.dataset.panel !== activeTab;
        });
      };

      // ── Shell ─────────────────────────────────────────────────────────────
      root.innerHTML = `
        <div class="rs-ws rs-ws-research">
          <div class="rs-ws-toolbar">
            <div class="rs-ws-heading">
              <h1>Research Workbench</h1>
              <p>Revisione della letteratura, citazioni ed export per il dottorato${fetchedAt ? ` · aggiornato ${escapeHtml(new Date(fetchedAt).toLocaleString())}` : ''}</p>
            </div>
            <div class="rs-ws-stats">
              <div class="rs-stat"><span class="rs-stat-value">${sources.length}</span><span class="rs-stat-label">fonti curate</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${library.length}</span><span class="rs-stat-label">item Zotero</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${zoteroConfigured ? 'live' : 'offline'}</span><span class="rs-stat-label">libreria</span></div>
            </div>
          </div>

          <div class="rs-tabs" role="tablist">
            <button class="rs-tab active" data-tab="library" role="tab">Bibliografia</button>
            <button class="rs-tab" data-tab="coverage" role="tab">Copertura</button>
            <button class="rs-tab" data-tab="zotero" role="tab">Zotero</button>
            <button class="rs-tab" data-tab="notes" role="tab">Note</button>
          </div>

          <div class="rs-tab-panel" data-panel="library">
            <div class="rs-ws-controls">
              <input id="rsResearchQuery" class="rs-input" type="search" placeholder="Cerca… (author: / year: / theme:A / type:journal / dim:tradeExposure)">
              <span class="rs-meta" id="rsResearchResultCount"></span>
              <span class="rs-bib-export">
                <button class="rs-button rs-button-ghost" data-export="bibtex">BibTeX</button>
                <button class="rs-button rs-button-ghost" data-export="ris">RIS</button>
                <button class="rs-button rs-button-ghost" data-export="csv">CSV</button>
              </span>
            </div>
            <div class="rs-ws-body rs-ws-body-bib">
              <section class="rs-ws-list rs-bib-table-wrap">
                <table class="rs-bib-table">
                  <thead>
                    <tr>
                      ${SORT_COLUMNS.map(
                        (column) =>
                          `<th class="rs-bib-th${sortKey === column.key ? ' sorted' : ''}" data-sort="${column.key}">${column.label}${
                            sortKey === column.key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''
                          }</th>`,
                      ).join('')}
                    </tr>
                  </thead>
                  <tbody id="rsResearchTableBody"></tbody>
                </table>
              </section>
              <aside class="rs-ws-detail" id="rsResearchDetail"></aside>
            </div>
            <div class="ai-flow-toggle-desc" id="rsResearchStatus">${escapeHtml(statusMessage)}</div>
          </div>

          <div class="rs-tab-panel" data-panel="coverage" hidden>
            <div id="rsResearchCoverage"></div>
          </div>

          <div class="rs-tab-panel" data-panel="zotero" hidden>
            <div id="rsResearchZotero"></div>
          </div>

          <div class="rs-tab-panel" data-panel="notes" hidden>
            <div id="rsResearchNotes"></div>
          </div>
        </div>
      `;

      // ── Delegated events ──────────────────────────────────────────────────
      root.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;

        const tab = target.closest<HTMLElement>('.rs-tab');
        if (tab?.dataset.tab) {
          activeTab = tab.dataset.tab as TabId;
          renderTabs();
          if (activeTab === 'coverage') renderCoverage();
          if (activeTab === 'zotero') renderZotero();
          if (activeTab === 'notes') renderNotes();
          return;
        }

        const sortHeader = target.closest<HTMLElement>('[data-sort]');
        if (sortHeader?.dataset.sort) {
          const key = sortHeader.dataset.sort as SortKey;
          if (key === sortKey) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          else {
            sortKey = key;
            sortDirection = 'asc';
          }
          renderLibrary();
          return;
        }

        const row = target.closest<HTMLElement>('[data-ref]');
        if (row?.dataset.ref && !target.closest('[data-copy]')) {
          selectedRef = Number(row.dataset.ref);
          renderLibrary();
          return;
        }

        const copyButton = target.closest<HTMLElement>('[data-copy]');
        if (copyButton) {
          const source = sources.find((entry) => entry.ref === Number(copyButton.dataset.ref));
          if (!source) return;
          const text = copyButton.dataset.copy === 'bibtex' ? formatBibtex(source) : formatApa(source);
          void copyText(text).then((ok) => setStatus(ok ? 'Copiato negli appunti.' : 'Copia non disponibile nel browser.'));
          return;
        }

        const exportButton = target.closest<HTMLElement>('[data-export]');
        if (exportButton) {
          const rows = filtered();
          const kind = exportButton.dataset.export;
          if (kind === 'bibtex') download('risk-sentinel-bibliography.bib', toBibtexCollection(rows), 'application/x-bibtex');
          if (kind === 'ris') download('risk-sentinel-bibliography.ris', toRisCollection(rows), 'application/x-research-info-systems');
          if (kind === 'csv') download('risk-sentinel-bibliography.csv', toCsv(rows), 'text/csv');
          setStatus(`Esportate ${rows.length} fonti (${String(kind).toUpperCase()}).`);
          return;
        }

        const noteRef = target.closest<HTMLElement>('[data-note-ref]');
        if (noteRef?.dataset.noteRef) {
          notesRef = Number(noteRef.dataset.noteRef);
          renderNotes();
          return;
        }

        if (target.id === 'rsResearchNotesExport') {
          const markdown = sources
            .filter((source) => (notes[String(source.ref)] ?? '').trim())
            .map((source) => `## [${source.ref}] ${source.title}\n\n${notes[String(source.ref)]}\n`)
            .join('\n');
          download('risk-sentinel-reading-notes.md', markdown || '# Nessuna nota\n', 'text/markdown');
          setStatus('Note esportate.');
        }
      });

      root.addEventListener('input', (event) => {
        const target = event.target as HTMLElement;
        if (target.id === 'rsResearchQuery') {
          queryInput = (target as HTMLInputElement).value;
          renderLibrary();
          return;
        }
        if (target.id === 'rsResearchNoteText') {
          const textarea = target as HTMLTextAreaElement;
          notes[String(notesRef)] = textarea.value;
          saveNotes(notes);
          const count = root.querySelector<HTMLElement>('#rsResearchNoteCount');
          if (count) count.textContent = `${textarea.value.length} caratteri`;
        }
      });

      root.addEventListener('keydown', (event) => {
        if (event.key === '/' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
          event.preventDefault();
          root.querySelector<HTMLInputElement>('#rsResearchQuery')?.focus();
        }
      });

      renderTabs();
      renderLibrary();
    },
  };
}
