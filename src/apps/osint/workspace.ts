/**
 * OSINT — the signal layer of the thesis model.
 *
 * A standalone application (not a dashboard variant). Until 14/10/2026 it
 * listed the raw n8n digest (bare tickers, duplicate topics, "normal" climate
 * zones), which said nothing about the thesis. It now answers one question:
 * what is happening around the critical nodes and to the strategic goods?
 *
 *  - Nodes: measured triggers within the working radius (the same snapshot as
 *    the Risk Chain panel: EMSC, GDACS/EONET/NHC) and the chain state.
 *  - Goods: the measured layers S (EU27 extra-EU supply) and C (customs
 *    channels as of now, dated Policy register), each with provenance and
 *    never combined (./goods.ts); Italy's suppliers by partner country, intra-EU
 *    included (Eurostat Comext, UN Comtrade fallback); prices (Yahoo Finance)
 *    as indirect indicators.
 *  - Signals: vessel transits (IMF PortWatch) and the nearest ERA5 climate
 *    anomaly per node; EU supply indicators (HHI, node-origin share) per good.
 *  - Triggers: one row per Gardner-Knopoff sequence near the nodes.
 *
 * Triggers are measured events that may interrupt a node; signals anticipate
 * or corroborate and never measure the hazard. Every cell states its source.
 */

import { mountSourceInfo, sourceInfoSlot } from '@/components/source-info';
import { switchAppHref } from '@/config/apps';
import { COMMODITIES } from '@/config/markets';
import { STRATEGIC_GOODS, TRIGGER_WORKING_RULES, localText } from '@/config/thesis-model';
import { getThesisSnapshot } from '@/services/thesis/snapshot';
import type { CustomsRegistryEntry } from '@/services/thesis/customs-registry';
import { escapeHtml } from '@/utils/sanitize';
import type { AppWorkspace } from '../types';
import {
  customsLayer,
  customsText,
  EU_SUPPLY_LABEL,
  ITALY_SHARES_LABEL,
  LAYERS_NOTE,
  measureText,
  NO_QUOTE,
  PRICE_LABEL,
  supplyLayer,
  supplyText,
  type CustomsLayer,
  type SupplyLayer,
} from './goods';
import {
  buildGoodRows,
  buildNodeRows,
  buildSequenceRows,
  buildSignalNodeRows,
  buildSupplyRows,
  distinctTriggerCounts,
  importSentence,
  isSourceAvailable,
  provenanceStatus,
  provenanceText,
  quakeWindowLabel,
  SOURCE_UNAVAILABLE,
  type GoodRow,
  type NodeRow,
  type OsintComtradeProduct,
  type OsintSignalsPayload,
  type OsintSource,
  type PolicyEntryLike,
  type SequenceRow,
  type SignalNodeRow,
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
  const latest = t.latest
    ? `${escapeHtml(fmtDate(t.latest.time))}${t.latest.url ? ` · <a class="rs-link" href="${escapeHtml(t.latest.url)}" target="_blank" rel="noopener">${escapeHtml(t.latest.source)} ↗</a>` : ` · ${escapeHtml(t.latest.source)}`}`
    : '';
  return `
    <tr class="rs-osint-state-${escapeHtml(row.state)}">
      <th scope="row">${escapeHtml(row.node.name)}<br><span class="rs-meta">${row.node.kind === 'strait' ? 'stretto' : 'area produttiva'}</span></th>
      <td>${triggers}${latest ? `<br><span class="rs-meta">ultimo: ${latest}</span>` : ''}</td>
      <td><span class="rs-osint-state">${escapeHtml(STATE_LABELS[row.state] ?? row.state)}</span></td>
    </tr>`;
}

const unavailable = `<span class="rs-meta">${SOURCE_UNAVAILABLE}</span>`;

function signalNodeRowHtml(row: SignalNodeRow, transitOk: boolean, transitNote: string, era5: OsintSource | undefined, baseline: string | null): string {
  const transit = row.node.kind !== 'strait'
    ? '<span class="rs-meta">non applicabile (area produttiva)</span>'
    : transitOk && row.transit?.dataAvailable
      ? `${fmtSigned(row.transit.wowChangePct, '%', 0)} sulla settimana precedente<br><span class="rs-meta">${escapeHtml(transitNote)}</span>`
      : unavailable;
  const c = row.era5;
  const climate = !isSourceAvailable(era5)
    ? unavailable
    : c
      ? `ΔT ${fmtSigned(c.zone.tempDelta, ' °C')} · Δ pioggia ${fmtSigned(c.zone.precipDelta, ' mm/g')}<br><span class="rs-meta">${escapeHtml(c.zone.zone)}, ${Math.round(c.distanceKm)} km · ${escapeHtml(c.zone.period || 'periodo n.d.')} · rispetto alla normale ${escapeHtml(baseline ?? 'n.d.')} · ${escapeHtml(provenanceText(era5))}</span>`
      : `<span class="rs-meta">nessuna zona ERA5 entro ${TRIGGER_WORKING_RULES.radiusKm} km</span>`;
  return `
    <tr>
      <th scope="row">${escapeHtml(row.node.name)}<br><span class="rs-meta">${row.node.kind === 'strait' ? 'stretto' : 'area produttiva'}</span></th>
      <td>${transit}</td>
      <td>${climate}</td>
    </tr>`;
}

function supplyRowHtml(row: ReturnType<typeof buildSupplyRows>[number], src: OsintSource | undefined): string {
  const s = row.product?.supply;
  const cell = !isSourceAvailable(src)
    ? unavailable
    : s
      ? `HHI ${s.hhi !== null ? s.hhi.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : 'n.d.'} · quota dalle origini dei nodi ${s.nodeOriginShare !== null ? `${Math.round(s.nodeOriginShare * 100)}%` : 'n.d.'}${s.nodeOrigins.length ? ` (${escapeHtml(s.nodeOrigins.join(', '))})` : ''} · anno ${row.product?.year ?? 'n.d.'}<br><span class="rs-meta">${escapeHtml(provenanceText(src))}</span>`
      : '<span class="rs-meta">indicatori non calcolati per questo bene</span>';
  return `
    <tr>
      <th scope="row">HS ${escapeHtml(row.good.hs)}<br><span class="rs-meta">${escapeHtml(localText(row.good.label, 'it'))}</span></th>
      <td>${cell}</td>
    </tr>`;
}

function sequenceItemHtml(f: SequenceRow): string {
  const e = f.mainshock;
  const nodes = f.nodes.map((n) => `${escapeHtml(n.name)} (${Math.round(n.distanceKm)} km)`).join(', ');
  const source = e.url ? `<a class="rs-link" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.source)} ↗</a>` : `<span class="rs-meta">${escapeHtml(e.source)}</span>`;
  return `<li class="${f.significant ? 'rs-osint-sig' : ''}"><span class="rs-meta">${escapeHtml(fmtDate(e.time))}</span> ${escapeHtml(f.text)} ${source}<br><span class="rs-meta">nodi raggiunti: ${nodes}</span></li>`;
}

/** Status and date of every source of /api/osint/signals. */
function sourcesHtml(sources: Record<string, OsintSource> | undefined): string {
  if (!sources) return `Stato delle fonti: ${SOURCE_UNAVAILABLE}`;
  return `Stato delle fonti: ${Object.values(sources).map((src) => `${escapeHtml(src.source)}: ${isSourceAvailable(src) ? escapeHtml(provenanceStatus(src)) : `<strong>${SOURCE_UNAVAILABLE}</strong> (${escapeHtml(src.status)})`}`).join(' · ')}`;
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

interface GoodLayersInput {
  supply: SupplyLayer;
  supplySrc: OsintSource | undefined;
  customs: CustomsLayer | null;
  importsSource: string;
  ok: { quotes: boolean; imports: boolean };
}

/** One good: S and C as separate measured layers with provenance, then Italy's suppliers and the prices. */
function goodRowHtml(row: GoodRow, policyHref: string, l: GoodLayersInput): string {
  const supply = !isSourceAvailable(l.supplySrc)
    ? unavailable
    : `${escapeHtml(supplyText(l.supply))}<br><span class="rs-meta">${EU_SUPPLY_LABEL} · ${escapeHtml(provenanceText(l.supplySrc))}</span>`;
  const c = l.customs;
  const customs = !c
    ? unavailable
    : `${escapeHtml(customsText(c))}<br><span class="rs-meta">${escapeHtml(c.label)}${c.measures.length ? `: ${c.measures.map((m) => escapeHtml(measureText(m))).join('; ')}` : ''}${row.measures.length ? ` · <a class="rs-link" href="${escapeHtml(policyHref)}">${row.measures.length} voc${row.measures.length === 1 ? 'e' : 'i'} nel registro ↗</a>` : ''}</span>`;
  const imports = !l.ok.imports
    ? unavailable
    : row.imports
    ? `${escapeHtml(importSentence(row.imports, displayNames))}<br><span class="rs-meta">${ITALY_SHARES_LABEL} · ${escapeHtml(l.importsSource)}, anno ${row.imports.year ?? 'n.d.'}</span>`
    : '<span class="rs-meta">dato non disponibile</span>';
  const prices = !l.ok.quotes
    ? unavailable
    : row.prices.length
    ? `${row.prices
        .map((p) => {
          const change = p.change !== null ? `<span class="${p.change >= 0 ? 'rs-up' : 'rs-down'}">${fmtSigned(p.change, '%', 2)}</span>` : 'n.d.';
          const price = p.price !== null ? p.price.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : 'n.d.';
          const kind = p.kind === 'proxy' ? ' <span class="rs-chip rs-chip-dim" title="Titolo o ETF quotato, non il prezzo del bene">titolo o ETF</span>' : '';
          return `${escapeHtml(p.name)} (${escapeHtml(p.symbol)}): ${price} · ${change}${kind}`;
        })
        .join('<br>')}<br><span class="rs-meta">${PRICE_LABEL} · Yahoo Finance</span>`
    : `<span class="rs-meta">${NO_QUOTE}</span>`;
  return `
    <tr>
      <th scope="row">HS ${escapeHtml(row.good.hs)}<br><span class="rs-meta">${escapeHtml(localText(row.good.label, 'it'))}</span></th>
      <td>${supply}</td>
      <td>${customs}</td>
      <td>${imports}</td>
      <td>${prices}</td>
    </tr>`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

type OsintTab = 'nodes' | 'goods' | 'signals' | 'feed';
const OSINT_TABS: readonly OsintTab[] = ['nodes', 'goods', 'signals', 'feed'];
const TAB_STORAGE_KEY = 'rs-osint-tab';

function readStoredTab(): OsintTab {
  try {
    const v = localStorage.getItem(TAB_STORAGE_KEY);
    return OSINT_TABS.includes(v as OsintTab) ? (v as OsintTab) : 'nodes';
  } catch {
    return 'nodes';
  }
}

/** Tab switching; the last tab is remembered per browser (a convenience only). */
function bindTabs(root: HTMLElement): void {
  const show = (tab: OsintTab) => {
    root.querySelectorAll<HTMLElement>('.rs-tab').forEach((t) => {
      const active = t.dataset.tab === tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    root.querySelectorAll<HTMLElement>('.rs-tab-panel').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // storage unavailable: the tab is simply not remembered
    }
  };
  root.querySelectorAll<HTMLElement>('.rs-tab').forEach((t) => {
    t.addEventListener('click', () => show((t.dataset.tab as OsintTab) ?? 'nodes'));
  });
  show(readStoredTab());
}

function setCount(root: HTMLElement, selector: string, n: number): void {
  const el = root.querySelector<HTMLElement>(selector);
  if (el) el.textContent = String(n);
}

export function createOsintWorkspace(): AppWorkspace {
  return {
    async mount(root: HTMLElement): Promise<void> {
      root.innerHTML = `
        <div class="rs-ws rs-ws-osint">
          <div class="rs-ws-toolbar">
            <div class="rs-ws-heading">
              <h1>Segnali OSINT</h1>
              <p>Cosa sta succedendo intorno ai nodi critici e ai beni strategici della tesi. Gli inneschi sono eventi misurati che possono interrompere un nodo; i segnali anticipano o confermano un impatto e non misurano il pericolo.</p>
            </div>
            <div class="rs-ws-stats">
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintNodesHit">–</span><span class="rs-stat-label">nodi con inneschi</span></div>
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintEvents">–</span><span class="rs-stat-label">eventi distinti</span></div>
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintSignificant">–</span><span class="rs-stat-label">eventi significativi</span></div>
              <div class="rs-stat"><span class="rs-stat-value" id="rsOsintUpdated">–</span><span class="rs-stat-label">aggiornato</span></div>
            </div>
            <button class="rs-button" id="rsOsintRefresh">Aggiorna</button>
          </div>

          <div class="rs-tabs" role="tablist">
            <button class="rs-tab" data-tab="nodes" role="tab">Nodi critici <span class="rs-chip-count" id="rsOsintNodesCount"></span></button>
            <button class="rs-tab" data-tab="goods" role="tab">Beni strategici <span class="rs-chip-count" id="rsOsintGoodsCount"></span></button>
            <button class="rs-tab" data-tab="signals" role="tab">Segnali</button>
            <button class="rs-tab" data-tab="feed" role="tab">Inneschi <span class="rs-chip-count" id="rsOsintFeedCount"></span></button>
          </div>

          <div class="rs-tab-panel" data-panel="nodes">
            <div class="rs-tab-sources">Fonti dei dati ${sourceInfoSlot('osint.nodes')}</div>
            <p class="rs-meta rs-osint-note">Inneschi entro ${TRIGGER_WORKING_RULES.radiusKm} km: <span class="rs-osint-window">caricamento…</span>. I nodi si sovrappongono (Stretto di Taiwan, Hsinchu, Tainan): nell'intestazione un evento che ne raggiunge più di uno conta una volta.</p>
            <div class="rs-osint-table-wrap"><table class="rs-osint-table">
              <thead><tr><th>Nodo</th><th>Inneschi</th><th>Catena</th></tr></thead>
              <tbody id="rsOsintNodes"><tr><td colspan="3" class="rs-loading">Caricamento…</td></tr></tbody>
            </table></div>
          </div>

          <div class="rs-tab-panel" data-panel="goods" hidden>
            <div class="rs-tab-sources">Fonti dei dati ${sourceInfoSlot('osint.goods')}</div>
            <p class="rs-meta rs-osint-note">Strati misurati per bene, ciascuno con la sua fonte: S (approvvigionamento UE27 dalle importazioni extra-UE) e C (canali doganali con incentivo, dal registro Policy). ${LAYERS_NOTE} I fornitori dell'Italia sono a parte: paese di provenienza, scambi intra-UE inclusi. I prezzi sono indicatori indiretti nell'unità di quotazione del contratto (per esempio il grano in centesimi di dollaro per bushel): conta la variazione.</p>
            <div class="rs-osint-table-wrap"><table class="rs-osint-table">
              <thead><tr><th>Bene</th><th>S, approvvigionamento (UE27, extra-UE)</th><th>C, canali doganali (registro Policy)</th><th>Principali fornitori dell'Italia</th><th>Prezzo (variazione sulla chiusura precedente)</th></tr></thead>
              <tbody id="rsOsintGoods"><tr><td colspan="5" class="rs-loading">Caricamento…</td></tr></tbody>
            </table></div>
          </div>

          <div class="rs-tab-panel" data-panel="signals" hidden>
            <div class="rs-tab-sources">Fonti dei dati ${sourceInfoSlot('osint.signals')}</div>
            <p class="rs-meta rs-osint-note">Dati che anticipano o confermano un impatto, mostrati come valori misurati senza soglie: variazione dei transiti di navi rispetto alla settimana precedente (IMF PortWatch), anomalia climatica ERA5 della zona più vicina entro ${TRIGGER_WORKING_RULES.radiusKm} km rispetto alla normale mensile, indicatori di approvvigionamento dell'UE sulle importazioni extra-UE.</p>
            <div class="rs-osint-table-wrap"><table class="rs-osint-table">
              <thead><tr><th>Nodo</th><th>Transiti</th><th>Anomalia climatica (ERA5, ultimi 7 giorni)</th></tr></thead>
              <tbody id="rsOsintSignalNodes"><tr><td colspan="3" class="rs-loading">Caricamento…</td></tr></tbody>
            </table></div>
            <div class="rs-osint-table-wrap"><table class="rs-osint-table">
              <thead><tr><th>Bene</th><th>Approvvigionamento UE (HHI dei fornitori extra-UE, quota dalle origini dei nodi)</th></tr></thead>
              <tbody id="rsOsintSupply"><tr><td colspan="2" class="rs-loading">Caricamento…</td></tr></tbody>
            </table></div>
            <p class="rs-meta" id="rsOsintSources"></p>
          </div>

          <div class="rs-tab-panel" data-panel="feed" hidden>
            <div class="rs-tab-sources">Fonti dei dati ${sourceInfoSlot('osint.feed')}</div>
            <p class="rs-meta rs-osint-note">Una riga per sequenza di eventi (finestre di Gardner-Knopoff, raggruppamento provvisorio (#144)), con i nodi raggiunti; <span class="rs-osint-window">caricamento…</span>.</p>
            <ul class="rs-osint-feed" id="rsOsintFeed"><li class="rs-loading">Caricamento…</li></ul>
          </div>

          <p class="rs-meta" id="rsOsintErrors"></p>
        </div>
      `;
      mountSourceInfo(root);
      bindTabs(root);

      const nodesEl = root.querySelector<HTMLElement>('#rsOsintNodes');
      const goodsEl = root.querySelector<HTMLElement>('#rsOsintGoods');
      const feedEl = root.querySelector<HTMLElement>('#rsOsintFeed');
      const errorsEl = root.querySelector<HTMLElement>('#rsOsintErrors');
      const nodesHitEl = root.querySelector<HTMLElement>('#rsOsintNodesHit');
      const eventsEl = root.querySelector<HTMLElement>('#rsOsintEvents');
      const significantEl = root.querySelector<HTMLElement>('#rsOsintSignificant');
      const signalNodesEl = root.querySelector<HTMLElement>('#rsOsintSignalNodes');
      const supplyEl = root.querySelector<HTMLElement>('#rsOsintSupply');
      const sourcesEl = root.querySelector<HTMLElement>('#rsOsintSources');
      const updatedEl = root.querySelector<HTMLElement>('#rsOsintUpdated');
      if (!nodesEl || !goodsEl || !feedEl || !signalNodesEl || !supplyEl) return;
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
          fetchJson<{ entries?: Array<PolicyEntryLike & CustomsRegistryEntry> }>('/api/policy/registry').catch((e: unknown) => {
            errors.push(`registro Policy: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }),
          fetchJson<EuGoodsLike>('/api/trade/eu-goods').catch((e: unknown) => {
            errors.push(`fornitori Eurostat Comext: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }),
        ]);
        if (snapshot?.errors.length) errors.push(...snapshot.errors);
        // The snapshot swallows PortWatch failures: no strait with data means the source is down.
        const transitOk = (snapshot?.transitAvailable ?? 0) > 0;
        if (snapshot && !transitOk) errors.push(`transiti IMF PortWatch: ${SOURCE_UNAVAILABLE}`);
        if (signals?.sources) {
          for (const src of Object.values(signals.sources)) if (!isSourceAvailable(src)) errors.push(`${src.source}: ${SOURCE_UNAVAILABLE} (${src.status})`);
        }

        const chains = snapshot?.chains ?? [];
        const windowText = snapshot ? quakeWindowLabel(snapshot) : 'catalogo dei terremoti non disponibile';
        root.querySelectorAll<HTMLElement>('.rs-osint-window').forEach((el) => {
          el.textContent = windowText;
        });
        const nodeRows = buildNodeRows(chains);
        nodesEl.innerHTML = nodeRows.length
          ? nodeRows.map(nodeRowHtml).join('')
          : '<tr><td colspan="3" class="rs-empty">Inneschi non disponibili.</td></tr>';

        const era5 = signals?.sources?.climateEra5;
        const transitNote = snapshot ? `IMF PortWatch, letto alle ${new Date(snapshot.loadedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : '';
        const signalRows = buildSignalNodeRows(chains, signals?.climateEra5?.zones ?? [], TRIGGER_WORKING_RULES.radiusKm);
        signalNodesEl.innerHTML = signalRows.length
          ? signalRows.map((r) => signalNodeRowHtml(r, transitOk, transitNote, era5, signals?.climateEra5?.baseline ?? null)).join('')
          : `<tr><td colspan="3" class="rs-empty">Nodi non disponibili: ${SOURCE_UNAVAILABLE}.</td></tr>`;
        supplyEl.innerHTML = buildSupplyRows(STRATEGIC_GOODS, signals?.euSupply?.products ?? [])
          .map((r) => supplyRowHtml(r, signals?.sources?.euSupply))
          .join('');
        if (sourcesEl) sourcesEl.innerHTML = sourcesHtml(signals?.sources);

        // Eurostat Comext covers all 8 goods; UN Comtrade (4 goods) is the fallback.
        const comext = comextImportsForItaly(euGoods);
        const importsSource = comext.length ? 'Eurostat Comext' : 'UN Comtrade';
        const goodRows = buildGoodRows(STRATEGIC_GOODS, signals?.quotes ?? [], COMMODITIES, comext.length ? comext : signals?.comtradeIT.products ?? [], policy?.entries ?? []);
        const quotesOk = isSourceAvailable(signals?.sources?.quotes);
        const importsOk = comext.length > 0 || isSourceAvailable(signals?.sources?.comtradeIT);
        const euProducts = signals?.euSupply?.products ?? [];
        const registry = policy ? { entries: policy.entries ?? [] } : null;
        const now = Date.now();
        goodsEl.innerHTML = goodRows
          .map((row) =>
            goodRowHtml(row, policyHref, {
              supply: supplyLayer(euProducts.find((p) => p.hs4 === row.good.hs) ?? null),
              supplySrc: signals?.sources?.euSupply,
              customs: registry ? customsLayer(registry, row.good.hs, now) : null,
              importsSource,
              ok: { quotes: quotesOk, imports: importsOk },
            }),
          )
          .join('');

        const feed = buildSequenceRows(chains);
        feedEl.innerHTML = feed.length
          ? feed.map(sequenceItemHtml).join('')
          : `<li class="rs-empty">${snapshot ? 'Nessun innesco misurato vicino ai nodi nel periodo.' : `Inneschi: ${SOURCE_UNAVAILABLE}.`}</li>`;

        setCount(root, '#rsOsintNodesCount', nodeRows.length);
        setCount(root, '#rsOsintGoodsCount', goodRows.length);
        setCount(root, '#rsOsintFeedCount', feed.length);
        const counts = distinctTriggerCounts(chains);
        if (nodesHitEl) nodesHitEl.textContent = String(counts.nodesHit);
        if (eventsEl) eventsEl.textContent = String(counts.events);
        if (significantEl) significantEl.textContent = String(counts.significant);
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
