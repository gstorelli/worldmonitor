/** Small render helpers shared by the thesis panels. */
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { formatTime } from '@/utils';
import { getCurrentLanguage, t } from '@/services/i18n';
import { localText, type LocalText, type SourcedFact, type ThesisNode } from '@/config/thesis-model';
import type { ChainState, TriggerEvent } from '@/services/thesis/risk-chain';

export function lang(): string {
  return getCurrentLanguage() || 'en';
}

export function lt(text: LocalText): string {
  return localText(text, lang());
}

export function nodeName(id: string): string {
  return t(`components.nodeHazards.nodes.${id}`);
}

export function nodeKindLabel(node: ThesisNode): string {
  if (node.kind === 'strait') return t('components.nodeHazards.kindStrait');
  return node.good ? t(`components.nodeHazards.goods.${node.good}`) : '';
}

const STATE_CLASS: Record<ChainState, string> = { none: 'thesis-state-none', monitor: 'thesis-state-monitor', assess: 'thesis-state-assess' };

export function stateBadge(state: ChainState): string {
  return `<span class="thesis-state ${STATE_CLASS[state]}">${escapeHtml(t(`components.thesis.state.${state}`))}</span>`;
}

const KIND_ICON: Record<TriggerEvent['kind'], string> = {
  earthquake: '⦿',
  volcano: '▲',
  flood: '≋',
  cyclone: '@',
  drought: '☼',
  wildfire: '✶',
  other: '•',
};

export function kindIcon(kind: TriggerEvent['kind']): string {
  return `<span class="thesis-kind thesis-kind-${kind}" aria-hidden="true">${KIND_ICON[kind]}</span>`;
}

/** "Mw 6.1" for earthquakes, alert level for GDACS events. */
export function eventIntensity(e: TriggerEvent): string {
  if (e.kind === 'earthquake' && typeof e.magnitude === 'number') {
    return `${escapeHtml(magnitudeLabel(e.magnitudeType))} ${e.magnitude.toFixed(1)}`;
  }
  if (e.alertLevel) return escapeHtml(t(`components.thesis.alert.${e.alertLevel}`));
  return escapeHtml(t(`components.thesis.kind.${e.kind}`));
}

/** Conventional spelling of the magnitude scale (Mw, mb, ML, Ms). */
export function magnitudeLabel(type?: string): string {
  const k = (type || '').toLowerCase();
  if (k.startsWith('mw')) return 'Mw';
  if (k.startsWith('mb')) return 'mb';
  if (k.startsWith('ml')) return 'ML';
  if (k.startsWith('ms')) return 'Ms';
  return 'M';
}

export function ago(time: number): string {
  return time > 0 ? escapeHtml(formatTime(new Date(time))) : '—';
}

export function sourceLink(label: string, url?: string): string {
  const safe = url ? sanitizeUrl(url) : '';
  if (!safe) return escapeHtml(label);
  return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

export function factItem(f: SourcedFact): string {
  const mark = f.status === 'verified' ? '✓' : '◌';
  const cls = f.status === 'verified' ? 'thesis-fact-ok' : 'thesis-fact-todo';
  const src = f.source ? ` <span class="thesis-fact-src">${sourceLink(f.source, f.url)}</span>` : '';
  return `<li class="thesis-fact ${cls}"><span class="thesis-fact-mark">${mark}</span><span>${escapeHtml(lt(f.text))}${src}</span></li>`;
}
