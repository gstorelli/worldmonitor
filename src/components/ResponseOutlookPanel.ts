import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { getStrategicGood, STRATEGIC_GOODS, THESIS_NODES, type SourcedFact } from '@/config/thesis-model';
import {
  GOOD_CHANNELS,
  POLICY_SCENARIOS,
  type MeasureChange,
  type MeasureKind,
  type ResponseLevel,
} from '@/config/thesis-response';
import { getThesisSnapshot, onThesisSnapshot, type ThesisSnapshot } from '@/services/thesis/snapshot';
import {
  CHANNELS,
  hypotheticalChain,
  responsesForChain,
  scenarioOutcome,
  type ChainResponse,
  type Direction,
  type ScenarioOutcome,
} from '@/services/thesis/response';
import { factItem, lt, nodeName, sourceLink } from './thesis-ui';

type Tab = 'responses' | 'scenarios';

const LEVELS: readonly ResponseLevel[] = ['office', 'national', 'eu'];
const KINDS: readonly MeasureKind[] = ['origin-specific', 'erga-omnes-duty', 'export-restriction'];
const CHANGES: Record<MeasureKind, readonly MeasureChange[]> = {
  'origin-specific': ['introduce', 'remove'],
  'erga-omnes-duty': ['raise', 'lower'],
  'export-restriction': ['introduce', 'remove'],
};
const ARROW: Record<Direction, string> = { up: '↑', down: '↓', same: '=' };

/**
 * Response outlook — future outlook and proof of concept of the response layer:
 * administrative responses suggested when a significant trigger hits a node
 * with exposed goods, and "what if" scenarios on modulators (direction of the
 * incentive to misdeclare only). Never applied to controls; not validated.
 */
export class ResponseOutlookPanel extends Panel {
  private snapshot: ThesisSnapshot | null = null;
  private unsubscribe: (() => void) | null = null;
  private tab: Tab = 'responses';
  private simNode = '';
  private custom: { hs: string; kind: MeasureKind; change: MeasureChange } = {
    hs: '7502',
    kind: 'origin-specific',
    change: 'introduce',
  };

  constructor() {
    super({
      id: 'response-outlook',
      title: t('panels.responseOutlook'),
      className: 'panel-wide',
      infoTooltip: t('components.thesis.response.infoTooltip'),
      defaultRowSpan: 3,
    });
    this.unsubscribe = onThesisSnapshot((s) => {
      this.snapshot = s;
      this.render();
    });
    void getThesisSnapshot().catch(() => this.render());
    this.content.addEventListener('click', (ev) => {
      const tab = (ev.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!tab) return;
      this.tab = tab.dataset.tab as Tab;
      this.render();
    });
    this.content.addEventListener('change', (ev) => {
      const el = ev.target as HTMLSelectElement;
      const field = el.dataset.field;
      if (field === 'sim') this.simNode = el.value;
      else if (field === 'hs') this.custom.hs = el.value;
      else if (field === 'kind') {
        this.custom.kind = el.value as MeasureKind;
        this.custom.change = CHANGES[this.custom.kind][0]!;
      } else if (field === 'change') this.custom.change = el.value as MeasureChange;
      else return;
      this.render();
    });
    this.render();
  }

  public override destroy(): void {
    this.unsubscribe?.();
    super.destroy();
  }

  private r(key: string, params?: Record<string, string | number>): string {
    return escapeHtml(t(`components.thesis.response.${key}`, params));
  }

  private goodLabel(hs: string): string {
    if (hs === '*') return this.r('anyGood');
    const g = getStrategicGood(hs);
    return `HS ${escapeHtml(hs)}${g ? ` · ${escapeHtml(lt(g.label))}` : ''}`;
  }

  /** Legal or factual basis of an action, shown under it (✓ verified, ◌ to do). */
  private basisInline(f: SourcedFact): string {
    const mark = f.status === 'verified' ? '✓' : '◌';
    const cls = f.status === 'verified' ? 'thesis-fact-ok' : 'thesis-fact-todo';
    const src = f.source ? ` · ${sourceLink(f.source, f.url)}` : '';
    return `<span class="thesis-response-basis ${cls}">${mark} ${escapeHtml(lt(f.text))}${src}</span>`;
  }

  private renderChainResponse(cr: ChainResponse, hypothetical: boolean): string {
    const head = `<div class="thesis-detail-h">${escapeHtml(nodeName(cr.chain.node.id))}
      <span class="thesis-state ${hypothetical ? 'thesis-state-monitor' : 'thesis-state-assess'}">${this.r(hypothetical ? 'hypothetical' : 'live')}</span></div>`;
    if (cr.blockedBy) return `${head}<p class="thesis-muted">${this.r(`blocked.${cr.blockedBy}`)}</p>`;
    const goods = cr.goods
      .map((g) => {
        const why = GOOD_CHANNELS.find((c) => c.hs === g.hs)?.why;
        const channels = g.channels.length
          ? `<p><span class="thesis-muted">${this.r('channels')}:</span> ${g.channels.map((c) => this.r(`channel.${c}`)).join(', ')}${why ? ` — <span class="thesis-muted">${escapeHtml(lt(why))}</span>` : ''}</p>`
          : `<p class="thesis-muted">${this.r('channelsTbd')}</p>`;
        const byLevel = LEVELS.map((level) => {
          const acts = g.actions.filter((a) => a.level === level);
          if (!acts.length) return '';
          return `<div class="thesis-response-level"><b>${this.r(`level.${level}`)}</b><ul class="thesis-facts">${acts
            .map(
              (a) => `<li class="thesis-fact"><span class="thesis-fact-mark">›</span><span>${escapeHtml(lt(a.text).replace('{hs}', g.hs))}
                <span class="thesis-muted">(${this.r(`channel.${a.channel}`)})</span>${this.basisInline(a.basis)}</span></li>`,
            )
            .join('')}</ul></div>`;
        }).join('');
        return `<div class="thesis-goodcard open"><div class="thesis-goodcard-head"><b>${this.goodLabel(g.hs)}</b></div>
          <div class="thesis-goodcard-body">${channels}${byLevel}<p class="thesis-muted">${this.r('window')}</p></div></div>`;
      })
      .join('');
    return head + goods;
  }

  private renderResponses(): string {
    const chains = this.snapshot?.chains ?? [];
    const live = chains.filter((c) => c.state === 'assess').map((c) => responsesForChain(c));
    const liveHtml = live.length
      ? live.map((cr) => this.renderChainResponse(cr, false)).join('')
      : `<p class="thesis-muted">${this.r(this.snapshot ? 'noActive' : 'loading')}</p>`;
    const options = [
      `<option value="">${this.r('simulateNone')}</option>`,
      ...THESIS_NODES.map(
        (n) =>
          `<option value="${escapeHtml(n.id)}"${n.id === this.simNode ? ' selected' : ''}>${escapeHtml(nodeName(n.id))}${n.goods.length ? ` (HS ${escapeHtml(n.goods.join(', '))})` : ''}</option>`,
      ),
    ].join('');
    const simNode = THESIS_NODES.find((n) => n.id === this.simNode);
    const simHtml = simNode ? this.renderChainResponse(responsesForChain(hypotheticalChain(simNode, Date.now())), true) : '';
    return `${liveHtml}
      <label class="thesis-response-form">${this.r('simulate')}
        <select data-field="sim">${options}</select></label>
      ${simHtml}`;
  }

  private effectCells(o: ScenarioOutcome): string {
    return CHANNELS.map(
      (c) => `<span class="thesis-dir thesis-dir-${o.effect[c]}" title="${this.r(`dir.${o.effect[c]}`)}">${this.r(`channel.${c}`)} ${ARROW[o.effect[c]]}</span>`,
    ).join(' ');
  }

  private outcomeNote(o: ScenarioOutcome): string {
    return `<p class="thesis-muted">${this.r(o.amplifiedByTrigger ? 'amplified' : 'structural')}</p>`;
  }

  private renderScenarios(): string {
    const chains = this.snapshot?.chains ?? [];
    const predefined = POLICY_SCENARIOS.map((s) => {
      const o = scenarioOutcome(s.kind, s.change, s.hs, chains);
      return `<div class="thesis-goodcard open"><div class="thesis-goodcard-head"><span class="thesis-hs">${s.hs === '*' ? '*' : `HS ${escapeHtml(s.hs)}`}</span><b>${escapeHtml(lt(s.label))}</b></div>
        <div class="thesis-goodcard-body"><p>${this.effectCells(o)}</p>${this.outcomeNote(o)}<ul class="thesis-facts">${factItem(s.basis)}</ul></div></div>`;
    }).join('');
    const c = this.custom;
    const goodOpts = [...STRATEGIC_GOODS.map((g) => g.hs), '*']
      .map((hs) => `<option value="${escapeHtml(hs)}"${hs === c.hs ? ' selected' : ''}>${this.goodLabel(hs)}</option>`)
      .join('');
    const kindOpts = KINDS.map((k) => `<option value="${k}"${k === c.kind ? ' selected' : ''}>${this.r(`kind.${k}`)}</option>`).join('');
    const changeOpts = CHANGES[c.kind].map((ch) => `<option value="${ch}"${ch === c.change ? ' selected' : ''}>${this.r(`change.${ch}`)}</option>`).join('');
    const o = scenarioOutcome(c.kind, c.change, c.hs, chains);
    return `<p class="thesis-muted">${this.r('scenarioIntro')}</p>
      ${predefined}
      <div class="thesis-detail-h">${this.r('custom')}</div>
      <div class="thesis-response-form">
        <select data-field="hs">${goodOpts}</select>
        <select data-field="kind">${kindOpts}</select>
        <select data-field="change">${changeOpts}</select>
      </div>
      <p>${this.effectCells(o)}</p>${this.outcomeNote(o)}`;
  }

  private render(): void {
    const tabs = (['responses', 'scenarios'] as const)
      .map((tb) => `<button type="button" class="thesis-tab${tb === this.tab ? ' active' : ''}" data-tab="${tb}">${this.r(`tab.${tb}`)}</button>`)
      .join('');
    this.setContent(`<div class="thesis-panel">
      <div class="thesis-poc">${this.r('banner')}</div>
      <div class="thesis-tabs">${tabs}</div>
      ${this.tab === 'responses' ? this.renderResponses() : this.renderScenarios()}
      <div class="thesis-note">${this.r(this.tab === 'responses' ? 'footerResponses' : 'footerScenarios')}</div>
    </div>`);
  }
}
