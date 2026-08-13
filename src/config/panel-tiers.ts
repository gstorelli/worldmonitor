/**
 * Risk Sentinel — 3-tier UI panel selector (PhD alignment).
 *
 * Tier 1 (CORE): panels created for, or fully reusable in, the doctoral
 *   project — customs risk, chokepoints, OSINT intelligence, hazard fusion,
 *   explainability. Rendered with a green "CORE" badge.
 * Tier 2 (CONTESTO): collaterally useful context (markets, macro, lifestyle
 *   indices, correlations). Rendered with a neutral badge.
 * Tier 3 (DISABLED): speculative/crypto/startup panels with no PhD relevance.
 *   NEVER deleted — the fork keeps upstream syncs non-disruptive by disabling
 *   them at the layout level only (see src/app/panel-layout.ts).
 *
 * Unknown panel ids default to tier 2 (safe: nothing is ever silently hidden
 * unless it is explicitly listed as tier 3 here).
 */

export type PanelTier = 1 | 2 | 3;

export const PANEL_TIERS: Record<string, PanelTier> = {
  // ── Tier 1: CORE doctoral focus ─────────────────────────────────────────
  'alert-feed': 1,
  'commodities': 1,
  'cascade': 1,
  'cii': 1,
  'supply-chain': 1,
  'trade-policy': 1,
  'strategic-risk': 1,
  'strategic-posture': 1,
  'gdelt-intel': 1,
  'events': 1,
  'heatmap': 1,
  'monitors': 1,
  'sanctions-pressure': 1,
  'ucdp-events': 1,
  'service-status': 1,
  'internet-disruptions': 1,
  'satellite-fires': 1,
  'energy-complex': 1,
  'insights': 1,
  'escalation-correlation': 1,
  'disaster-correlation': 1,
  'source-validation': 1,
  'policy-analysis': 1,

  // ── Tier 3: DISABLED (speculative / crypto / startup) ──────────────────
  'crypto': 3,
  'crypto-heatmap': 3,
  'defi-tokens': 3,
  'ai-tokens': 3,
  'other-tokens': 3,
  'stablecoins': 3,
  'polymarket': 3,
};

export const TIER_META: Record<PanelTier, { label: string; className: string }> = {
  1: { label: 'CORE', className: 'panel-tier-core' },
  2: { label: 'CONTESTO', className: 'panel-tier-context' },
  3: { label: 'DISABLED', className: 'panel-tier-disabled' },
};

export function getPanelTier(panelId: string): PanelTier {
  return PANEL_TIERS[panelId] ?? 2;
}

export function isPanelDisabled(panelId: string): boolean {
  return getPanelTier(panelId) === 3;
}
