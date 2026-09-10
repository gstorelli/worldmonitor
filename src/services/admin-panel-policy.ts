/**
 * Risk Sentinel — admin UI for the global panel policy.
 *
 * Rendered inside the UnifiedSettings "Admin" tab (visible only to admins).
 * Toggling a panel writes the server policy and reloads so the layout is
 * rebuilt with the new allowlist.
 */

import { ALL_PANELS } from '@/config/panels';
import { isPanelDisabled } from '@/config/panel-tiers';
import { escapeHtml } from '@/utils/sanitize';
import { getPolicyDisabledPanels, setPolicyDisabled } from './panel-policy';

export function renderPanelPolicyAdmin(container: HTMLElement): void {
  const disabled = new Set(getPolicyDisabledPanels());
  const entries = Object.entries(ALL_PANELS)
    .filter(([key]) => key !== 'runtime-config' && !key.startsWith('cw-'))
    .filter(([key]) => !isPanelDisabled(key));

  container.innerHTML = `
    <div class="ai-flow-section-label">Pannelli disattivati per tutti</div>
    <div class="ai-flow-toggle-desc" style="margin-bottom:8px">
      La policy admin ha precedenza sulle preferenze dei singoli utenti e vale per tutti.
      Le modifiche ricaricano la pagina.
    </div>
    <div class="panel-toggle-grid" id="rsAdminPolicyGrid">
      ${entries
        .map(
          ([key, panel]) => `
        <div class="panel-toggle-item ${disabled.has(key) ? '' : 'active'}" data-policy-panel="${escapeHtml(key)}" aria-pressed="${!disabled.has(key)}">
          <div class="panel-toggle-checkbox">${disabled.has(key) ? '' : '\u2713'}</div>
          <span class="panel-toggle-label">${escapeHtml(panel.name)}</span>
        </div>`,
        )
        .join('')}
    </div>
    <div class="ai-flow-toggle-desc" id="rsAdminPolicyStatus" style="margin-top:8px"></div>
  `;

  container.onclick = async (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('[data-policy-panel]');
    if (!item) return;
    const key = item.dataset.policyPanel as string;
    const status = container.querySelector<HTMLElement>('#rsAdminPolicyStatus');
    const shouldDisable = !disabled.has(key);
    try {
      if (status) status.textContent = 'Salvataggio…';
      await setPolicyDisabled(key, shouldDisable);
      location.reload();
    } catch (error) {
      if (status) status.textContent = `Errore: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
}
