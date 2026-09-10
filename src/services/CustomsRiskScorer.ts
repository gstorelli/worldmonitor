import {
  classifyCustomsRisk,
  computeWeightedRiskScore,
  type CustomsRiskDimensions,
  type CustomsRiskLevel,
} from './customs-risk-scoring';

export type RiskDimensions = CustomsRiskDimensions;

export interface RiskProfile {
  totalScore: number;
  alertLevel: CustomsRiskLevel;
  dimensions: RiskDimensions;
}

/**
 * Canonical 8-dimension customs risk scorer.
 *
 * Historically this class hard-coded an unrelated equal-weight model
 * (0.125 × 8 dimensions) that contradicted the PhD spec, the n8n workflow 01
 * code node and the desktop sidecar baseline scorer. It is now a thin façade
 * over `customs-risk-scoring.ts` so there is exactly one formula in the
 * codebase (see `tests/customs-risk-scoring-parity.test.mjs`).
 *
 * Callers submit the eight dimension values (each 0-100); the class only
 * applies the canonical weights and alert bands.
 */
export class CustomsRiskScorer {
  public calculateScore(dimensions: RiskDimensions): RiskProfile {
    const totalScore = computeWeightedRiskScore(dimensions);
    return {
      totalScore,
      alertLevel: classifyCustomsRisk(totalScore),
      dimensions: { ...dimensions },
    };
  }
}
