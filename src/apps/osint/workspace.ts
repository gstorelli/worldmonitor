/**
 * OSINT — open-source intelligence workspace.
 *
 * A standalone application (not a dashboard variant): topic-scoped signals from
 * the n8n intelligence digest, ranked by severity/score, with a source link per
 * signal. Shares only the header/footer shell.
 */

import { escapeHtml } from '@/utils/sanitize';
import type { AppWorkspace } from '../types';

interface DigestItem {
  title: string;
  summary: string;
  url: string;
  severity: string;
  score: number;
  source: string;
}

interface DigestSection {
  topic: string;
  title: string;
  items: DigestItem[];
}

interface DigestPayload {
  digest?: { sections?: DigestSection[] };
  fetchedAt?: string;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function severityRank(item: DigestItem): number {
  return SEVERITY_ORDER[item.severity?.toLowerCase()] ?? 0;
}

export function createOsintWorkspace(): AppWorkspace {
  return {
    async mount(root: HTMLElement): Promise<void> {
      let sections: DigestSection[] = [];
      let activeTopic = 'ALL';
      let activeSeverity = 'ALL';
      let query = '';
      let fetchedAt = '';

      root.innerHTML = `
        <div class="rs-ws rs-ws-osint">
          <div class="rs-ws-toolbar">
            <div class="rs-ws-heading">
              <h1>Open-Source Intelligence</h1>
              <p>Segnali OSINT aggregati dalle pipeline n8n, ordinati per severità</p>
            </div>
            <div class="rs-ws-stats">
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintCount">0</span><span class="rs-stat-label">segnali</span></div>
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintTopicCount">0</span><span class="rs-stat-label">topic</span></div>
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintUpdated">–</span><span class="rs-stat-label">aggiornato</span></div>
            </div>
            <button class="rs-button" id="rsOsintRefresh">Aggiorna</button>
          </div>

          <div class="rs-chipbar" id="rsOsintTopics"></div>

          <div class="rs-ws-controls">
            <input id="rsOsintQuery" class="rs-input" type="search" placeholder="Cerca nei segnali…">
            <select id="rsOsintSeverity" class="rs-select">
              <option value="ALL">Tutte le severità</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div class="rs-card-grid rs-card-grid-osint" id="rsOsintGrid"></div>
        </div>
      `;

      const gridEl = root.querySelector<HTMLElement>('#rsOsintGrid');
      const chipbar = root.querySelector<HTMLElement>('#rsOsintTopics');
      const countEl = root.querySelector<HTMLElement>('#rsOsintCount');
      const topicsEl = root.querySelector<HTMLElement>('#rsOsintTopicCount');
      const updatedEl = root.querySelector<HTMLElement>('#rsOsintUpdated');
      if (!gridEl || !chipbar || !countEl || !topicsEl || !updatedEl) return;

      const allItems = () => sections.flatMap((section) => section.items);
      const visibleItems = () => {
        const items = activeTopic === 'ALL' ? allItems() : sections.find((section) => section.topic === activeTopic)?.items ?? [];
        return items
          .filter((item) => activeSeverity === 'ALL' || item.severity?.toLowerCase() === activeSeverity)
          .filter((item) => {
            if (!query) return true;
            const haystack = `${item.title} ${item.summary} ${item.source}`.toLowerCase();
            return haystack.includes(query);
          })
          .sort((a, b) => severityRank(b) - severityRank(a) || (b.score ?? 0) - (a.score ?? 0));
      };

      const renderChips = () => {
        const chips = [
          `<button class="rs-chip-btn${activeTopic === 'ALL' ? ' active' : ''}" data-topic="ALL">Tutti</button>`,
          ...sections.map(
            (section) =>
              `<button class="rs-chip-btn${activeTopic === section.topic ? ' active' : ''}" data-topic="${escapeHtml(section.topic)}">${escapeHtml(
                section.title,
              )} <span class="rs-chip-count">${section.items.length}</span></button>`,
          ),
        ];
        chipbar.innerHTML = chips.join('');
      };

      const render = () => {
        const items = visibleItems();
        gridEl.innerHTML = items.length
          ? items
              .map(
                (item) => `
            <article class="rs-card rs-card-osint rs-sev-${escapeHtml((item.severity || 'low').toLowerCase())}">
              <div class="rs-card-head">
                <span class="rs-sev">${escapeHtml(item.severity || 'low')}</span>
                ${typeof item.score === 'number' ? `<span class="rs-score">score ${Math.round(item.score)}</span>` : ''}
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ''}
              <div class="rs-card-foot">
                <span class="rs-meta">${escapeHtml(item.source || '')}</span>
                ${item.url ? `<a class="rs-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Fonte ↗</a>` : ''}
              </div>
            </article>`,
              )
              .join('')
          : '<div class="rs-empty">Nessun segnale con i filtri correnti.</div>';
        if (countEl) countEl.textContent = String(items.length);
        if (topicsEl) topicsEl.textContent = String(sections.length);
        if (updatedEl) updatedEl.textContent = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : '–';
      };

      const load = async (showLoading: boolean) => {
        if (showLoading) gridEl.innerHTML = '<div class="rs-loading">Aggiornamento segnali…</div>';
        try {
          const res = await fetch('/api/notify/digest?limit=12', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const payload = (await res.json()) as DigestPayload;
          sections = Array.isArray(payload.digest?.sections) ? payload.digest.sections : [];
          fetchedAt = payload.fetchedAt ?? new Date().toISOString();
          if (activeTopic !== 'ALL' && !sections.some((section) => section.topic === activeTopic)) activeTopic = 'ALL';
        } catch (error) {
          sections = [];
          gridEl.innerHTML = `<div class="rs-empty">Impossibile caricare i segnali: ${escapeHtml(
            error instanceof Error ? error.message : String(error),
          )}</div>`;
          return;
        }
        renderChips();
        render();
      };

      chipbar.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>('[data-topic]');
        if (!button) return;
        activeTopic = button.dataset.topic as string;
        renderChips();
        render();
      });
      root.querySelector<HTMLInputElement>('#rsOsintQuery')?.addEventListener('input', (event) => {
        query = (event.target as HTMLInputElement).value.trim().toLowerCase();
        render();
      });
      root.querySelector<HTMLSelectElement>('#rsOsintSeverity')?.addEventListener('change', (event) => {
        activeSeverity = (event.target as HTMLSelectElement).value.toLowerCase();
        render();
      });
      root.querySelector<HTMLButtonElement>('#rsOsintRefresh')?.addEventListener('click', () => {
        void load(true);
      });

      await load(true);
    },
  };
}
