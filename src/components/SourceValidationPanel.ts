import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

const THEME_LABELS: Record<string, string> = {
  A: 'Dogane & AI di frontiera',
  B: 'Supply-chain & disruption marittime',
  C: 'Multi-hazard & geospaziale',
  D: 'LLM, XAI & accountability',
  E: 'Metodologia & infrastruttura',
};

const THEME_GAPS: Record<string, string> = {
  A: 'L\'AI doganale è data-isolated: opera solo su dati dichiarativi, senza segnali esterni in tempo reale.',
  B: 'I modelli supply-chain/marittimi quantificano l\'esposizione ma sono retrospettivi: nessun early-warning operativo.',
  C: 'I framework multi-hazard validano la fusione ma confondono hazard e risk (88% dei casi, Ward et al.) e ignorano il dominio doganale.',
  D: 'La ricerca LLM/XAI offre componenti (judge, survey, accountability, filtri anti-misinformazione) ma non un sistema assemblato e domain-grounded.',
  E: 'Metodologia e infrastruttura (DSRM, n8n, CRMF, PortWatch) forniscono l\'impalcatura ma non l\'intelligence di dominio.',
};

const DIMENSION_LABELS: Record<string, string> = {
  eventSeverity: 'Severità evento',
  tradeExposure: 'Esposizione commerciale',
  routeCriticality: 'Criticità rotta',
  commoditySensitivity: 'Sensibilità commodity',
  customsRelevance: 'Rilevanza doganale',
  sourceConfidence: 'Confidenza fonte',
  escalationMomentum: 'Momentum escalation',
  geophysicalClimate: 'Geofisica/Clima',
};

interface ZoteroSource {
  ref: number;
  authors: string;
  year: number | string;
  title: string;
  type: string;
  venue?: string;
  doi?: string | null;
  url?: string | null;
  themeArea: string;
  summary: string;
  limitation: string;
  contribution: string;
  dimensions: string[];
  verified?: boolean;
}

export class SourceValidationPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'source-validation',
      title: 'Fonti & Validazione',
      className: 'panel-wide',
      closable: true,
      infoTooltip: 'Analisi critica delle fonti bibliografiche del dottorato (Zotero + literature review): per ogni fonte, limiti, bias e contributo al gap di ricerca.',
    });
    this.renderLoading();
    void this.load();
    this.refreshTimer = setInterval(() => void this.load(true), 10 * 60 * 1000);
  }

  private renderLoading() {
    this.content.innerHTML = '<div style="padding: 12px; color: var(--text-secondary);">Caricamento fonti bibliografiche…</div>';
  }

  private renderError(message: string) {
    this.content.innerHTML = `<div style="padding: 12px; color: var(--color-warning);">${escapeHtml(message)}</div>`;
  }

  private async load(silent = false) {
    if (!silent) this.renderLoading();
    try {
      const resp = await fetch('/api/zotero/library', { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      this.render(data);
    } catch (err) {
      this.renderError(`Impossibile caricare le fonti: ${(err as Error).message}`);
    }
  }

  private render(data: { sources?: ZoteroSource[]; library?: unknown[] | null; librarySource?: string; zoteroConfigured?: boolean; userId?: string }) {
    const sources = data.sources ?? [];
    const libraryCount = Array.isArray(data.library) ? data.library.length : 0;

    const gapCards = Object.entries(THEME_GAPS)
      .map(([area, gap]) => `
        <div class="source-gap-card" style="padding: 8px 10px; margin: 4px 0; border-left: 3px solid var(--color-primary); background: rgba(0,0,0,0.15); border-radius: 4px; font-size: 12px;">
          <strong style="color: var(--text-primary);">${escapeHtml(THEME_LABELS[area] ?? area)}</strong><br/>
          <span style="color: var(--text-secondary);">${escapeHtml(gap)}</span>
        </div>`)
      .join('');

    const byArea = new Map<string, ZoteroSource[]>();
    for (const s of sources) {
      const list = byArea.get(s.themeArea) ?? [];
      list.push(s);
      byArea.set(s.themeArea, list);
    }

    const sections = Array.from(byArea.entries())
      .map(([area, list]) => {
        const cards = list
          .sort((a, b) => a.ref - b.ref)
          .map((s) => {
            const link = s.url
              ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none;">${escapeHtml(s.title)}</a>`
              : escapeHtml(s.title);
            const dimensionChips = (s.dimensions ?? [])
              .map((d) => `<span class="source-dim-chip" style="display:inline-block; margin:2px; padding:1px 7px; border-radius:9px; font-size:10px; background: rgba(16,185,129,0.14); color:#10b981;">${escapeHtml(DIMENSION_LABELS[d] ?? d)}</span>`)
              .join('');
            return `
              <div class="source-card" style="padding: 10px 12px; margin: 6px 0; border: 1px solid var(--border-color); border-radius: 6px;">
                <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${link}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin: 3px 0;">
                  <strong>${escapeHtml(s.authors)}</strong> (${escapeHtml(String(s.year))})
                  ${s.venue ? ` · ${escapeHtml(s.venue)}` : ''}
                  ${s.doi ? ` · doi:${escapeHtml(s.doi)}` : ''}
                  <span style="margin-left: 6px; padding: 1px 6px; border-radius: 8px; font-size: 9px; background: var(--bg-hover);">${escapeHtml(s.type)}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); margin: 4px 0;">${escapeHtml(s.summary)}</div>
                <div style="font-size: 12px; margin: 4px 0;">
                  <span style="color: var(--color-warning);">⚠ Limite:</span> <span style="color: var(--text-secondary);">${escapeHtml(s.limitation)}</span>
                </div>
                <div style="font-size: 12px; margin: 4px 0;">
                  <span style="color: #10b981;">✓ Contributo:</span> <span style="color: var(--text-secondary);">${escapeHtml(s.contribution)}</span>
                </div>
                <div>${dimensionChips}</div>
              </div>`;
          })
          .join('');
        return `
          <div style="margin-top: 10px;">
            <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 8px 0 4px;">${escapeHtml(THEME_LABELS[area] ?? area)}</div>
            ${cards}
          </div>`;
      })
      .join('');

    const zoteroNote = data.zoteroConfigured
      ? `Zotero collegato: ${libraryCount} elementi in libreria`
      : 'Zotero non configurato (ZOTERO_API_KEY/ZOTERO_USER_ID mancanti) — mostro solo la bibliografia curata.';

    this.content.innerHTML = `
      <div style="padding: 12px;">
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">
          ${sources.length} fonti verificate · ${escapeHtml(zoteroNote)}
          ${data.librarySource === 'zotero'
            ? ` · <a href="https://www.zotero.org/${escapeHtml(data.userId || '')}/library" target="_blank" rel="noopener noreferrer" style="color: var(--accent);">Apri in Zotero</a>`
            : ''}
        </div>
        <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-top: 8px;">Il gap di ricerca (5 parzialità della literature review)</div>
        ${gapCards}
        ${sections}
      </div>`;
  }

  public override destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    super.destroy();
  }
}
