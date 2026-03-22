import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

export class AlertFeedPanel extends Panel {
  constructor() {
    super({
      id: 'alert-feed',
      title: 'Global Risk Alerts',
      className: 'panel-narrow',
      closable: true,
      infoTooltip: 'Live feed of customs and supply chain disruptions scored by Risk Sentinel AI.',
    });
    this.render();
  }

  public renderAlerts(alerts: any[]) {
    this.content.innerHTML = alerts.map(a => `
      <div class="alert-card" style="padding: 12px; border-bottom: 1px solid var(--border-color);" data-id="${a.id}">
        <h4 style="margin: 0 0 4px; color: var(--text-primary); font-size: 14px;">
          ${a.score >= 0.8 ? '🚨' : '⚠️'} ${escapeHtml(a.title)}
        </h4>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <span style="font-size: 12px; font-weight: 600; color: ${a.score >= 0.8 ? 'var(--color-danger)' : 'var(--color-warning)'}">
            Risk: ${(a.score * 100).toFixed(0)}%
          </span>
          <button class="btn btn-small btn-ai-reason" data-reason="${escapeHtml(a.explainability || a.description || '')}" style="font-size: 11px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-hover); cursor: pointer; color: var(--text-primary);">
            ✨ AI Reasoning
          </button>
        </div>
      </div>
    `).join('');

    this.content.querySelectorAll('.btn-ai-reason').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const reason = target.dataset.reason;
        
        // Find existing or create
        let explainUi = target.parentElement?.querySelector('.ai-explain-ui');
        if (!explainUi) {
          explainUi = document.createElement('div');
          explainUi.className = 'ai-explain-ui';
          explainUi.setAttribute('style', 'margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.2); border-left: 3px solid var(--color-primary); border-radius: 4px; font-size: 12px; color: var(--text-secondary);');
          explainUi.innerHTML = `<strong>AI Act Compliance Log:</strong><br/>${reason}`;
          target.parentElement?.parentElement?.appendChild(explainUi);
        } else {
          explainUi.remove();
        }
      });
    });
  }

  private render() {
    this.content.innerHTML = '<div style="padding: 12px; color: var(--text-secondary);">Initializing Risk Sentinel engine...</div>';
  }
}
