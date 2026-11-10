import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { TRIGGER_WORKING_RULES } from '@/config/thesis-model';
import { getThesisSnapshot, onThesisSnapshot, type ThesisSnapshot } from '@/services/thesis/snapshot';
import type { NodeTriggerMatch } from '@/services/thesis/risk-chain';
import { sequencesGardnerKnopoff } from '@/services/thesis/engine';
import { ago, eventIntensity, kindIcon, nodeName, sourceLink } from './thesis-ui';

const REFRESH_MS = 10 * 60_000;

interface Row {
  match: NodeTriggerMatch;
  nodes: Array<{ id: string; km: number }>;
  /** Events in the sequence (sequence view only). */
  sequenceSize?: number;
  anySignificant?: boolean;
}

type Filter = 'all' | 'sig' | 'seq';

/**
 * Trigger layer: measured events (EMSC/USGS earthquakes, GDACS volcanoes,
 * floods, cyclones, droughts) inside the working radius of a critical node.
 */
export class TriggerMonitorPanel extends Panel {
  private snapshot: ThesisSnapshot | null = null;
  private filter: Filter = 'all';
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private onEventClick?: (lat: number, lon: number) => void;

  constructor() {
    super({
      id: 'trigger-monitor',
      title: t('panels.triggerMonitor'),
      showCount: true,
      infoTooltip: t('components.thesis.triggers.infoTooltip'),
      defaultRowSpan: 2,
    });
    this.showLoading(t('components.thesis.loading'));
    this.unsubscribe = onThesisSnapshot((s) => {
      this.snapshot = s;
      this.render();
    });
    void getThesisSnapshot().catch(() => this.showError(t('components.thesis.error')));
    this.timer = setInterval(() => void getThesisSnapshot(true).catch(() => undefined), REFRESH_MS);
    this.content.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      if (target.closest('a')) return;
      const filter = target.closest<HTMLElement>('[data-filter]');
      if (filter) {
        this.filter = (filter.dataset.filter as Filter) ?? 'all';
        this.render();
        return;
      }
      const row = target.closest<HTMLElement>('[data-lat]');
      if (row) this.onEventClick?.(Number(row.dataset.lat), Number(row.dataset.lon));
    });
  }

  public setEventClickHandler(handler: (lat: number, lon: number) => void): void {
    this.onEventClick = handler;
  }

  public override destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe?.();
    super.destroy();
  }

  private rows(s: ThesisSnapshot): Row[] {
    const byEvent = new Map<string, Row>();
    for (const c of s.chains) {
      for (const m of c.matches) {
        const row = byEvent.get(m.event.id) ?? { match: m, nodes: [] };
        row.nodes.push({ id: c.node.id, km: m.distanceKm });
        if (m.distanceKm < row.match.distanceKm) row.match = m;
        byEvent.set(m.event.id, row);
      }
    }
    const all = [...byEvent.values()];
    if (this.filter === 'seq') return this.sequenceRows(all);
    return all
      .filter((r) => this.filter !== 'sig' || r.match.significant)
      .sort((a, b) => b.match.event.time - a.match.event.time);
  }

  /**
   * One row per sequence (Gardner-Knopoff windows, as in Chapter 3; provisional
   * for the live monitor, #144): the mainshock, the nodes reached by any member
   * and whether any member is significant for a node.
   */
  private sequenceRows(rows: Row[]): Row[] {
    const byId = new Map(rows.map((r) => [r.match.event.id, r]));
    const out: Row[] = [];
    for (const seq of sequencesGardnerKnopoff(rows.map((r) => r.match.event))) {
      const members = seq.members.map((e) => byId.get(e.id)).filter((r): r is Row => !!r);
      const main = byId.get(seq.mainshock.id) ?? members[0];
      if (!main) continue;
      const nodes = new Map<string, number>();
      for (const m of members) for (const n of m.nodes) nodes.set(n.id, Math.min(n.km, nodes.get(n.id) ?? Infinity));
      out.push({
        match: main.match,
        nodes: [...nodes].map(([id, km]) => ({ id, km })),
        sequenceSize: members.length,
        anySignificant: members.some((m) => m.match.significant),
      });
    }
    return out.sort((a, b) => b.match.event.time - a.match.event.time);
  }

  private render(): void {
    const s = this.snapshot;
    if (!s) return;
    const rows = this.rows(s);
    this.setCount(rows.length);
    const body = rows.length
      ? rows
          .map(({ match, nodes, sequenceSize, anySignificant }) => {
            const e = match.event;
            const significant = anySignificant ?? match.significant;
            const seqNote = sequenceSize
              ? `<br><span class="thesis-muted">${escapeHtml(t('components.thesis.triggers.sequenceOf', { count: String(sequenceSize) }))}</span>`
              : '';
            const where = nodes
              .sort((a, b) => a.km - b.km)
              .map((n) => `${escapeHtml(nodeName(n.id))} <span class="thesis-muted">${Math.round(n.km)} km</span>`)
              .join(', ');
            return `<tr class="thesis-row${significant ? ' thesis-row-assess' : ''}" data-lat="${e.lat}" data-lon="${e.lon}">
              <td>${kindIcon(e.kind)} <b>${eventIntensity(e)}</b>${typeof e.depthKm === 'number' ? `<br><span class="thesis-muted">${Math.round(e.depthKm)} km ${escapeHtml(t('components.thesis.depth'))}</span>` : ''}</td>
              <td>${where}<br><span class="thesis-muted">${escapeHtml(e.title)}</span>${seqNote}</td>
              <td class="thesis-nowrap">${ago(e.time)}<br><span class="thesis-muted">${sourceLink(e.source, e.url)}</span></td>
            </tr>`;
          })
          .join('')
      : `<tr><td colspan="3" class="thesis-muted thesis-empty">${escapeHtml(t('components.thesis.triggers.none', { radius: String(TRIGGER_WORKING_RULES.radiusKm) }))}</td></tr>`;
    this.setContent(`
      <div class="thesis-panel">
        <div class="thesis-filters">
          <button type="button" class="thesis-filter${this.filter === 'all' ? ' active' : ''}" data-filter="all">${escapeHtml(t('components.thesis.triggers.all'))}</button>
          <button type="button" class="thesis-filter${this.filter === 'sig' ? ' active' : ''}" data-filter="sig">${escapeHtml(t('components.thesis.triggers.significant'))}</button>
          <button type="button" class="thesis-filter${this.filter === 'seq' ? ' active' : ''}" data-filter="seq" title="${escapeHtml(t('components.thesis.triggers.sequencesTooltip'))}">${escapeHtml(t('components.thesis.triggers.sequences'))}</button>
        </div>
        <table class="thesis-table">
          <thead><tr>
            <th>${escapeHtml(t('components.thesis.col.event'))}</th>
            <th>${escapeHtml(t('components.thesis.col.node'))}</th>
            <th>${escapeHtml(t('components.thesis.col.when'))}</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
        <div class="thesis-note">${escapeHtml(
          t('components.thesis.triggers.footer', {
            quake: s.quakeSource ?? '—',
            days: String(s.quakeWindowDays),
            count: String(s.quakeCount),
            natural: String(s.naturalCount),
            radius: String(TRIGGER_WORKING_RULES.radiusKm),
          }),
        )}</div>
      </div>`);
  }
}
