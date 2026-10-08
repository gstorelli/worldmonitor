import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { getStrategicGood, STRATEGIC_GOODS, TRIGGER_WORKING_RULES } from '@/config/thesis-model';
import { getThesisSnapshot, onThesisSnapshot, type ThesisSnapshot } from '@/services/thesis/snapshot';
import type { NodeChain } from '@/services/thesis/risk-chain';
import { ago, eventIntensity, factItem, kindIcon, lt, nodeKindLabel, nodeName, sourceLink, stateBadge } from './thesis-ui';

const REFRESH_MS = 10 * 60_000;
const STATE_ORDER = { assess: 0, monitor: 1, none: 2 } as const;

/**
 * The six-layer chain of the thesis, one row per critical node: measured
 * trigger → node status → strategic goods → supply vulnerability → customs
 * vulnerability → customs risk (gate rule, no weights).
 */
export class RiskChainPanel extends Panel {
  private snapshot: ThesisSnapshot | null = null;
  private selected: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private onNodeClick?: (lat: number, lon: number) => void;

  constructor() {
    super({
      id: 'risk-chain',
      title: t('panels.riskChain'),
      showCount: true,
      className: 'panel-wide',
      infoTooltip: t('components.thesis.chain.infoTooltip'),
      defaultRowSpan: 3,
    });
    this.showLoading(t('components.thesis.loading'));
    this.unsubscribe = onThesisSnapshot((s) => {
      this.snapshot = s;
      this.render();
    });
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(true), REFRESH_MS);
    this.content.addEventListener('click', (ev) => this.handleClick(ev));
  }

  public setNodeClickHandler(handler: (lat: number, lon: number) => void): void {
    this.onNodeClick = handler;
  }

  public async refresh(force = false): Promise<void> {
    try {
      await getThesisSnapshot(force);
    } catch (err) {
      if (!this.snapshot) this.showError(t('components.thesis.error'), () => void this.refresh(true));
      console.warn('[RiskChain] snapshot failed', err);
    }
  }

  public override destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe?.();
    super.destroy();
  }

  private handleClick(ev: Event): void {
    const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-node]');
    if (!row || (ev.target as HTMLElement).closest('a')) return;
    const id = row.dataset.node!;
    this.selected = this.selected === id ? null : id;
    const chain = this.snapshot?.chains.find((c) => c.node.id === id);
    if (chain && this.selected) this.onNodeClick?.(chain.node.lat, chain.node.lon);
    this.render();
  }

  private renderStrip(s: ThesisSnapshot): string {
    const withTrigger = s.chains.filter((c) => c.matches.length).length;
    const assess = s.chains.filter((c) => c.state === 'assess').length;
    const verifiedSupply = STRATEGIC_GOODS.reduce((n, g) => n + g.supply.filter((f) => f.status === 'verified').length, 0);
    const layers: Array<[string, string, string]> = [
      ['trigger', String(s.events.filter((e) => s.chains.some((c) => c.matches.some((m) => m.event.id === e.id))).length), t('components.thesis.strip.trigger')],
      ['node', `${withTrigger}/${s.chains.length}`, t('components.thesis.strip.node')],
      ['good', String(STRATEGIC_GOODS.length), t('components.thesis.strip.good')],
      ['supply', String(verifiedSupply), t('components.thesis.strip.supply')],
      ['customs', '—', t('components.thesis.strip.customs')],
      ['risk', String(assess), t('components.thesis.strip.risk')],
    ];
    return `<div class="thesis-strip">${layers
      .map(
        ([key, value, label], i) =>
          `<div class="thesis-strip-cell thesis-strip-${key}"><span class="thesis-strip-n">${i + 1}</span><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`,
      )
      .join('<span class="thesis-strip-arrow">›</span>')}</div>`;
  }

  private triggerCell(c: NodeChain): string {
    const top = c.matches[0];
    if (!top) return `<span class="thesis-muted">${escapeHtml(t('components.thesis.chain.noTrigger'))}</span>`;
    const more = c.matches.length > 1 ? ` <span class="thesis-muted">+${c.matches.length - 1}</span>` : '';
    return `${kindIcon(top.event.kind)} <b>${eventIntensity(top.event)}</b> · ${Math.round(top.distanceKm)} km · ${ago(top.event.time)}${more}`;
  }

  private nodeCell(c: NodeChain): string {
    if (c.node.kind === 'production') return `<span class="thesis-muted">${escapeHtml(t('components.thesis.chain.productionStatus'))}</span>`;
    if (!c.transit?.dataAvailable) return `<span class="thesis-muted">${escapeHtml(t('components.thesis.chain.noTransit'))}</span>`;
    const wow = c.transit.wowChangePct;
    const cls = wow < 0 ? 'thesis-down' : 'thesis-up';
    return `${c.transit.todayTotal} ${escapeHtml(t('components.thesis.chain.transits'))} <span class="${cls}">${wow > 0 ? '+' : ''}${wow.toFixed(0)}%</span>`;
  }

  private goodsCell(c: NodeChain): string {
    if (!c.node.goods.length) return `<span class="thesis-muted">${escapeHtml(t('components.thesis.chain.goodsTbd'))}</span>`;
    return c.node.goods.map((hs) => `<span class="thesis-hs">HS ${escapeHtml(hs)}</span>`).join(' ');
  }

  private detail(c: NodeChain): string {
    const events = c.matches.length
      ? `<ul class="thesis-events">${c.matches
          .slice(0, 8)
          .map(
            (m) =>
              `<li>${kindIcon(m.event.kind)} <b>${eventIntensity(m.event)}</b>${m.significant ? ` <span class="thesis-sig">${escapeHtml(t('components.thesis.significant'))}</span>` : ''} — ${escapeHtml(m.event.title)} · ${Math.round(m.distanceKm)} km${typeof m.event.depthKm === 'number' ? ` · ${Math.round(m.event.depthKm)} km ${escapeHtml(t('components.thesis.depth'))}` : ''} · ${ago(m.event.time)} · ${sourceLink(m.event.source, m.event.url)}</li>`,
          )
          .join('')}</ul>`
      : `<p class="thesis-muted">${escapeHtml(t('components.thesis.chain.noTriggerDetail', { radius: String(TRIGGER_WORKING_RULES.radiusKm) }))}</p>`;
    const goods = c.node.goods
      .map((hs) => getStrategicGood(hs))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map(
        (g) => `<div class="thesis-good"><div class="thesis-good-title"><span class="thesis-hs">HS ${escapeHtml(g.hs)}</span> ${escapeHtml(lt(g.label))}</div>
          <ul class="thesis-facts">${[...g.criticality, ...g.supply, ...g.modulators].map(factItem).join('')}</ul></div>`,
      )
      .join('');
    const hazard = `${escapeHtml(t('components.thesis.chain.history', { m6: String(c.node.m6), m7: String(c.node.m7), erupt: String(c.node.eruptions), km: String(c.node.plateBoundaryKm) }))}`;
    return `<tr class="thesis-detail-row"><td colspan="5">
      <div class="thesis-detail">
        <div class="thesis-detail-h">${escapeHtml(t('components.thesis.layer.trigger'))}</div>${events}
        <div class="thesis-detail-h">${escapeHtml(t('components.thesis.layer.hazard'))}</div><p>${hazard}</p>
        ${goods ? `<div class="thesis-detail-h">${escapeHtml(t('components.thesis.layer.goods'))}</div>${goods}` : `<p class="thesis-muted">${escapeHtml(t('components.thesis.chain.goodsTbdDetail'))}</p>`}
        <div class="thesis-detail-h">${escapeHtml(t('components.thesis.layer.customs'))}</div>
        <p class="thesis-muted">${escapeHtml(t('components.thesis.chain.customsTbd'))}</p>
      </div></td></tr>`;
  }

  private render(): void {
    const s = this.snapshot;
    if (!s) return;
    const chains = [...s.chains].sort(
      (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.matches.length - a.matches.length || b.node.m6 - a.node.m6,
    );
    this.setCount(chains.filter((c) => c.state !== 'none').length);
    const rows = chains
      .map((c) => {
        const open = this.selected === c.node.id;
        return `<tr class="thesis-row thesis-row-${c.state}${open ? ' thesis-row-open' : ''}" data-node="${escapeHtml(c.node.id)}">
          <td><b>${escapeHtml(nodeName(c.node.id))}</b><br><span class="thesis-muted">${escapeHtml(nodeKindLabel(c.node))}</span></td>
          <td>${this.triggerCell(c)}</td>
          <td>${this.nodeCell(c)}</td>
          <td>${this.goodsCell(c)}</td>
          <td class="thesis-nowrap">${stateBadge(c.state)}</td>
        </tr>${open ? this.detail(c) : ''}`;
      })
      .join('');
    const source = s.quakeSource
      ? t('components.thesis.chain.sources', { quake: s.quakeSource, days: String(s.quakeWindowDays), natural: String(s.naturalCount), transit: String(s.transitAvailable) })
      : t('components.thesis.chain.noQuakeSource');
    this.setContent(`
      <div class="thesis-panel">
        ${this.renderStrip(s)}
        <table class="thesis-table">
          <thead><tr>
            <th>${escapeHtml(t('components.thesis.col.node'))}</th>
            <th>${escapeHtml(t('components.thesis.col.trigger'))}</th>
            <th>${escapeHtml(t('components.thesis.col.status'))}</th>
            <th>${escapeHtml(t('components.thesis.col.goods'))}</th>
            <th>${escapeHtml(t('components.thesis.col.risk'))}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="thesis-note">${escapeHtml(t('components.thesis.chain.rule', { radius: String(TRIGGER_WORKING_RULES.radiusKm), mw: String(TRIGGER_WORKING_RULES.significantMw) }))}<br>${escapeHtml(source)} · ${escapeHtml(t('components.thesis.updated'))} ${ago(s.loadedAt)}</div>
      </div>`);
  }
}
