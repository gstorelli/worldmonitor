/**
 * Canonical 8-dimension Customs Risk Scoring model (PhD spec).
 *
 * RiskScore = 0.18 × EventSeverity
 *           + 0.10 × SourceConfidence
 *           + 0.18 × TradeExposure
 *           + 0.14 × RouteCriticality
 *           + 0.12 × CommoditySensitivity
 *           + 0.10 × EscalationMomentum
 *           + 0.12 × CustomsRelevance
 *           + 0.06 × GeophysicalClimateImpact
 *
 * This is the single source of truth for the weights. The formula is
 * duplicated for runtime reasons in two places that cannot import this module:
 *   - n8n workflow 01 code node (`n8n-workflows/01-gdelt-customs-ingestion.json`)
 *   - desktop sidecar baseline scorer (`src-tauri/sidecar/services/scoring.ts`)
 * `tests/customs-risk-scoring-parity.test.mjs` locks all three copies to this
 * map so they can never drift silently.
 */

export const CUSTOMS_RISK_DIMENSIONS = [
  'eventSeverity',
  'sourceConfidence',
  'tradeExposure',
  'routeCriticality',
  'commoditySensitivity',
  'escalationMomentum',
  'customsRelevance',
  'geophysicalImpact',
] as const;

export type CustomsRiskDimension = (typeof CUSTOMS_RISK_DIMENSIONS)[number];

export type CustomsRiskDimensions = Record<CustomsRiskDimension, number>;

export const CUSTOMS_RISK_WEIGHTS: Record<CustomsRiskDimension, number> = {
  eventSeverity: 0.18,
  sourceConfidence: 0.10,
  tradeExposure: 0.18,
  routeCriticality: 0.14,
  commoditySensitivity: 0.12,
  escalationMomentum: 0.10,
  customsRelevance: 0.12,
  geophysicalImpact: 0.06,
};

export type CustomsRiskLevel = 'Critical' | 'High' | 'Elevated' | 'Moderate' | 'Low';

/** Weighted composite of the 8 dimensions, each already expressed on 0-100. */
export function computeWeightedRiskScore(dimensions: CustomsRiskDimensions): number {
  let total = 0;
  for (const dimension of CUSTOMS_RISK_DIMENSIONS) {
    total += (dimensions[dimension] ?? 0) * CUSTOMS_RISK_WEIGHTS[dimension];
  }
  return Math.min(100, Math.max(0, Math.round(total)));
}

/** Alert bands from the PhD spec (`n8n-workflows/README.md`). */
export function classifyCustomsRisk(score: number): CustomsRiskLevel {
  if (score >= 85) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 50) return 'Elevated';
  if (score >= 25) return 'Moderate';
  return 'Low';
}
