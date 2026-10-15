import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import type { CustomsEvent } from '@/services/customs-events';

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'critica',
  extreme: 'estrema',
  high: 'alta',
  elevated: 'elevata',
  moderate: 'moderata',
  low: 'bassa',
  normal: 'normale',
};

const SOURCE_LABELS: Record<string, string> = {
  usgs: 'USGS',
  emsc: 'EMSC',
  gdelt: 'GDELT',
  openmeteo: 'Open-Meteo',
  commodities: 'Materie prime (Yahoo Finance)',
  comtrade: 'UN Comtrade',
  policy: 'Monitor normativo',
};

function sourceLabel(source: string | undefined): string {
  if (!source) return 'n8n';
  return SOURCE_LABELS[source.toLowerCase()] ?? source;
}

/**
 * Signals from the n8n pipelines (notification digest). Each card shows the
 * severity declared by its source: it is not a risk score of the thesis model
 * (no trigger, no node, no good behind it), so no percentage is shown.
 */
export class AlertFeedPanel extends Panel {
  constructor() {
    super({
      id: 'alert-feed',
      title: 'Global Risk Alerts',
      className: 'panel-narrow',
      closable: true,
      infoTooltip: 'Segnali delle pipeline n8n (notizie GDELT, anomalie climatiche Open-Meteo, materie prime, monitor normativo): titolo e severità dichiarata dalla fonte. Non è un punteggio di rischio del modello della tesi.',
    });
    this.render();
  }

  public renderAlerts(alerts: CustomsEvent[]) {
    if (alerts.length === 0) {
      this.content.innerHTML =
        '<div style="padding: 12px; color: var(--text-secondary);">Nessun segnale attivo. Il feed si popola dalle pipeline n8n (notizie, materie prime, clima, norme).</div>';
      return;
    }
    this.content.innerHTML = alerts.map((a, i) => {
      const sev = a.sourceSeverity ?? '';
      const strong = a.severity === 'critical' || a.severity === 'high';
      return `
      <div class="alert-card" style="padding: 12px; border-bottom: 1px solid var(--border-color);">
        <h4 style="margin: 0 0 4px; color: var(--text-primary); font-size: 14px;">${escapeHtml(a.title)}</h4>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px;">
          <span style="font-size: 12px; color: ${strong ? 'var(--color-warning)' : 'var(--text-secondary)'}">
            ${escapeHtml(sourceLabel(a.source))}${sev ? ` · severità ${escapeHtml(SEVERITY_LABELS[sev] ?? sev)} (dalla fonte)` : ''}
          </span>
          <button class="btn btn-small btn-alert-details" data-index="${i}" style="font-size: 11px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-hover); cursor: pointer; color: var(--text-primary);">
            Dettagli
          </button>
        </div>
      </div>`;
    }).join('');

    this.content.querySelectorAll<HTMLElement>('.btn-alert-details').forEach((btn) => {
      btn.addEventListener('click', () => {
        const alert = alerts[Number(btn.dataset.index)];
        const card = btn.closest('.alert-card');
        if (!alert || !card) return;
        const existing = card.querySelector('.alert-details');
        if (existing) {
          existing.remove();
          return;
        }
        const box = document.createElement('div');
        box.className = 'alert-details';
        box.setAttribute('style', 'margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.2); border-left: 3px solid var(--color-primary); border-radius: 4px; font-size: 12px; color: var(--text-secondary);');
        if (alert.description) {
          const p = document.createElement('div');
          p.textContent = alert.description;
          box.appendChild(p);
        }
        const meta = document.createElement('div');
        meta.textContent = `Fonte: ${sourceLabel(alert.source)}${alert.sourceSeverity ? ` · severità dichiarata: ${SEVERITY_LABELS[alert.sourceSeverity] ?? alert.sourceSeverity}` : ''}`;
        box.appendChild(meta);
        if (alert.url) {
          const link = document.createElement('a');
          link.href = alert.url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'Apri la fonte ↗';
          box.appendChild(link);
        }
        card.appendChild(box);
      });
    });
  }

  private render() {
    this.content.innerHTML = '<div style="padding: 12px; color: var(--text-secondary);">Caricamento dei segnali…</div>';
  }
}
