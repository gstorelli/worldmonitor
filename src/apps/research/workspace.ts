/**
 * Research — academic workbench.
 *
 * Views: Bibliografia · Copertura · Novità accademiche (WIP) · Call for papers
 * (WIP) · Zotero · Note · Tesi. Independent application (shared shell only);
 * the state (notes, reading workflow, enrichment overrides, imports) is
 * persisted per user through /api/prefs/research.
 */

import { escapeHtml } from '@/utils/sanitize';
import type { AppWorkspace } from '../types';
import { CALLS_UPDATED_AT, callsForThemes, daysUntil } from './calls';
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
import { assignRefs, parseBibliography } from './importers';
import {
  allSources,
  readingEntry,
  withNote,
  withOverride,
  withReading,
  EMPTY_RESEARCH_STATE,
  type ReadingPriority,
  type ReadingState,
  type ResearchState,
} from './model';
import { loadResearchState, scheduleResearchStateSave } from './state';
import { generateThesisLatex, generateThesisMarkdown } from './thesis';
import type { ResearchPayload, ResearchSource, ZoteroItem } from './types';

const THEME_LABELS: Record<string, string> = {
  A: 'Customs AI',
  B: 'Supply chain / maritime',
  C: 'Multi-hazard / geospatial',
  D: 'LLM / XAI / accountability',
  E: 'Methodology / infrastructure',
};

const THEME_QUERIES: Record<string, string> = {
  A: '"customs risk" OR "border management" artificial intelligence',
  B: 'supply chain disruption maritime chokepoint risk',
  C: 'multi-hazard early warning geospatial climate extremes',
  D: 'explainable AI accountability large language models',
  E: 'trade facilitation customs digital infrastructure',
};

const STATE_LABELS: Record<ReadingState, string> = {
  'to-read': 'Da leggere',
  reading: 'In lettura',
  reviewed: 'Revisionata',
};

interface AcademicItem {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  date: string;
  venue: string;
  doi: string;
  url: string;
  citedByCount: number;
  source: string;
  abstract: string;
}

type TabId = 'library' | 'coverage' | 'news' | 'calls' | 'zotero' | 'notes' | 'thesis';

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
  let curated: ResearchSource[] = [];
  let library: ZoteroItem[] = [];
  let zoteroConfigured = false;
  let fetchedAt = '';
  let state: ResearchState = { ...EMPTY_RESEARCH_STATE };

  let activeTab: TabId = 'library';
  let queryInput = '';
  let sortKey: SortKey = 'ref';
  let sortDirection: SortDirection = 'asc';
  let selectedRef = 0;
  let notesRef = 0;
  let statusMessage = '';
  let importOpen = false;

  let newsTheme = 'A';
  let newsQuery: string = THEME_QUERIES.A ?? '';
  let newsDays = 365;
  let newsItems: AcademicItem[] = [];
  let newsError = '';
  let newsLoading = false;
  let lastEnrichment: { ref: number; fields: { doi?: string; venue?: string; year?: number; url?: string } } | null = null;

  let callsTheme = '';
  const thesisThemes = new Set<string>();
  let thesisIncludeNotes = true;
  let thesisIncludeCoverage = true;
  let thesisIncludeWorkflow = true;
  let thesisFormat: 'markdown' | 'latex' = 'markdown';
  let thesisPreview = '';

  const sources = (): ResearchSource[] => allSources(curated, state);

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

      curated = Array.isArray(payload.sources) ? payload.sources : [];
      library = Array.isArray(payload.library) ? payload.library : [];
      zoteroConfigured = Boolean(payload.zoteroConfigured);
      fetchedAt = payload.fetchedAt ?? new Date().toISOString();
      selectedRef = curated[0]?.ref ?? 0;
      notesRef = selectedRef;
      state = await loadResearchState();

      const commit = () => scheduleResearchStateSave(state);
      const setStatus = (message: string) => {
        statusMessage = message;
        const el = root.querySelector<HTMLElement>('#rsResearchStatus');
        if (el) el.textContent = message;
      };

      const filtered = (): ResearchSource[] =>
        sortSources(
          sources().filter((source) =>
            matchesResearchQuery(source, parseResearchQuery(queryInput), readingEntry(state, source.ref)),
          ),
          sortKey,
          sortDirection,
        );

      // ── Library ───────────────────────────────────────────────────────────
      const renderLibrary = () => {
        const listEl = root.querySelector<HTMLElement>('#rsResearchTableBody');
        const detailEl = root.querySelector<HTMLElement>('#rsResearchDetail');
        const countEl = root.querySelector<HTMLElement>('#rsResearchResultCount');
        if (!listEl || !detailEl) return;
        const rows = filtered();
        if (countEl) countEl.textContent = `${rows.length}/${sources().length}`;

        listEl.innerHTML = rows.length
          ? rows
              .map((source) => {
                const entry = readingEntry(state, source.ref);
                return `
            <tr class="rs-bib-row${source.ref === selectedRef ? ' active' : ''}" data-ref="${source.ref}">
              <td class="rs-bib-ref">${source.ref}</td>
              <td>${escapeHtml(source.authors)}</td>
              <td class="rs-bib-year">${source.year || '—'}</td>
              <td class="rs-bib-title">${escapeHtml(source.title)}${source.themeArea ? '' : ' <span class="rs-chip rs-chip-muted">importata</span>'}</td>
              <td class="rs-bib-venue">${escapeHtml(source.venue)}</td>
              <td><span class="rs-chip">${escapeHtml(source.themeArea || '—')}</span></td>
              <td class="rs-bib-type">${entry.state ? `<span class="rs-wf-badge ${entry.state}">${STATE_LABELS[entry.state]}</span>` : escapeHtml(source.type)}</td>
            </tr>`;
              })
              .join('')
          : '<tr><td colspan="7"><div class="rs-empty">Nessuna fonte corrisponde alla ricerca.</div></td></tr>';

        const source = sources().find((entry) => entry.ref === selectedRef);
        if (!source) {
          detailEl.innerHTML = '<div class="rs-empty">Seleziona una fonte</div>';
          return;
        }
        const entry = readingEntry(state, source.ref);
        detailEl.innerHTML = `
          <div class="rs-detail-head">
            <span class="rs-chip">${source.themeArea ? `Tema ${escapeHtml(source.themeArea)} — ${escapeHtml(THEME_LABELS[source.themeArea] ?? '')}` : 'importata'}</span>
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
              <button class="rs-button rs-button-ghost" data-enrich="${source.ref}">Arricchisci (Crossref)</button>
              <span class="rs-meta">key: ${escapeHtml(citationKey(source))}</span>
            </div>
            <div class="rs-meta" id="rsEnrichResult"></div>
          </div>

          <div class="rs-workflow">
            <div class="rs-workflow-row">
              ${(['to-read', 'reading', 'reviewed'] as ReadingState[])
                .map(
                  (value) =>
                    `<button class="rs-wf-btn${entry.state === value ? ' active' : ''}" data-state="${value}" data-ref="${source.ref}">${STATE_LABELS[value]}</button>`,
                )
                .join('')}
            </div>
            <div class="rs-workflow-row">
              <select class="rs-select" data-priority data-ref="${source.ref}">
                <option value="">Priorità —</option>
                ${['high', 'medium', 'low']
                  .map((value) => `<option value="${value}"${entry.priority === value ? ' selected' : ''}>${value}</option>`)
                  .join('')}
              </select>
              <input class="rs-input" data-tags data-ref="${source.ref}" placeholder="tag, separati, da virgole" value="${escapeHtml((entry.tags ?? []).join(', '))}" style="max-width:280px">
            </div>
          </div>

          <h3>Sintesi</h3><p>${escapeHtml(source.summary || '—')}</p>
          <h3>Limiti</h3><p>${escapeHtml(source.limitation || '—')}</p>
          <h3>Contributo alla tesi</h3><p>${escapeHtml(source.contribution || '—')}</p>
          <div class="rs-detail-foot">
            ${(source.dimensions ?? []).map((dim) => `<span class="rs-chip rs-chip-dim">${escapeHtml(dim)}</span>`).join('')}
            ${source.doi ? `<a class="rs-link" href="https://doi.org/${escapeHtml(source.doi)}" target="_blank" rel="noopener">DOI ↗</a>` : ''}
            ${source.url ? `<a class="rs-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener">Fonte ↗</a>` : ''}
          </div>
        `;
      };

      // ── Coverage ──────────────────────────────────────────────────────────
      const renderCoverage = () => {
        const container = root.querySelector<HTMLElement>('#rsResearchCoverage');
        if (!container) return;
        const list = sources();
        const matrix = computeDimensionCoverage(list);
        const gaps = matrix.filter((entry) => entry.count === 0);
        const fragile = matrix.filter((entry) => entry.count === 1);
        const themes = computeThemeDistribution(list, THEME_LABELS);
        const types = computeTypeDistribution(list);
        const years = computeYearHistogram(list);
        const maxCount = Math.max(1, ...matrix.map((entry) => entry.count));
        const bars = (entries: { key: string; label: string; count: number }[]) => {
          const max = Math.max(1, entries[0]?.count ?? 1);
          return entries
            .map(
              (entry) => `
            <div class="rs-bar-row">
              <span class="rs-bar-label">${escapeHtml(entry.label || '—')}</span>
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
            <thead><tr><th>Dimensione (modello 8D)</th>${list.map((source) => `<th title="${escapeHtml(source.title)}">${source.ref}</th>`).join('')}<th class="rs-cov-count">Fonti</th></tr></thead>
            <tbody>
              ${matrix
                .map(
                  (entry) => `
                <tr class="${entry.count === 0 ? 'rs-cov-gap' : ''}">
                  <th scope="row">${escapeHtml(entry.label)}</th>
                  ${list
                    .map(
                      (source) =>
                        `<td class="rs-cov-cell${entry.refs.includes(source.ref) ? ' covered' : ''}">${entry.refs.includes(source.ref) ? '●' : ''}</td>`,
                    )
                    .join('')}
                  <td class="rs-cov-count"><span class="rs-cov-bar"><span style="width:${Math.round((entry.count / maxCount) * 100)}%"></span></span>${entry.count}</td>
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

      // ── Academic news (WIP) ───────────────────────────────────────────────
      const renderNews = () => {
        const container = root.querySelector<HTMLElement>('#rsResearchNews');
        if (!container) return;
        container.innerHTML = `
          <div class="rs-wip"><span class="rs-chip rs-chip-wip">WIP</span>
            <p>Cerca articoli accademici recenti (OpenAlex, senza chiave API) sui temi del dottorato e permette di aggiungerli alla tua libreria Zotero con un click. I risultati vanno sempre verificati: la ricerca è per parole chiave, non peer-reviewed.</p>
          </div>
          <div class="rs-ws-controls">
            <select class="rs-select" id="rsNewsTheme">
              ${Object.entries(THEME_LABELS)
                .map(([key, label]) => `<option value="${key}"${newsTheme === key ? ' selected' : ''}>${key} — ${escapeHtml(label)}</option>`)
                .join('')}
            </select>
            <input class="rs-input" id="rsNewsQuery" value="${escapeHtml(newsQuery)}" placeholder="Parole chiave…">
            <select class="rs-select" id="rsNewsDays">
              ${[30, 90, 180, 365, 1095]
                .map((days) => `<option value="${days}"${newsDays === days ? ' selected' : ''}>ultimi ${days} giorni</option>`)
                .join('')}
            </select>
            <button class="rs-button" id="rsNewsSearch"${newsLoading ? ' disabled' : ''}>${newsLoading ? 'Cerco…' : 'Cerca novità'}</button>
          </div>
          <div class="rs-card-grid rs-card-grid-osint">
            ${newsItems
              .map(
                (item, index) => `
              <article class="rs-card">
                <div class="rs-card-head">
                  <span class="rs-chip rs-chip-muted">${escapeHtml(item.venue || item.source)}</span>
                  ${item.date ? `<span class="rs-meta">${escapeHtml(item.date)}</span>` : ''}
                </div>
                <h3>${escapeHtml(item.title)}</h3>
                <p class="rs-meta">${escapeHtml(item.authors || '—')}${item.citedByCount ? ` · citato ${item.citedByCount}×` : ''}</p>
                ${item.abstract ? `<p>${escapeHtml(item.abstract.slice(0, 220))}${item.abstract.length > 220 ? '…' : ''}</p>` : ''}
                <div class="rs-card-foot">
                  ${item.url ? `<a class="rs-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Apri ↗</a>` : '<span></span>'}
                  <button class="rs-button rs-button-ghost" data-zotero-news="${index}">Aggiungi a Zotero</button>
                </div>
              </article>`,
              )
              .join('') || `<div class="rs-empty">${newsError ? `Ricerca non disponibile: ${escapeHtml(newsError)}` : 'Nessun risultato: lancia una ricerca.'}</div>`}
          </div>
        `;
      };

      // ── Calls for papers (WIP) ────────────────────────────────────────────
      const renderCalls = () => {
        const container = root.querySelector<HTMLElement>('#rsResearchCalls');
        if (!container) return;
        const calls = callsForThemes(callsTheme ? [callsTheme] : []);
        container.innerHTML = `
          <div class="rs-wip"><span class="rs-chip rs-chip-wip">WIP</span>
            <p>Calendario curato delle venue ricorrenti (customs, supply chain, multi-hazard, XAI, metodologia) con la finestra tipica di sottomissione. Gli avvisi con data sono ordinati per scadenza; dove la deadline non è affidabile viene mostrata la finestra tipica — verifica sempre sul sito ufficiale. Una ricerca CFP live è pianificata.</p>
          </div>
          <div class="rs-chipbar">
            <button class="rs-chip-btn${callsTheme === '' ? ' active' : ''}" data-call-theme="">Tutti</button>
            ${Object.entries(THEME_LABELS)
              .map(([key, label]) => `<button class="rs-chip-btn${callsTheme === key ? ' active' : ''}" data-call-theme="${key}">${key} — ${escapeHtml(label)}</button>`)
              .join('')}
            <span class="rs-meta">aggiornato ${escapeHtml(CALLS_UPDATED_AT)}</span>
          </div>
          <div class="rs-call-list">
            ${calls
              .map((call) => {
                const days = daysUntil(call.deadline);
                return `
              <article class="rs-call">
                <div class="rs-card-head">
                  ${call.themes.map((theme) => `<span class="rs-chip">${escapeHtml(theme)}</span>`).join('')}
                  ${days !== null ? `<span class="rs-chip rs-chip-wip">${days} giorni</span>` : `<span class="rs-chip rs-chip-muted">${escapeHtml(call.typicalWindow)}</span>`}
                </div>
                <h3>${escapeHtml(call.name)}</h3>
                <p class="rs-meta">${escapeHtml(call.scope)} · ${escapeHtml(call.location)}</p>
                <p>${escapeHtml(call.notes)}</p>
                <div class="rs-card-foot"><a class="rs-link" href="${escapeHtml(call.url)}" target="_blank" rel="noopener">Sito ufficiale ↗</a></div>
              </article>`;
              })
              .join('') || '<div class="rs-empty">Nessuna call per il tema selezionato.</div>'}
          </div>
        `;
      };

      // ── Zotero ────────────────────────────────────────────────────────────
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

      // ── Notes ─────────────────────────────────────────────────────────────
      const renderNotes = () => {
        const container = root.querySelector<HTMLElement>('#rsResearchNotes');
        if (!container) return;
        const list = sources();
        const source = list.find((entry) => entry.ref === notesRef) ?? list[0];
        if (!source) {
          container.innerHTML = '<div class="rs-empty">Nessuna fonte disponibile.</div>';
          return;
        }
        notesRef = source.ref;
        const value = state.notes[String(source.ref)] ?? '';
        container.innerHTML = `
          <div class="rs-notes-grid">
            <aside class="rs-notes-list">
              ${list
                .map(
                  (entry) => `
                <button class="rs-list-item${entry.ref === notesRef ? ' active' : ''}" data-note-ref="${entry.ref}">
                  <span class="rs-list-title">${escapeHtml(entry.title)}</span>
                  <span class="rs-list-sub">#${entry.ref} · ${escapeHtml(entry.authors)} · ${entry.year || '—'}</span>
                  ${state.notes[String(entry.ref)] ? '<span class="rs-chip rs-chip-ok">nota</span>' : ''}
                </button>`,
                )
                .join('')}
            </aside>
            <section class="rs-notes-editor">
              <h2>${escapeHtml(source.title)}</h2>
              <p class="rs-meta">${escapeHtml(source.authors)} · ${source.year} · ${escapeHtml(source.venue)}</p>
              <textarea id="rsResearchNoteText" class="rs-notes-textarea" placeholder="Note di lettura: tesi dell'autore, metodo, dati, criticità, collegamenti con il progetto…">${escapeHtml(value)}</textarea>
              <div class="rs-notes-actions">
                <span class="rs-meta" id="rsResearchNoteCount">${value.length} caratteri · salvato sul server</span>
                <button class="rs-button rs-button-ghost" id="rsResearchNotesExport">Esporta note (.md)</button>
              </div>
            </section>
          </div>
        `;
      };

      // ── Thesis ────────────────────────────────────────────────────────────
      const renderThesis = () => {
        const container = root.querySelector<HTMLElement>('#rsResearchThesis');
        if (!container) return;
        container.innerHTML = `
          <div class="rs-ws-controls">
            <span class="rs-meta">Temi</span>
            ${Object.entries(THEME_LABELS)
              .map(([key, label]) => `<button class="rs-chip-btn${thesisThemes.has(key) ? ' active' : ''}" data-thesis-theme="${key}">${key} — ${escapeHtml(label)}</button>`)
              .join('')}
            <span class="rs-meta">(nessuno = tutti)</span>
          </div>
          <div class="rs-ws-controls">
            <label class="rs-meta"><input type="checkbox" id="rsThesisNotes"${thesisIncludeNotes ? ' checked' : ''}> note di lettura</label>
            <label class="rs-meta"><input type="checkbox" id="rsThesisCoverage"${thesisIncludeCoverage ? ' checked' : ''}> tabella copertura</label>
            <label class="rs-meta"><input type="checkbox" id="rsThesisWorkflow"${thesisIncludeWorkflow ? ' checked' : ''}> stato/priorità/tag</label>
            <select class="rs-select" id="rsThesisFormat">
              <option value="markdown"${thesisFormat === 'markdown' ? ' selected' : ''}>Markdown</option>
              <option value="latex"${thesisFormat === 'latex' ? ' selected' : ''}>LaTeX</option>
            </select>
            <button class="rs-button" id="rsThesisGenerate">Genera</button>
            <button class="rs-button rs-button-ghost" id="rsThesisDownload">Scarica</button>
          </div>
          <pre class="rs-thesis-preview" id="rsThesisPreview">${escapeHtml(thesisPreview || 'Genera un capitolo di literature review con citazioni, note e tabella di copertura.')}</pre>
        `;
      };

      const renderTabs = () => {
        root.querySelectorAll<HTMLElement>('.rs-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === activeTab));
        root.querySelectorAll<HTMLElement>('.rs-tab-panel').forEach((panel) => {
          panel.hidden = panel.dataset.panel !== activeTab;
        });
      };

      const renderImportPanel = () => {
        const panel = root.querySelector<HTMLElement>('#rsImportPanel');
        if (panel) panel.hidden = !importOpen;
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
              <div class="rs-stat"><span class="rs-stat-value">${sources().length}</span><span class="rs-stat-label">fonti</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${Object.values(state.reading).filter((entry) => entry.state === 'reviewed').length}</span><span class="rs-stat-label">revisionate</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${Object.keys(state.notes).length}</span><span class="rs-stat-label">note</span></div>
            </div>
          </div>

          <div class="rs-tabs" role="tablist">
            <button class="rs-tab active" data-tab="library" role="tab">Bibliografia</button>
            <button class="rs-tab" data-tab="coverage" role="tab">Copertura</button>
            <button class="rs-tab" data-tab="news" role="tab">Novità accademiche <span class="rs-chip rs-chip-wip">WIP</span></button>
            <button class="rs-tab" data-tab="calls" role="tab">Call for papers <span class="rs-chip rs-chip-wip">WIP</span></button>
            <button class="rs-tab" data-tab="zotero" role="tab">Zotero</button>
            <button class="rs-tab" data-tab="notes" role="tab">Note</button>
            <button class="rs-tab" data-tab="thesis" role="tab">Tesi</button>
          </div>

          <div class="rs-tab-panel" data-panel="library">
            <div class="rs-ws-controls">
              <input id="rsResearchQuery" class="rs-input" type="search" placeholder="Cerca… (author: / year: / theme:A / type:journal / dim:… / status:reviewed / prio:high / tag:customs)">
              <span class="rs-meta" id="rsResearchResultCount"></span>
              <button class="rs-button rs-button-ghost" id="rsImportToggle">Importa BibTeX/RIS</button>
              <span class="rs-bib-export">
                <button class="rs-button rs-button-ghost" data-export="bibtex">BibTeX</button>
                <button class="rs-button rs-button-ghost" data-export="ris">RIS</button>
                <button class="rs-button rs-button-ghost" data-export="csv">CSV</button>
              </span>
            </div>
            <div class="rs-import-panel" id="rsImportPanel" hidden>
              <textarea id="rsImportText" class="rs-notes-textarea" placeholder="Incolla qui un export BibTeX o RIS…"></textarea>
              <div class="rs-notes-actions">
                <span class="rs-meta" id="rsImportStatus"></span>
                <button class="rs-button" id="rsImportButton">Importa</button>
              </div>
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

          <div class="rs-tab-panel" data-panel="coverage" hidden><div id="rsResearchCoverage"></div></div>
          <div class="rs-tab-panel" data-panel="news" hidden><div id="rsResearchNews"></div></div>
          <div class="rs-tab-panel" data-panel="calls" hidden><div id="rsResearchCalls"></div></div>
          <div class="rs-tab-panel" data-panel="zotero" hidden><div id="rsResearchZotero"></div></div>
          <div class="rs-tab-panel" data-panel="notes" hidden><div id="rsResearchNotes"></div></div>
          <div class="rs-tab-panel" data-panel="thesis" hidden><div id="rsResearchThesis"></div></div>
        </div>
      `;

      // ── Events ────────────────────────────────────────────────────────────
      root.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;

        const tab = target.closest<HTMLElement>('.rs-tab');
        if (tab?.dataset.tab) {
          activeTab = tab.dataset.tab as TabId;
          renderTabs();
          if (activeTab === 'coverage') renderCoverage();
          if (activeTab === 'news') renderNews();
          if (activeTab === 'calls') renderCalls();
          if (activeTab === 'zotero') renderZotero();
          if (activeTab === 'notes') renderNotes();
          if (activeTab === 'thesis') renderThesis();
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

        const copyButton = target.closest<HTMLElement>('[data-copy]');
        if (copyButton) {
          const source = sources().find((entry) => entry.ref === Number(copyButton.dataset.ref));
          if (!source) return;
          const text = copyButton.dataset.copy === 'bibtex' ? formatBibtex(source) : formatApa(source);
          void copyText(text).then((ok) => setStatus(ok ? 'Copiato negli appunti.' : 'Copia non disponibile nel browser.'));
          return;
        }

        const stateButton = target.closest<HTMLElement>('[data-state]');
        if (stateButton?.dataset.state && stateButton.dataset.ref) {
          const ref = Number(stateButton.dataset.ref);
          const next = readingEntry(state, ref).state === stateButton.dataset.state ? undefined : (stateButton.dataset.state as ReadingState);
          state = withReading(state, ref, { state: next });
          commit();
          renderLibrary();
          return;
        }

        const enrichButton = target.closest<HTMLElement>('[data-enrich]');
        if (enrichButton?.dataset.enrich) {
          const ref = Number(enrichButton.dataset.enrich);
          const source = sources().find((entry) => entry.ref === ref);
          if (!source) return;
          setStatus('Interrogo Crossref…');
          const params = source.doi ? `doi=${encodeURIComponent(source.doi)}` : `title=${encodeURIComponent(source.title)}`;
          void fetch(`/api/research/doi?${params}`, { credentials: 'same-origin' })
            .then((res) => res.json())
            .then((data: { found?: boolean; doi?: string; venue?: string; year?: number | null; url?: string }) => {
              const resultEl = root.querySelector<HTMLElement>('#rsEnrichResult');
              if (!data?.found) {
                if (resultEl) resultEl.textContent = 'Nessun metadato Crossref trovato.';
                return;
              }
              lastEnrichment = {
                ref,
                fields: {
                  ...(data.doi ? { doi: data.doi } : {}),
                  ...(data.venue ? { venue: data.venue } : {}),
                  ...(data.year ? { year: data.year } : {}),
                  ...(data.url ? { url: data.url } : {}),
                },
              };
              if (resultEl) {
                resultEl.innerHTML = `Suggerito: ${escapeHtml(
                  [data.venue, data.year ? String(data.year) : '', data.doi].filter(Boolean).join(' · '),
                )} <button class="rs-button rs-button-ghost" data-apply-override="${ref}">Applica</button>`;
              }
              setStatus('Metadati Crossref disponibili.');
            })
            .catch(() => setStatus('Crossref non raggiungibile.'));
          return;
        }

        const applyButton = target.closest<HTMLElement>('[data-apply-override]');
        if (applyButton && lastEnrichment) {
          state = withOverride(state, lastEnrichment.ref, lastEnrichment.fields);
          commit();
          lastEnrichment = null;
          renderLibrary();
          setStatus('Metadati applicati alla fonte.');
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

        const row = target.closest<HTMLElement>('[data-ref]');
        if (row?.dataset.ref && !target.closest('button') && !target.closest('select')) {
          selectedRef = Number(row.dataset.ref);
          renderLibrary();
          return;
        }

        const noteRef = target.closest<HTMLElement>('[data-note-ref]');
        if (noteRef?.dataset.noteRef) {
          notesRef = Number(noteRef.dataset.noteRef);
          renderNotes();
          return;
        }

        if (target.id === 'rsResearchNotesExport') {
          const markdown = sources()
            .filter((source) => (state.notes[String(source.ref)] ?? '').trim())
            .map((source) => `## [${source.ref}] ${source.title}\n\n${state.notes[String(source.ref)]}\n`)
            .join('\n');
          download('risk-sentinel-reading-notes.md', markdown || '# Nessuna nota\n', 'text/markdown');
          setStatus('Note esportate.');
          return;
        }

        if (target.id === 'rsImportToggle') {
          importOpen = !importOpen;
          renderImportPanel();
          return;
        }

        if (target.id === 'rsImportButton') {
          const textarea = root.querySelector<HTMLTextAreaElement>('#rsImportText');
          const status = root.querySelector<HTMLElement>('#rsImportStatus');
          const parsed = parseBibliography(textarea?.value ?? '');
          if (parsed.length === 0) {
            if (status) status.textContent = 'Nessuna voce riconosciuta (BibTeX o RIS).';
            return;
          }
          const added = assignRefs(parsed, state.imported);
          state = { ...state, imported: [...state.imported, ...added] };
          commit();
          if (textarea) textarea.value = '';
          if (status) status.textContent = `${added.length} fonti importate.`;
          renderLibrary();
          return;
        }

        const callTheme = target.closest<HTMLElement>('[data-call-theme]');
        if (callTheme) {
          callsTheme = callTheme.dataset.callTheme ?? '';
          renderCalls();
          return;
        }

        const newsButton = target.closest<HTMLElement>('[data-zotero-news]');
        if (newsButton?.dataset.zoteroNews) {
          const item = newsItems[Number(newsButton.dataset.zoteroNews)];
          if (!item) return;
          setStatus('Invio a Zotero…');
          void fetch('/api/zotero/items', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: item.title,
              authors: item.authors,
              year: item.year,
              type: 'journal',
              venue: item.venue,
              doi: item.doi,
              url: item.url,
              abstractNote: item.abstract,
            }),
          })
            .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
            .then(({ ok, body }) => {
              const data = body as { error?: string; libraryUrl?: string };
              setStatus(ok ? `Aggiunto a Zotero${data.libraryUrl ? ` — ${data.libraryUrl}` : '.'}` : `Zotero: ${data.error ?? 'errore'}`);
            })
            .catch(() => setStatus('Zotero non raggiungibile.'));
          return;
        }

        if (target.id === 'rsNewsSearch') {
          const queryInputEl = root.querySelector<HTMLInputElement>('#rsNewsQuery');
          newsQuery = queryInputEl?.value.trim() || THEME_QUERIES[newsTheme] || '';
          newsLoading = true;
          newsError = '';
          renderNews();
          void fetch(`/api/research/papers?q=${encodeURIComponent(newsQuery)}&days=${newsDays}&limit=12`, {
            credentials: 'same-origin',
          })
            .then((res) => res.json())
            .then((data: { items?: AcademicItem[]; error?: string }) => {
              newsItems = Array.isArray(data.items) ? data.items : [];
              newsError = data.error ?? '';
              newsLoading = false;
              renderNews();
            })
            .catch(() => {
              newsItems = [];
              newsError = 'rete non raggiungibile';
              newsLoading = false;
              renderNews();
            });
          return;
        }

        const thesisThemeButton = target.closest<HTMLElement>('[data-thesis-theme]');
        if (thesisThemeButton?.dataset.thesisTheme) {
          const key = thesisThemeButton.dataset.thesisTheme;
          if (thesisThemes.has(key)) thesisThemes.delete(key);
          else thesisThemes.add(key);
          renderThesis();
          return;
        }

        if (target.id === 'rsThesisGenerate' || target.id === 'rsThesisDownload') {
          const options = {
            themes: [...thesisThemes],
            includeNotes: thesisIncludeNotes,
            includeCoverage: thesisIncludeCoverage,
            includeWorkflow: thesisIncludeWorkflow,
          };
          const content =
            thesisFormat === 'latex'
              ? generateThesisLatex(sources(), state, options)
              : generateThesisMarkdown(sources(), state, options);
          if (target.id === 'rsThesisDownload') {
            download(
              thesisFormat === 'latex' ? 'risk-sentinel-literature-review.tex' : 'risk-sentinel-literature-review.md',
              content,
              thesisFormat === 'latex' ? 'application/x-tex' : 'text/markdown',
            );
            setStatus('Capitolo esportato.');
          } else {
            thesisPreview = content;
            renderThesis();
            setStatus('Anteprima generata.');
          }
        }
      });

      root.addEventListener('change', (event) => {
        const target = event.target as HTMLElement;
        if (target.matches('[data-priority]')) {
          const select = target as HTMLSelectElement;
          const ref = Number(select.dataset.ref);
          const priority = select.value ? (select.value as ReadingPriority) : undefined;
          state = withReading(state, ref, { priority });
          commit();
          return;
        }
        if (target.matches('[data-tags]')) {
          const input = target as HTMLInputElement;
          const ref = Number(input.dataset.ref);
          const tags = input.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
          state = withReading(state, ref, { tags });
          commit();
          setStatus('Tag aggiornati.');
          return;
        }
        if (target.id === 'rsNewsTheme') {
          newsTheme = (target as HTMLSelectElement).value;
          newsQuery = THEME_QUERIES[newsTheme] ?? '';
          renderNews();
          return;
        }
        if (target.id === 'rsNewsDays') {
          newsDays = Number((target as HTMLSelectElement).value) || 365;
          return;
        }
        if (target.id === 'rsThesisNotes') thesisIncludeNotes = (target as HTMLInputElement).checked;
        if (target.id === 'rsThesisCoverage') thesisIncludeCoverage = (target as HTMLInputElement).checked;
        if (target.id === 'rsThesisWorkflow') thesisIncludeWorkflow = (target as HTMLInputElement).checked;
        if (target.id === 'rsThesisFormat') {
          thesisFormat = (target as HTMLSelectElement).value === 'latex' ? 'latex' : 'markdown';
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
          state = withNote(state, notesRef, textarea.value);
          commit();
          const count = root.querySelector<HTMLElement>('#rsResearchNoteCount');
          if (count) count.textContent = `${textarea.value.length} caratteri · salvato sul server`;
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
