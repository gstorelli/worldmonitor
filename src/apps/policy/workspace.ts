/**
 * Policy — regulatory monitor and compliance analysis workspace.
 *
 * A standalone application (not a dashboard variant): curated open normative
 * registry (EUR-Lex / Gazzetta Ufficiale) plus recent EU acts.
 *
 * 14/10/2026: the "monitor" tab read the n8n workflow 06, which scraped the
 * EUR-Lex search page; EUR-Lex answers automated requests with a bot challenge
 * (HTTP 202, empty body), so it never found anything. Recent acts now come
 * from the Publications Office SPARQL endpoint (scripts/seed-policy-eu-acts.mjs),
 * tied to the strategic goods by title keywords.
 */

import { mountSourceInfo, sourceInfoSlot } from '@/components/source-info';
import { STRATEGIC_GOODS, localText } from '@/config/thesis-model';
import { escapeHtml } from '@/utils/sanitize';
import type { AppWorkspace } from '../types';
import { buildGoodsMeasures, isVerifiedStatus, shortTitle } from './model';

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
  /** 13/10/2026: how the content was checked ("verificata (T, …)", "da verificare…"). */
  status?: string;
  /** Role in the six-layer model: "modulatore", "quadro", or empty. */
  role?: string;
  /** HS codes of the strategic goods the measure applies to. */
  goods?: string[];
  /** Key in thesis/references.bib when the measure is a thesis source. */
  thesisKey?: string | null;
}

export interface EuAct {
  celex: string;
  date: string;
  title: string;
  url: string;
  goods: string[];
  measures: string[];
}

interface PolicyPayload {
  entries: PolicyEntry[];
  monitor: Record<string, unknown>[];
  acts?: { since: string | null; windowDays: number | null; scanned: number | null; items: EuAct[] } | null;
  fetchedAt: string;
}

export const MEASURE_LABELS: Record<string, string> = {
  antidumping: 'antidumping',
  compensativo: 'dazio compensativo',
  dazi: 'dazi e contingenti',
  classificazione: 'classificazione NC',
  sanzioni: 'misure restrittive',
};

const GOOD_LABELS: Record<string, string> = Object.fromEntries(STRATEGIC_GOODS.map((g) => [g.hs, localText(g.label, 'it')]));

export function goodChip(hs: string): string {
  return `HS ${hs}${GOOD_LABELS[hs] ? ` ${GOOD_LABELS[hs].toLowerCase()}` : ''}`;
}

function actRow(act: EuAct): string {
  return `<li class="rs-act">
    <span class="rs-meta">${escapeHtml(act.date)} · ${escapeHtml(act.celex)}</span>
    <a class="rs-act-title" href="${escapeHtml(act.url)}" target="_blank" rel="noopener">${escapeHtml(act.title)}</a>
    <span class="rs-list-tags">${act.goods.map((hs) => `<span class="rs-chip">${escapeHtml(goodChip(hs))}</span>`).join('')}${act.measures
      .map((m) => `<span class="rs-chip rs-chip-dim">${escapeHtml(MEASURE_LABELS[m] ?? m)}</span>`)
      .join('')}</span>
  </li>`;
}

const JURISDICTION_LABELS: Record<string, string> = { eu: 'Unione Europea', it: 'Italia', wto: 'OMC (WTO)' };

const isVerified = (entry: PolicyEntry): boolean => /^(verificata|in riesame)/i.test(entry.status ?? '');

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
      const acts = Array.isArray(payload.acts?.items) ? payload.acts.items : [];
      const jurisdictions = [...new Set(entries.map((entry) => entry.jurisdiction).filter(Boolean))];
      const categories = [...new Set(entries.flatMap((entry) => entry.riskCategories ?? []))].sort();

      type PolicyTab = 'goods' | 'registry' | 'monitor';
      let activeTab: PolicyTab = 'goods';
      const tabClass = (tab: PolicyTab): string => `rs-tab${activeTab === tab ? ' active' : ''}`;
      const goodsRows = buildGoodsMeasures(STRATEGIC_GOODS, entries, acts);
      let selectedId = entries[0]?.id ?? '';
      let jurisdiction = 'ALL';
      let category = 'ALL';
      let roleFilter = 'ALL';
      let query = '';

      root.innerHTML = `
        <div class="rs-ws rs-ws-policy">
          <div class="rs-ws-toolbar">
            <div class="rs-ws-heading">
              <h1>Policy &amp; Compliance</h1>
              <p>Registro normativo aperto: misure che la tesi usa come modulatori, quadro doganale e voci ancora da verificare</p>
            </div>
            <div class="rs-ws-stats">
              <div class="rs-stat"><span class="rs-stat-value">${entries.length}</span><span class="rs-stat-label">norme</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${entries.filter(isVerified).length}</span><span class="rs-stat-label">verificate</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${acts.length}</span><span class="rs-stat-label">atti UE recenti</span></div>
              <div class="rs-stat"><span class="rs-stat-value">${jurisdictions.length}</span><span class="rs-stat-label">giurisdizioni</span></div>
            </div>
          </div>

          <div class="rs-tabs" role="tablist">
            <button class="${tabClass('goods')}" data-tab="goods" role="tab">Beni × misure</button>
            <button class="${tabClass('registry')}" data-tab="registry" role="tab">Registro normativo</button>
            <button class="${tabClass('monitor')}" data-tab="monitor" role="tab">Atti UE recenti</button>
          </div>

          <div class="rs-tab-panel" data-panel="goods"><div class="rs-tab-sources">Fonti dei dati ${sourceInfoSlot('policy.goods')}</div>
            <p class="rs-meta">Per ogni bene strategico della tesi: le misure del registro con lo stesso codice HS (modulatori del modello) e gli atti UE degli ultimi 30 giorni che lo nominano nel titolo. Le voci "da verificare" non sono ancora controllate sul testo ufficiale.</p>
            <div class="rs-osint-table-wrap"><table class="rs-osint-table">
              <thead><tr><th>Bene</th><th>Misure nel registro</th><th>Atti UE recenti che lo nominano</th></tr></thead>
              <tbody>${goodsRows
                .map(
                  (row) => `<tr>
                <th scope="row">HS ${escapeHtml(row.good.hs)}<br><span class="rs-meta">${escapeHtml(localText(row.good.label, 'it'))}</span></th>
                <td>${
                  row.measures.length
                    ? row.measures
                        .map(
                          (m) => `<div class="rs-gm-item">${m.url ? `<a class="rs-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">${escapeHtml(shortTitle(m.title))} ↗</a>` : escapeHtml(shortTitle(m.title))}
                  <span class="rs-chip ${isVerifiedStatus(m.status) ? 'rs-chip-ok' : 'rs-chip-wip'}">${escapeHtml(isVerifiedStatus(m.status) ? 'verificata' : 'da verificare')}</span><br><span class="rs-meta">${escapeHtml(m.topic ?? '')}</span></div>`,
                        )
                        .join('')
                    : '<span class="rs-meta">nessuna misura nel registro</span>'
                }</td>
                <td>${
                  row.acts.length
                    ? row.acts
                        .map((a) => `<div class="rs-gm-item"><span class="rs-meta">${escapeHtml(a.date)}</span> <a class="rs-link" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.celex)} ↗</a><br><span class="rs-meta">${escapeHtml(a.title.slice(0, 140))}${a.title.length > 140 ? '…' : ''}</span></div>`)
                        .join('')
                    : `<span class="rs-meta">${payload.acts ? 'nessuno' : 'atti non ancora disponibili'}</span>`
                }</td>
              </tr>`,
                )
                .join('')}</tbody>
            </table></div>
          </div>

          <div class="rs-tab-panel" data-panel="registry" hidden><div class="rs-tab-sources">Fonti dei dati ${sourceInfoSlot('policy.registry')}</div>
            <div class="rs-ws-controls">
              <input id="rsPolicyQuery" class="rs-input" type="search" placeholder="Cerca per titolo, riferimento, tema…">
              <select id="rsPolicyJurisdiction" class="rs-select">
                <option value="ALL">Tutte le giurisdizioni</option>
                ${jurisdictions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(JURISDICTION_LABELS[value] ?? value)}</option>`).join('')}
              </select>
              <select id="rsPolicyRole" class="rs-select">
                <option value="ALL">Tutte le voci</option>
                <option value="modulatore">Modulatori (misure del Cap. 3)</option>
                <option value="verified">Solo verificate</option>
                <option value="unverified">Solo da verificare</option>
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

          <div class="rs-tab-panel" data-panel="monitor" hidden><div class="rs-tab-sources">Fonti dei dati ${sourceInfoSlot('policy.monitor')}</div>
            <p class="rs-meta">Regolamenti, decisioni e direttive degli ultimi ${payload.acts?.windowDays ?? 30} giorni che nominano uno degli 8 beni della tesi o una misura di difesa commerciale, tariffaria o di classificazione${
              payload.acts?.scanned ? ` (${acts.length} su ${payload.acts.scanned} atti esaminati)` : ''
            }. Il collegamento a un bene è una parola chiave nel titolo, non un'analisi del testo.</p>
            <div class="rs-ws-controls">
              <select id="rsActsGood" class="rs-select">
                <option value="ALL">Tutti i beni</option>
                <option value="ANY">Solo atti che nominano un bene della tesi</option>
                ${STRATEGIC_GOODS.map((g) => `<option value="${escapeHtml(g.hs)}">${escapeHtml(goodChip(g.hs))}</option>`).join('')}
              </select>
              <select id="rsActsMeasure" class="rs-select">
                <option value="ALL">Tutti i tipi di misura</option>
                ${Object.entries(MEASURE_LABELS).map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v)}</option>`).join('')}
              </select>
            </div>
            <ul class="rs-acts" id="rsPolicyActs"></ul>
            <div class="rs-card-grid" id="rsPolicyMonitor"></div>
          </div>
        </div>
      `;
      mountSourceInfo(root);

      const listEl = root.querySelector<HTMLElement>('#rsPolicyList');
      const detailEl = root.querySelector<HTMLElement>('#rsPolicyDetail');
      const monitorEl = root.querySelector<HTMLElement>('#rsPolicyMonitor');
      const actsEl = root.querySelector<HTMLElement>('#rsPolicyActs');
      if (!listEl || !detailEl || !monitorEl || !actsEl) return;
      let actsGood = 'ALL';
      let actsMeasure = 'ALL';
      const renderActs = () => {
        const shown = acts.filter((a) => {
          if (actsGood === 'ANY' && !a.goods.length) return false;
          if (actsGood !== 'ALL' && actsGood !== 'ANY' && !a.goods.includes(actsGood)) return false;
          if (actsMeasure !== 'ALL' && !a.measures.includes(actsMeasure)) return false;
          return true;
        });
        actsEl.innerHTML = shown.length
          ? shown.map(actRow).join('')
          : `<li class="rs-empty">${payload.acts ? 'Nessun atto con i filtri correnti.' : 'Atti UE non ancora disponibili: si aggiornano ogni 6 ore.'}</li>`;
      };
      root.querySelector<HTMLSelectElement>('#rsActsGood')?.addEventListener('change', (event) => {
        actsGood = (event.target as HTMLSelectElement).value;
        renderActs();
      });
      root.querySelector<HTMLSelectElement>('#rsActsMeasure')?.addEventListener('change', (event) => {
        actsMeasure = (event.target as HTMLSelectElement).value;
        renderActs();
      });

      const filtered = () =>
        entries.filter((entry) => {
          if (jurisdiction !== 'ALL' && entry.jurisdiction !== jurisdiction) return false;
          if (category !== 'ALL' && !(entry.riskCategories ?? []).includes(category)) return false;
          if (roleFilter === 'modulatore' && entry.role !== 'modulatore') return false;
          if (roleFilter === 'verified' && !isVerified(entry)) return false;
          if (roleFilter === 'unverified' && isVerified(entry)) return false;
          if (!query) return true;
          const haystack = `${entry.title} ${entry.reference} ${entry.topic} ${entry.summary} ${(entry.goods ?? []).join(' ')}`.toLowerCase();
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
            ${entry.role ? `<span class="rs-chip">${escapeHtml(entry.role)}</span>` : ''}
            <span class="rs-chip ${isVerified(entry) ? 'rs-chip-ok' : 'rs-chip-wip'}">${escapeHtml(entry.status || 'da verificare')}</span>
          </div>
          <h2>${escapeHtml(entry.title)}</h2>
          <p class="rs-meta">${escapeHtml(entry.reference)}</p>
          <p class="rs-meta">${escapeHtml(entry.topic)}${(entry.goods ?? []).length ? ` · HS ${escapeHtml((entry.goods ?? []).join(', '))}` : ''}</p>
          <h3>Sintesi</h3><p>${escapeHtml(entry.summary)}</p>
          ${entry.gap ? `<h3>Gap regolatorio</h3><p>${escapeHtml(entry.gap)}</p>` : ''}
          <h3>${entry.role === 'modulatore' ? 'Ruolo nel modello' : 'Implicazione doganale'}</h3><p>${escapeHtml(entry.customsImplication)}</p>
          ${entry.thesisKey ? `<p class="rs-meta">Fonte della tesi: <code>${escapeHtml(entry.thesisKey)}</code> (verificata nel registro delle fonti).</p>` : ''}
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
              <span class="rs-list-sub">${isVerified(entry) ? '✓ ' : '… '}${escapeHtml(entry.status || 'da verificare')}</span>
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
      root.querySelector<HTMLSelectElement>('#rsPolicyRole')?.addEventListener('change', (event) => {
        roleFilter = (event.target as HTMLSelectElement).value;
        renderList();
      });
      root.querySelector<HTMLSelectElement>('#rsPolicyCategory')?.addEventListener('change', (event) => {
        category = (event.target as HTMLSelectElement).value;
        renderList();
      });

      root.querySelectorAll<HTMLElement>('.rs-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          activeTab = (tab.dataset.tab as PolicyTab) ?? 'goods';
          root.querySelectorAll<HTMLElement>('.rs-tab').forEach((candidate) => candidate.classList.toggle('active', candidate === tab));
          root.querySelectorAll<HTMLElement>('.rs-tab-panel').forEach((panel) => {
            panel.hidden = panel.dataset.panel !== activeTab;
          });
        });
      });

      // Legacy n8n workflow 06 items, shown only if it ever pushes something.
      monitorEl.innerHTML = monitor.length ? `<h3>Dal workflow n8n 06</h3>${monitor.map(monitorCard).join('')}` : '';
      renderActs();

      renderList();
      renderDetail();
    },
  };
}
