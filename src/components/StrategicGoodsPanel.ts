import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { STRATEGIC_GOODS, type StrategicGood } from '@/config/thesis-model';
import { factItem, lt, nodeName } from './thesis-ui';

/**
 * Strategic goods of the perimeter with their EU criticality, supply
 * vulnerability evidence and modulators in force. Static, sourced data:
 * every fact is either verified (with its source) or an explicit to-do.
 */
export class StrategicGoodsPanel extends Panel {
  private open = new Set<string>(['8542']);

  constructor() {
    super({
      id: 'strategic-goods',
      title: t('panels.strategicGoods'),
      showCount: true,
      infoTooltip: t('components.thesis.goods.infoTooltip'),
      defaultRowSpan: 2,
    });
    this.setCount(STRATEGIC_GOODS.length);
    this.content.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      if (target.closest('a')) return;
      const head = target.closest<HTMLElement>('[data-hs]');
      if (!head) return;
      const hs = head.dataset.hs!;
      if (this.open.has(hs)) this.open.delete(hs);
      else this.open.add(hs);
      this.render();
    });
    this.render();
  }

  private section(title: string, facts: StrategicGood['criticality']): string {
    if (!facts.length) return '';
    return `<div class="thesis-detail-h">${escapeHtml(title)}</div><ul class="thesis-facts">${facts.map(factItem).join('')}</ul>`;
  }

  private card(g: StrategicGood): string {
    const isOpen = this.open.has(g.hs);
    const verified = [...g.criticality, ...g.supply, ...g.modulators].filter((f) => f.status === 'verified').length;
    const total = g.criticality.length + g.supply.length + g.modulators.length;
    const nodes = g.nodes.length ? g.nodes.map((id) => escapeHtml(nodeName(id))).join(', ') : escapeHtml(t('components.thesis.goods.noNodes'));
    return `<div class="thesis-goodcard${isOpen ? ' open' : ''}">
      <div class="thesis-goodcard-head" data-hs="${escapeHtml(g.hs)}">
        <span class="thesis-hs">HS ${escapeHtml(g.hs)}</span>
        <b>${escapeHtml(lt(g.label))}</b>
        ${g.pilot ? `<span class="thesis-pilot">${escapeHtml(t('components.thesis.goods.pilot'))}</span>` : ''}
        <span class="thesis-muted thesis-goodcard-meta">${verified}/${total} ✓</span>
      </div>
      ${
        isOpen
          ? `<div class="thesis-goodcard-body">
        ${g.detail ? `<p class="thesis-muted">${escapeHtml(lt(g.detail))}</p>` : ''}
        <p><span class="thesis-muted">${escapeHtml(t('components.thesis.goods.nodes'))}:</span> ${nodes}</p>
        ${this.section(t('components.thesis.goods.criticality'), g.criticality)}
        ${this.section(t('components.thesis.goods.supply'), g.supply)}
        ${this.section(t('components.thesis.goods.modulators'), g.modulators)}
      </div>`
          : ''
      }
    </div>`;
  }

  private render(): void {
    this.setContent(`<div class="thesis-panel">
      ${STRATEGIC_GOODS.map((g) => this.card(g)).join('')}
      <div class="thesis-note">${escapeHtml(t('components.thesis.goods.footer'))}</div>
    </div>`);
  }
}
