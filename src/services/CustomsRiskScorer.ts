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
 * Provisional v0 8-dimension customs risk scorer.
 *
 * Historically this class hard-coded an equal-weight model (0.125 × 8
 * dimensions) that differed from the n8n workflow 01 code node and the desktop
 * sidecar baseline scorer. Uniform weights return in Year 2 as the neutral
 * baseline of the sensitivity analysis (docs/thesis/). It is now a thin façade
 * over `customs-risk-scoring.ts` so there is exactly one formula in the
 * codebase (see `tests/customs-risk-scoring-parity.test.mjs`).
 *
 * Callers submit the eight dimension values (each 0-100); the class only
 * applies the v0 weights and alert bands.
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
