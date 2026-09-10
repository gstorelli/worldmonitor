/**
 * Policy — regulatory monitor and compliance analysis workspace.
 *
 * A standalone application (not a dashboard variant): curated open normative
 * registry (EUR-Lex / Gazzetta Ufficiale) plus the live n8n policy monitor.
 */

import { escapeHtml } from '@/utils/sanitize';
import type { AppWorkspace } from '../types';

interface PolicyEntry {
  id: string;
  title: string;
  jurisdiction: string;
  topic: string;
  reference: string;
  url: string;
  riskCategories: string[];
  chokepoints: string[];
  summary: string;
  gap: string;
  customsImplication: string;
}

interface PolicyPayload {
  entries: PolicyEntry[];
  monitor: Record<string, unknown>[];
  fetchedAt: string;
}

const JURISDICTION_LABELS: Record<string, string> = { eu: 'Unione Europea', it: 'Italia' };

function monitorCard(item: Record<string, unknown>): string {
  const title = String(item.title ?? item.name ?? item.headline ?? item.reference ?? 'Aggiornamento normativo');
  const summary = String(item.summary ?? item.description ?? item.abstract ?? '');
  const url = typeof item.url === 'string' ? item.url : typeof item.link === 'string' ? item.link : '';
  const date = String(item.publishedAt ?? item.date ?? item.pubDate ?? '');
  const source = String(item.source ?? item.provider ?? '');
  return `<article class="rs-card">
    <h3>${escapeHtml(title)}</h3>
    <p class="rs-meta">${escapeHtml([source, date.slice(0, 10)].filter(Boolean).join(' · '))}</p>
    ${summary ? `<p>${escapeHtml(summary)}</p>` : ''}
    ${url ? `<a class="rs-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Apri ↗</a>` : ''}
  </article>`;
}

export function createPolicyWorkspace(): AppWorkspace {
  return {
    async mount(root: HTMLElement): Promise<void> {
      root.innerHTML = '<div class="rs-ws rs-loading">Caricamento registro normativo…</div>';

      let payload: PolicyPayload;
      try {
        const res = await fetch('/api/policy/registry', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        payload = (await res.json()) as PolicyPayload;
      } catch (error) {
        root.innerHTML = `<div class="rs-ws"><div class="rs-empty">Impossibile caricare il registro: ${escapeHtml(
          error instanceof Error ? error.message : String(error),
        )}</div></div>`;
        return;
      }

      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      const monitor = Array.isArray(payload.monitor) ? payload.monitor : [];
      const jurisdictions = [...new Set(entries.map((entry) => entry.jurisdiction).filter(Boolean))];
      const categories = [...new Set(entries.flatMap((entry) => entry.riskCategories ?? []))].sort();

      let activeTab: 'registry' | 'monitor' = 'registry';
      const tabClass = (tab: 'registry' | 'monitor'): string => `rs-tab${activeTab === tab ? ' active' : ''}`;
      let selectedId = entries[0]?.id ?? '';
      let jurisdiction = 'ALL';
      let category = 'ALL';
      let query = '';

      root.innerHTML = `
        <div class="rs-ws rs-ws-policy">
          <div class="rs-ws-toolbar">
            <div class="rs-ws-heading">
              <h1>Policy &amp; Compliance</h1>
              <p>Registro normativo aperto e gap regolatori mappati sulle categorie di rischio</p>
            </div>
            <div class="rs-ws-stats">
              <div class="rs-stat"><span class="rs-stat-value">${entries.length}</span><span class="rs-stat-label">norme</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${monitor.length}</span><span class="rs-stat-label">monitor</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${jurisdictions.length}</span><span class="rs-stat-label">giurisdizioni</span></div>
            </div>
          </div>

          <div class="rs-tabs" role="tablist">
            <button class="${tabClass('registry')}" data-tab="registry" role="tab">Registro normativo</button>
            <button class="${tabClass('monitor')}" data-tab="monitor" role="tab">Monitor policy (n8n)</button>
          </div>

          <div class="rs-tab-panel" data-panel="registry">
            <div class="rs-ws-controls">
              <input id="rsPolicyQuery" class="rs-input" type="search" placeholder="Cerca per titolo, riferimento, tema…">
              <select id="rsPolicyJurisdiction" class="rs-select">
                <option value="ALL">Tutte le giurisdizioni</option>
                ${jurisdictions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(JURISDICTION_LABELS[value] ?? value)}</option>`).join('')}
              </select>
              <select id="rsPolicyCategory" class="rs-select">
                <option value="ALL">Tutte le categorie di rischio</option>
                ${categories.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}
              </select>
            </div>
            <div class="rs-ws-body">
              <section class="rs-ws-list" id="rsPolicyList"></section>
              <aside class="rs-ws-detail" id="rsPolicyDetail"></aside>
            </div>
          </div>

          <div class="rs-tab-panel" data-panel="monitor" hidden>
            <div class="rs-card-grid" id="rsPolicyMonitor"></div>
          </div>
        </div>
      `;

      const listEl = root.querySelector<HTMLElement>('#rsPolicyList');
      const detailEl = root.querySelector<HTMLElement>('#rsPolicyDetail');
      const monitorEl = root.querySelector<HTMLElement>('#rsPolicyMonitor');
      if (!listEl || !detailEl || !monitorEl) return;

      const filtered = () =>
        entries.filter((entry) => {
          if (jurisdiction !== 'ALL' && entry.jurisdiction !== jurisdiction) return false;
          if (category !== 'ALL' && !(entry.riskCategories ?? []).includes(category)) return false;
          if (!query) return true;
          const haystack = `${entry.title} ${entry.reference} ${entry.topic} ${entry.summary}`.toLowerCase();
          return haystack.includes(query);
        });

      const renderDetail = () => {
        const entry = entries.find((candidate) => candidate.id === selectedId);
        if (!entry) {
          detailEl.innerHTML = '<div class="rs-empty">Seleziona una norma</div>';
          return;
        }
        detailEl.innerHTML = `
          <div class="rs-detail-head">
            <span class="rs-chip">${escapeHtml(JURISDICTION_LABELS[entry.jurisdiction] ?? entry.jurisdiction)}</span>
            <span class="rs-chip rs-chip-muted">${escapeHtml(entry.reference)}</span>
          </div>
          <h2>${escapeHtml(entry.title)}</h2>
          <p class="rs-meta">${escapeHtml(entry.topic)}</p>
          <h3>Sintesi</h3><p>${escapeHtml(entry.summary)}</p>
          <h3>Gap regolatorio</h3><p>${escapeHtml(entry.gap)}</p>
          <h3>Implicazione doganale</h3><p>${escapeHtml(entry.customsImplication)}</p>
          <div class="rs-detail-foot">
            ${(entry.riskCategories ?? []).map((value) => `<span class="rs-chip rs-chip-dim">${escapeHtml(value)}</span>`).join('')}
            ${(entry.chokepoints ?? []).map((value) => `<span class="rs-chip rs-chip-muted">${escapeHtml(value)}</span>`).join('')}
            ${entry.url ? `<a class="rs-link" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener">Testo normativo ↗</a>` : ''}
          </div>
        `;
      };

      const renderList = () => {
        const items = filtered();
        listEl.innerHTML = items.length
          ? items
              .map(
                (entry) => `
            <button class="rs-list-item${entry.id === selectedId ? ' active' : ''}" data-id="${escapeHtml(entry.id)}">
              <span class="rs-list-title">${escapeHtml(entry.title)}</span>
              <span class="rs-list-sub">${escapeHtml(entry.reference)}</span>
              <span class="rs-list-tags">${(entry.riskCategories ?? [])
                .slice(0, 3)
                .map((value) => `<span class="rs-chip">${escapeHtml(value)}</span>`)
                .join('')}</span>
            </button>`,
              )
              .join('')
          : '<div class="rs-empty">Nessuna norma corrisponde ai filtri.</div>';
      };

      listEl.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>('[data-id]');
        if (!button) return;
        selectedId = button.dataset.id as string;
        renderList();
        renderDetail();
      });
      root.querySelector<HTMLInputElement>('#rsPolicyQuery')?.addEventListener('input', (event) => {
        query = (event.target as HTMLInputElement).value.trim().toLowerCase();
        renderList();
      });
      root.querySelector<HTMLSelectElement>('#rsPolicyJurisdiction')?.addEventListener('change', (event) => {
        jurisdiction = (event.target as HTMLSelectElement).value;
        renderList();
      });
      root.querySelector<HTMLSelectElement>('#rsPolicyCategory')?.addEventListener('change', (event) => {
        category = (event.target as HTMLSelectElement).value;
        renderList();
      });

      root.querySelectorAll<HTMLElement>('.rs-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          activeTab = (tab.dataset.tab as 'registry' | 'monitor') ?? 'registry';
          root.querySelectorAll<HTMLElement>('.rs-tab').forEach((candidate) => candidate.classList.toggle('active', candidate === tab));
          root.querySelectorAll<HTMLElement>('.rs-tab-panel').forEach((panel) => {
            panel.hidden = panel.dataset.panel !== activeTab;
          });
        });
      });

      monitorEl.innerHTML = monitor.length
        ? monitor.map(monitorCard).join('')
        : '<div class="rs-empty">Nessun aggiornamento dal monitor n8n. La pipeline 06-policy-monitor popola `policy:monitor:v1`.</div>';

      renderList();
      renderDetail();
    },
  };
}
