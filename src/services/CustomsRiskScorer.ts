import type { RiskEvent, RiskSeverity } from '../types/connectors';

export interface RiskDimensions {
  geopoliticalInstability: number;
  kineticConflict: number;
  physicalInfrastructure: number;
  climaticExtremes: number;
  tradeVolumeVariance: number;
  illicitThreat: number;
  sanctionsExposure: number;
  supplyChainDelay: number;
}

export interface RiskProfile {
  totalScore: number;
  alertLevel: 'MONITORING' | 'ELEVATED' | 'CRITICAL';
  dimensions: RiskDimensions;
  topContributors: string[]; // Event IDs driving the risk
}

export class CustomsRiskScorer {
  // Equal weights (12.5% each) for the 8 dimensions
  private readonly WEIGHTS: Record<keyof RiskDimensions, number> = {
    geopoliticalInstability: 0.125,
    kineticConflict: 0.125,
    physicalInfrastructure: 0.125,
    climaticExtremes: 0.125,
    tradeVolumeVariance: 0.125,
    illicitThreat: 0.125,
    sanctionsExposure: 0.125,
    supplyChainDelay: 0.125,
  };

  private readonly SEVERITY_MULTIPLIER: Record<RiskSeverity, number> = {
    low: 10,
    medium: 30,
    high: 70,
    critical: 100,
  };

  /**
   * Main entry point to evaluating a batch of incoming intelligence.
   */
  public calculateScore(events: RiskEvent[]): RiskProfile {
    const rawDimensions: Record<keyof RiskDimensions, number> = {
      geopoliticalInstability: 0,
      kineticConflict: 0,
      physicalInfrastructure: 0,
      climaticExtremes: 0,
      tradeVolumeVariance: 0,
      illicitThreat: 0,
      sanctionsExposure: 0,
      supplyChainDelay: 0,
    };

    // Aggregate severity scores into appropriate dimensions
    for (const event of events) {
      const score = this.SEVERITY_MULTIPLIER[event.severity] || 0;
      
      switch (event.source) {
        case 'GDELT':
          rawDimensions.geopoliticalInstability += score;
          rawDimensions.sanctionsExposure += score * 0.3; // cross-bleed effect
          rawDimensions.illicitThreat += (event.metadata?.smuggling ? score : 0);
          break;
        case 'ACLED':
          rawDimensions.kineticConflict += score;
          break;
        case 'USGS':
          rawDimensions.physicalInfrastructure += score;
          rawDimensions.supplyChainDelay += score * 0.5; // earthquakes cause delays
          break;
        case 'OPEN_METEO':
          rawDimensions.climaticExtremes += score;
          rawDimensions.supplyChainDelay += score * 0.4;
          break;
        case 'UN_COMTRADE':
          rawDimensions.tradeVolumeVariance += score;
          break;
      }
    }

    // Normalize each dimension to a max of 100
    const normalizedDims = {} as RiskDimensions;
    for (const key of Object.keys(rawDimensions) as Array<keyof RiskDimensions>) {
      normalizedDims[key] = Math.min(100, rawDimensions[key]);
    }

    // Compute composite final score (0-100)
    let totalScore = 0;
    for (const key of Object.keys(normalizedDims) as Array<keyof RiskDimensions>) {
      totalScore += normalizedDims[key] * this.WEIGHTS[key];
    }

    totalScore = Math.min(100, Math.round(totalScore));

    return {
      totalScore,
      alertLevel: this.deriveAlertLevel(totalScore),
      dimensions: normalizedDims,
      topContributors: this.getTopContributors(events),
    };
  }

  private deriveAlertLevel(score: number): 'MONITORING' | 'ELEVATED' | 'CRITICAL' {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'ELEVATED';
    return 'MONITORING';
  }

  private getTopContributors(events: RiskEvent[]): string[] {
    // Sort events by descending severity
    const sorted = [...events].sort((a, b) => {
      const sA = this.SEVERITY_MULTIPLIER[a.severity] || 0;
      const sB = this.SEVERITY_MULTIPLIER[b.severity] || 0;
      return sB - sA;
    });

    return sorted.slice(0, 3).map(e => e.id);
  }
}
