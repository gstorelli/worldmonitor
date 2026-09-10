/**
 * Risk Sentinel — global panel policy (server-controlled).
 *
 * An admin can disable panels FOR EVERYONE from the settings UI. The SPA reads
 * `/api/panel-policy` at boot and filters those panels out at layout time.
 * Precedence: policy (disable) > per-user preferences > defaults.
 */

export const PANEL_POLICY_EVENT = 'rs-panel-policy-changed';

let disabledPanels = new Set<string>();

export async function loadPanelPolicy(): Promise<void> {
  try {
    const res = await fetch('/api/panel-policy', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { disabledPanels?: unknown };
    disabledPanels = new Set(
      Array.isArray(data.disabledPanels) ? data.disabledPanels.filter((id): id is string => typeof id === 'string') : [],
    );
  } catch {
    // Policy is non-critical: keep whatever we had (nothing disabled on first boot).
  }
}

export function isPolicyDisabled(panelId: string): boolean {
  return disabledPanels.has(panelId);
}

export function getPolicyDisabledPanels(): string[] {
  return [...disabledPanels];
}

/** Admin-only server call; throws on failure so the UI can surface it. */
export async function setPolicyDisabled(panelId: string, disabled: boolean): Promise<void> {
  const next = new Set(disabledPanels);
  if (disabled) next.add(panelId);
  else next.delete(panelId);
  const res = await fetch('/api/panel-policy', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disabledPanels: [...next] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  disabledPanels = next;
  window.dispatchEvent(new CustomEvent(PANEL_POLICY_EVENT));
}
