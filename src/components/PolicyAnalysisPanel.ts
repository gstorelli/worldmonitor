import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

interface PolicyEntry {
  id: string;
  title: string;
  jurisdiction: 'eu' | 'it';
  topic: string;
  reference: string;
  url?: string;
  riskCategories: string[];
  chokepoints: string[];
  summary: string;
  gap: string;
  customsImplication?: string;
}

interface PolicyMonitorItem {
  id: string;
  title: string;
  reference?: string;
  url?: string;
  jurisdiction?: string;
  topic?: string;
  riskCategories?: string[];
  chokepoints?: string[];
  summary?: string;
  gap?: string;
  publishedAt?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  rareEarths: 'Terre rare',
  geopolitical: 'Geopolitica',
  commodityPrices: 'Prezzi commodity',
  energyPrices: 'Prezzi energia',
  logistic: 'Logistica',
  climate: 'Clima',
  customsEnforcement: 'Enforcement doganale',
};

export class PolicyAnalysisPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'policy-analysis',
      title: 'Policy & Normativa',
      className: 'panel-wide',
      closable: true,
      infoTooltip: 'Analisi di policy su fonti normative aperte (EUR-Lex, Gazzetta Ufficiale): problemi attuali della normativa UE e italiana rispetto a chokepoint e rischi generali.',
    });
    this.renderLoading();
    void this.load();
    this.refreshTimer = setInterval(() => void this.load(true), 15 * 60 * 1000);
  }

  private renderLoading() {
    this.content.innerHTML = '<div style="padding: 12px; color: var(--text-secondary);">Caricamento registro normativo…</div>';
  }

  private renderError(message: string) {
    this.content.innerHTML = `<div style="padding: 12px; color: var(--color-warning);">${escapeHtml(message)}</div>`;
  }

  private async load(silent = false) {
    if (!silent) this.renderLoading();
    try {
      const resp = await fetch('/api/policy/registry', { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      this.render(data);
    } catch (err) {
      this.renderError(`Impossibile caricare il registro normativo: ${(err as Error).message}`);
    }
  }

  private render(data: { entries?: PolicyEntry[]; monitor?: PolicyMonitorItem[] }) {
    const entries = data.entries ?? [];
    const monitor = data.monitor ?? [];

    const cards = entries
      .map((e) => {
        const jurisdictionBadge =
          e.jurisdiction === 'eu'
            ? '<span style="margin-left:6px; padding:1px 7px; border-radius:8px; font-size:9px; background: rgba(59,130,246,0.16); color:#3b82f6;">UE</span>'
            : '<span style="margin-left:6px; padding:1px 7px; border-radius:8px; font-size:9px; background: rgba(16,185,129,0.16); color:#10b981;">IT</span>';
        const categoryChips = (e.riskCategories ?? [])
          .map((c) => `<span style="display:inline-block; margin:2px; padding:1px 7px; border-radius:9px; font-size:10px; background: var(--bg-hover); color: var(--text-secondary);">${escapeHtml(CATEGORY_LABELS[c] ?? c)}</span>`)
          .join('');
        const chokepoints = (e.chokepoints ?? [])
          .map((c) => `<span style="display:inline-block; margin:2px; padding:1px 7px; border-radius:9px; font-size:10px; background: rgba(245,158,11,0.14); color:#f59e0b;">${escapeHtml(c)}</span>`)
          .join('');
        const title = e.url
          ? `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none;">${escapeHtml(e.title)}</a>`
          : escapeHtml(e.title);
        return `
          <div style="padding: 10px 12px; margin: 6px 0; border: 1px solid var(--border-color); border-radius: 6px;">
            <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${title}${jurisdictionBadge}</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin: 3px 0;">${escapeHtml(e.reference)}</div>
            <div>${categoryChips}${chokepoints}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin: 5px 0;">${escapeHtml(e.summary)}</div>
            <div style="font-size: 12px; margin: 5px 0; padding: 6px 8px; border-left: 3px solid var(--color-warning); background: rgba(0,0,0,0.15); border-radius: 4px;">
              <strong style="color: var(--color-warning);">Lacuna normativa:</strong> <span style="color: var(--text-secondary);">${escapeHtml(e.gap)}</span>
            </div>
            ${e.customsImplication ? `<div style="font-size: 12px; margin: 4px 0;"><span style="color: #10b981;">Implicazione doganale:</span> <span style="color: var(--text-secondary);">${escapeHtml(e.customsImplication)}</span></div>` : ''}
          </div>`;
      })
      .join('');

    const monitorCards = monitor.length
      ? monitor
          .map((m) => `
            <div style="padding: 8px 10px; margin: 5px 0; border: 1px dashed var(--color-primary); border-radius: 6px; font-size: 12px;">
              <strong style="color: var(--text-primary);">${escapeHtml(m.title)}</strong>
              ${m.reference ? ` · ${escapeHtml(m.reference)}` : ''}
              ${m.url ? ` · <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent);">link</a>` : ''}
              <div style="color: var(--text-secondary); margin-top: 3px;">${escapeHtml(m.summary ?? m.gap ?? '')}</div>
            </div>`)
          .join('')
      : '<div style="font-size: 12px; color: var(--text-secondary); padding: 6px 0;">Nessun aggiornamento dal monitor n8n (pipeline policy-monitor).</div>';

    this.content.innerHTML = `
      <div style="padding: 12px;">
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
          ${entries.length} atti normativi curati (fonti aperte: EUR-Lex, Gazzetta Ufficiale) · ${monitor.length} aggiornamenti dal monitor
        </div>
        ${cards}
        <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-top: 12px;">Monitor normativo (n8n policy-monitor)</div>
        ${monitorCards}
      </div>`;
  }

  public override destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    super.destroy();
  }
}
