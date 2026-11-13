import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { STRATEGIC_GOODS, type StrategicGood } from '@/config/thesis-model';
import { factItem, lt, nodeName, sourceLink } from './thesis-ui';
import { toApiUrl } from '@/services/runtime';
import { registryModulatorsFor, type RegistryEntryLike } from '@/services/thesis/modulators';
import policyRegistry from '../../data/policy-registry.json';

const REGISTRY_ENTRIES: readonly RegistryEntryLike[] = policyRegistry.entries;

const STATUS_KEY: Record<string, string> = { verificata: 'statusVerified', 'in-riesame': 'statusReview' };

/** Supply-vulnerability indicators written by scripts/seed-eu-trade.mjs (EU27, extra-EU imports). */
interface MeasuredSupply {
  year: number;
  extraEuEur: number | null;
  top: Array<{ code: string; share: number | null }>;
  supply?: { hhi: number; suppliers: number; nodeOrigins: string[]; nodeOriginShare: number | null } | null;
}

/**
 * Strategic goods of the perimeter with their EU criticality, supply
 * vulnerability evidence and modulators in force. Static, sourced data:
 * every fact is either verified (with its source) or an explicit to-do. The
 * modulators come first from the dated policy register (data/policy-registry.json)
 * with their verification status, then the hand-written facts of thesis-model.ts.
 */
export class StrategicGoodsPanel extends Panel {
  private open = new Set<string>(['8542']);
  private measured: Record<string, MeasuredSupply> = {};

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
    void this.loadMeasured();
  }

  /** Layer 4 measured on Comext (latest year), shared with the Trade Policy panel. */
  private async loadMeasured(): Promise<void> {
    try {
      const res = await fetch(toApiUrl('/api/trade/eu-goods'), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const body = (await res.json()) as { available?: boolean; goods?: Record<string, { imports?: Record<string, MeasuredSupply> }> };
      if (!body.available || !body.goods) return;
      for (const [hs, g] of Object.entries(body.goods)) {
        const eu = g.imports?.EU27_2020;
        if (eu) this.measured[hs] = eu;
      }
      this.render();
    } catch {
      // The static, sourced facts stay; measured indicators are an addition.
    }
  }

  private measuredBlock(hs: string): string {
    const m = this.measured[hs];
    if (!m?.supply || !m.extraEuEur) return '';
    const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`;
    const bn = (m.extraEuEur / 1e9).toFixed(2).replace('.', ',');
    const top = m.top.filter((x) => x.share !== null).map((x) => `${escapeHtml(x.code)} ${pct(x.share!)}`).join(' · ');
    const node = m.supply.nodeOriginShare === null
      ? ''
      : `<li>${escapeHtml(t('components.thesis.goods.nodeShare', { origins: m.supply.nodeOrigins.join(', ') }))}: <b>${pct(m.supply.nodeOriginShare)}</b></li>`;
    return `<div class="thesis-detail-h">${escapeHtml(t('components.thesis.goods.measured', { year: String(m.year) }))}</div>
      <ul class="thesis-facts">
        <li>${escapeHtml(t('components.thesis.goods.extraEu'))}: <b>${bn} ${escapeHtml(t('components.thesis.goods.bnEur'))}</b> · ${top}</li>
        <li>${escapeHtml(t('components.thesis.goods.hhi'))}: <b>${m.supply.hhi.toFixed(3).replace('.', ',')}</b> <span class="thesis-muted">(${escapeHtml(t('components.thesis.goods.suppliers', { n: String(m.supply.suppliers) }))})</span></li>
        ${node}
      </ul>`;
  }

  private section(title: string, facts: StrategicGood['criticality']): string {
    if (!facts.length) return '';
    return `<div class="thesis-detail-h">${escapeHtml(title)}</div><ul class="thesis-facts">${facts.map(factItem).join('')}</ul>`;
  }

  /** One register modulator: status chip, title, CELEX or reference, dates (null → "da verificare"), link. */
  private registryItem(e: RegistryEntryLike): string {
    const r = (key: string, vars?: Record<string, string>) => t(`components.thesis.goods.registry.${key}`, vars);
    const ok = e.statusCode === 'verificata';
    const chip = `<span class="thesis-reg-chip thesis-reg-${ok ? 'ok' : e.statusCode === 'in-riesame' ? 'review' : 'wip'}">${escapeHtml(r(STATUS_KEY[e.statusCode ?? ''] ?? 'statusUnverified'))}</span>`;
    const ref = e.celex ? `CELEX ${e.celex}` : (e.reference ?? r('unverified'));
    const date = (v: string | null | undefined) => v ?? r('unverified');
    const dates = `${r('inForceFrom')}: ${date(e.inForceFrom)} · ${r('expiresOn')}: ${date(e.expiresOn)}`;
    const title = e.title.split(' — ')[0] ?? e.title;
    return `<li class="thesis-fact ${ok ? 'thesis-fact-ok' : 'thesis-fact-todo'}"><span class="thesis-fact-mark">${ok ? '✓' : '◌'}</span><span>${chip} ${escapeHtml(title)} <span class="thesis-fact-src">${sourceLink(ref, e.url)} · ${escapeHtml(dates)}</span></span></li>`;
  }

  private modulatorsSection(g: StrategicGood, registry: readonly RegistryEntryLike[]): string {
    if (!registry.length && !g.modulators.length) return '';
    return `<div class="thesis-detail-h">${escapeHtml(t('components.thesis.goods.modulators'))}</div><ul class="thesis-facts">${registry.map((e) => this.registryItem(e)).join('')}${g.modulators.map(factItem).join('')}</ul>`;
  }

  private card(g: StrategicGood): string {
    const isOpen = this.open.has(g.hs);
    const registry = registryModulatorsFor(REGISTRY_ENTRIES, g.hs);
    const verified = [...g.criticality, ...g.supply, ...g.modulators].filter((f) => f.status === 'verified').length
      + registry.filter((e) => e.statusCode === 'verificata').length;
    const total = g.criticality.length + g.supply.length + g.modulators.length + registry.length;
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
        ${this.measuredBlock(g.hs)}
        ${this.modulatorsSection(g, registry)}
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
