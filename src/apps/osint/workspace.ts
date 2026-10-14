/**
 * OSINT — the signal layer of the thesis model.
 *
 * A standalone application (not a dashboard variant). Until 14/10/2026 it
 * listed the raw n8n digest (bare tickers, duplicate topics, "normal" climate
 * zones), which said nothing about the thesis. It now answers one question:
 * what is happening around the critical nodes and to the strategic goods?
 *
 *  - Nodes: measured triggers within the working radius (the same snapshot as
 *    the Risk Chain panel: EMSC, GDACS/EONET/NHC), vessel transits (IMF
 *    PortWatch) and the nearest monitored climate zone (Open-Meteo, n8n 03).
 *  - Goods: prices (Yahoo Finance; listed shares are flagged as indirect
 *    indicators), Italy's main suppliers (UN Comtrade) and the measures of the
 *    Policy registry for the same HS code.
 *  - Latest signals: trigger events near the nodes, newest first.
 *
 * Signals anticipate and corroborate; they never measure the hazard.
 */

import { mountSourceInfo, sourceInfoSlot } from '@/components/source-info';
import { switchAppHref } from '@/config/apps';
import { COMMODITIES } from '@/config/markets';
import { STRATEGIC_GOODS, TRIGGER_WORKING_RULES, localText } from '@/config/thesis-model';
import { getThesisSnapshot } from '@/services/thesis/snapshot';
import { escapeHtml } from '@/utils/sanitize';
import type { AppWorkspace } from '../types';
import {
  buildFeed,
  buildGoodRows,
  buildNodeRows,
  importSentence,
  isClimateAnomaly,
  type GoodRow,
  type NodeRow,
  type OsintComtradeProduct,
  type OsintSignalsPayload,
  type PolicyEntryLike,
} from './model';

const STATE_LABELS: Record<string, string> = {
  none: 'nessun innesco',
  monitor: 'da monitorare',
  assess: 'da valutare',
};

let displayNames: Intl.DisplayNames | undefined;
try {
  displayNames = new Intl.DisplayNames(['it'], { type: 'region' });
} catch {
  displayNames = undefined;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtSigned(n: number | null, unit: string, digits = 1): string {
  if (n === null) return 'n.d.';
  const abs = Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${abs}${unit}`;
}

function nodeRowHtml(row: NodeRow): string {
  const t = row.triggers;
  const triggers = t.count
    ? `${t.count} event${t.count === 1 ? 'o' : 'i'}${t.significant ? `, <strong>${t.significant} significativ${t.significant === 1 ? 'o' : 'i'}</strong>` : ''}${t.maxMagnitude !== null ? ` · M max ${t.maxMagnitude.toFixed(1)}` : ''}`
    : '<span class="rs-meta">nessuno</span>';
  const transit = row.node.kind !== 'strait'
    ? '<span class="rs-meta">non applicabile</span>'
    : row.transit?.dataAvailable
      ? `${row.transit.todayTotal} navi · ${fmtSigned(row.transit.wowChangePct, '%', 0)} sulla settimana`
      : '<span class="rs-meta">dato non disponibile</span>';
  const c = row.climate;
  const climate = c
    ? `${isClimateAnomaly(c.zone) ? '<strong>anomalia</strong>' : 'nella norma'} · ΔT ${fmtSigned(c.zone.tempDelta, ' °C')} · Δ pioggia ${fmtSigned(c.zone.precipDelta, ' mm/g')}<br><span class="rs-meta">${escapeHtml(c.zone.zone)}, ${Math.round(c.distanceKm)} km</span>`
    : '<span class="rs-meta">nessuna zona monitorata vicina</span>';
  const latest = t.latest
    ? `${escapeHtml(fmtDate(t.latest.time))}${t.latest.url ? ` · <a class="rs-link" href="${escapeHtml(t.latest.url)}" target="_blank" rel="noopener">${escapeHtml(t.latest.source)} ↗</a>` : ` · ${escapeHtml(t.latest.source)}`}`
    : '';
  return `
    <tr class="rs-osint-state-${escapeHtml(row.state)}">
      <th scope="row">${escapeHtml(row.node.name)}<br><span class="rs-meta">${row.node.kind === 'strait' ? 'stretto' : 'area produttiva'}</span></th>
      <td>${triggers}${latest ? `<br><span class="rs-meta">ultimo: ${latest}</span>` : ''}</td>
      <td>${transit}</td>
      <td>${climate}</td>
      <td><span class="rs-osint-state">${escapeHtml(STATE_LABELS[row.state] ?? row.state)}</span></td>
    </tr>`;
}

interface EuGoodsLike {
  available?: boolean;
  goods?: Record<string, { imports?: Record<string, { year: number; top: Array<{ code: string; share: number | null }> }> }>;
}

/** Italy's suppliers per good from Eurostat Comext (#91), in the Comtrade-shaped rows of the model. */
function comextImportsForItaly(eu: EuGoodsLike | null): OsintComtradeProduct[] {
  if (!eu?.available || !eu.goods) return [];
  const out: OsintComtradeProduct[] = [];
  for (const [hs4, g] of Object.entries(eu.goods)) {
    const it = g.imports?.IT;
    // Eurostat geo codes that differ from ISO 3166: Comext uses XS for Serbia.
    if (it) out.push({ hs4, year: it.year, description: '', suppliers: it.top.map((t) => ({ iso2: t.code === 'XS' ? 'RS' : t.code, code: null, share: t.share })) });
  }
  return out;
}

function goodRowHtml(row: GoodRow, policyHref: string, importsSource: string): string {
  const prices = row.prices.length
    ? row.prices
        .map((p) => {
          const change = p.change !== null ? `<span class="${p.change >= 0 ? 'rs-up' : 'rs-down'}">${fmtSigned(p.change, '%', 2)}</span>` : 'n.d.';
          const price = p.price !== null ? p.price.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : 'n.d.';
          const kind = p.kind === 'proxy' ? ' <span class="rs-chip rs-chip-dim" title="Titolo o ETF quotato, non il prezzo del bene">indiretto</span>' : '';
          return `${escapeHtml(p.name)} (${escapeHtml(p.symbol)}): ${price} · ${change}${kind}`;
        })
        .join('<br>')
    : '<span class="rs-meta">nessuna quotazione disponibile</span>';
  const imports = row.imports
    ? `${escapeHtml(importSentence(row.imports, displayNames))}<br><span class="rs-meta">${escapeHtml(importsSource)}, anno ${row.imports.year ?? 'n.d.'}</span>`
    : '<span class="rs-meta">dato non disponibile</span>';
  const measures = row.measures.length
    ? `<a class="rs-link" href="${escapeHtml(policyHref)}">${row.measures.length} misur${row.measures.length === 1 ? 'a' : 'e'} nel registro ↗</a><br><span class="rs-meta">${row.measures.map((m) => escapeHtml(m.title.split(' — ')[0] ?? m.title)).join('; ')}</span>`
    : '<span class="rs-meta">nessuna nel registro</span>';
  return `
    <tr>
      <th scope="row">HS ${escapeHtml(row.good.hs)}<br><span class="rs-meta">${escapeHtml(localText(row.good.label, 'it'))}</span></th>
      <td>${prices}</td>
      <td>${imports}</td>
      <td>${measures}</td>
    </tr>`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function createOsintWorkspace(): AppWorkspace {
  return {
    async mount(root: HTMLElement): Promise<void> {
      root.innerHTML = `
        <div class="rs-ws rs-ws-osint">
          <div class="rs-ws-toolbar">
            <div class="rs-ws-heading">
              <h1>Segnali OSINT</h1>
              <p>Cosa sta succedendo intorno ai nodi critici e ai beni strategici della tesi. I segnali anticipano o confermano un impatto; non misurano il pericolo.</p>
            </div>
            <div class="rs-ws-stats">
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintNodesHit">–</span><span class="rs-stat-label">nodi con inneschi</span></div>
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintSignificant">–</span><span class="rs-stat-label">significativi</span></div>
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintUpdated">–</span><span class="rs-stat-label">aggiornato</span></div>
            </div>
            <button class="rs-button" id="rsOsintRefresh">Aggiorna</button>
          </div>

          <section class="rs-osint-section">
            <h2>Nodi critici <span class="rs-osint-sub">inneschi entro ${TRIGGER_WORKING_RULES.radiusKm} km negli ultimi ${TRIGGER_WORKING_RULES.windowDays} giorni, transiti, clima</span> ${sourceInfoSlot('osint.nodes')}</h2>
            <div class="rs-osint-table-wrap"><table class="rs-osint-table">
              <thead><tr><th>Nodo</th><th>Inneschi</th><th>Transiti oggi</th><th>Clima (ultimi 7 giorni)</th><th>Catena</th></tr></thead>
              <tbody id="rsOsintNodes"><tr><td colspan="5" class="rs-loading">Caricamento…</td></tr></tbody>
            </table></div>
          </section>

          <section class="rs-osint-section">
            <h2>Beni strategici <span class="rs-osint-sub">prezzi, fornitori dell'Italia, misure in vigore</span> ${sourceInfoSlot('osint.goods')}</h2>
            <p class="rs-meta rs-osint-note">I prezzi sono nell'unità di quotazione del contratto (per esempio il grano in centesimi di dollaro per bushel): come segnale conta la variazione. "Indiretto" indica un titolo o un ETF quotato, non il prezzo del bene.</p>
            <div class="rs-osint-table-wrap"><table class="rs-osint-table">
              <thead><tr><th>Bene</th><th>Prezzo (variazione sulla chiusura precedente)</th><th>Principali fornitori dell'Italia</th><th>Misure (registro Policy)</th></tr></thead>
              <tbody id="rsOsintGoods"><tr><td colspan="4" class="rs-loading">Caricamento…</td></tr></tbody>
            </table></div>
          </section>

          <section class="rs-osint-section">
            <h2>Ultimi segnali sui nodi ${sourceInfoSlot('osint.feed')}</h2>
            <ul class="rs-osint-feed" id="rsOsintFeed"><li class="rs-loading">Caricamento…</li></ul>
          </section>

          <p class="rs-meta" id="rsOsintErrors"></p>
        </div>
      `;
      mountSourceInfo(root);

      const nodesEl = root.querySelector<HTMLElement>('#rsOsintNodes');
      const goodsEl = root.querySelector<HTMLElement>('#rsOsintGoods');
      const feedEl = root.querySelector<HTMLElement>('#rsOsintFeed');
      const errorsEl = root.querySelector<HTMLElement>('#rsOsintErrors');
      const nodesHitEl = root.querySelector<HTMLElement>('#rsOsintNodesHit');
      const significantEl = root.querySelector<HTMLElement>('#rsOsintSignificant');
      const updatedEl = root.querySelector<HTMLElement>('#rsOsintUpdated');
      if (!nodesEl || !goodsEl || !feedEl) return;
      const policyHref = switchAppHref('policy');

      const load = async (force: boolean) => {
        const errors: string[] = [];
        const [snapshot, signals, policy, euGoods] = await Promise.all([
          getThesisSnapshot(force).catch((e: unknown) => {
            errors.push(`inneschi: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }),
          fetchJson<OsintSignalsPayload>('/api/osint/signals').catch((e: unknown) => {
            errors.push(`segnali: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }),
          fetchJson<{ entries?: PolicyEntryLike[] }>('/api/policy/registry').catch((e: unknown) => {
            errors.push(`registro Policy: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }),
          fetchJson<EuGoodsLike>('/api/trade/eu-goods').catch(() => null),
        ]);
        if (snapshot?.errors.length) errors.push(...snapshot.errors);

        const chains = snapshot?.chains ?? [];
        const nodeRows = buildNodeRows(chains, signals?.climate ?? [], TRIGGER_WORKING_RULES.radiusKm);
        nodesEl.innerHTML = nodeRows.length
          ? nodeRows.map(nodeRowHtml).join('')
          : '<tr><td colspan="5" class="rs-empty">Inneschi non disponibili.</td></tr>';

        // Eurostat Comext covers all 8 goods; UN Comtrade (4 goods) is the fallback.
        const comext = comextImportsForItaly(euGoods);
        const importsSource = comext.length ? 'Eurostat Comext' : 'UN Comtrade';
        const goodRows = buildGoodRows(STRATEGIC_GOODS, signals?.quotes ?? [], COMMODITIES, comext.length ? comext : signals?.comtradeIT.products ?? [], policy?.entries ?? []);
        goodsEl.innerHTML = goodRows.map((row) => goodRowHtml(row, policyHref, importsSource)).join('');

        const feed = buildFeed(chains);
        feedEl.innerHTML = feed.length
          ? feed
              .map(
                (f) => `<li class="${f.significant ? 'rs-osint-sig' : ''}"><span class="rs-meta">${escapeHtml(fmtDate(f.time))}</span> <strong>${escapeHtml(f.nodeName)}</strong> — ${escapeHtml(f.text)} ${
                  f.url ? `<a class="rs-link" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">${escapeHtml(f.source)} ↗</a>` : `<span class="rs-meta">${escapeHtml(f.source)}</span>`
                }</li>`,
              )
              .join('')
          : '<li class="rs-empty">Nessun innesco misurato vicino ai nodi nel periodo.</li>';

        if (nodesHitEl) nodesHitEl.textContent = String(nodeRows.filter((r) => r.triggers.count > 0).length);
        if (significantEl) significantEl.textContent = String(nodeRows.reduce((n, r) => n + r.triggers.significant, 0));
        if (updatedEl) updatedEl.textContent = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        if (errorsEl) errorsEl.textContent = errors.length ? `Dati parziali: ${errors.join('; ')}` : '';
      };

      root.querySelector<HTMLButtonElement>('#rsOsintRefresh')?.addEventListener('click', () => {
        void load(true);
      });

      await load(false);
    },
  };
}
