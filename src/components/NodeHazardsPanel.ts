import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import {
  NODE_HAZARDS,
  NODE_HAZARD_PERIOD,
  NODE_HAZARD_RADIUS_KM,
  type NodeHazard,
} from '@/config/node-hazards';

/**
 * Seismic and volcanic hazard at the critical nodes of the thesis model
 * (chokepoints and production areas). Static research data: see
 * `src/config/node-hazards.ts` for sources and caveats.
 */
export class NodeHazardsPanel extends Panel {
  private onNodeClick?: (lat: number, lon: number) => void;

  constructor() {
    super({
      id: 'node-hazards',
      title: t('panels.nodeHazards'),
      showCount: true,
      infoTooltip: t('components.nodeHazards.infoTooltip'),
      defaultRowSpan: 2,
    });
    this.setCount(NODE_HAZARDS.length);
    this.renderContent();
  }

  public setNodeClickHandler(handler: (lat: number, lon: number) => void): void {
    this.onNodeClick = handler;
  }

  private kindLabel(node: NodeHazard): string {
    const kind =
      node.kind === 'strait'
        ? t('components.nodeHazards.kindStrait')
        : t(`components.nodeHazards.goods.${node.good}`);
    return `${kind} · ${t('components.nodeHazards.plateShort', { km: String(node.plateBoundaryKm) })}`;
  }

  private renderContent(): void {
    const sorted = [...NODE_HAZARDS].sort((a, b) => b.m6 - a.m6 || b.eruptions - a.eruptions);

    const rows = sorted
      .map((n) => {
        const name = t(`components.nodeHazards.nodes.${n.id}`);
        const badgeClass = n.kind === 'strait' ? 'severity-normal' : 'severity-moderate';
        const strongRow = n.m7 > 0 || n.eruptions > 0 ? ' climate-extreme-row' : '';
        return `<tr class="climate-row${strongRow}" data-lat="${n.lat}" data-lon="${n.lon}" title="${escapeHtml(
          t('components.nodeHazards.rowTooltip', { mw: n.mwMax.toFixed(1), date: n.mwMaxDate }),
        )}">
        <td class="climate-zone">${escapeHtml(name)}<br><span class="climate-badge ${badgeClass}">${escapeHtml(this.kindLabel(n))}</span></td>
        <td class="climate-num">${n.m6}</td>
        <td class="climate-num">${n.m7}</td>
        <td class="climate-num">${n.eruptions}</td>
      </tr>`;
      })
      .join('');

    this.setContent(`
      <div class="climate-panel-content">
        <table class="climate-table node-hazards-table">
          <thead>
            <tr>
              <th>${t('components.nodeHazards.node')}</th>
              <th>${t('components.nodeHazards.m6')}</th>
              <th>${t('components.nodeHazards.m7')}</th>
              <th>${t('components.nodeHazards.eruptions')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="node-hazards-note">
          ${escapeHtml(t('components.nodeHazards.footnote', { radius: String(NODE_HAZARD_RADIUS_KM), period: NODE_HAZARD_PERIOD }))}
        </div>
      </div>
    `);

    this.content.querySelectorAll('.climate-row').forEach((el) => {
      el.addEventListener('click', () => {
        const lat = Number((el as HTMLElement).dataset.lat);
        const lon = Number((el as HTMLElement).dataset.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) this.onNodeClick?.(lat, lon);
      });
    });
  }
}
