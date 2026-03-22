import { getDb } from '../database/sqlite.js';

export interface EventData {
  id: string; // from gdelt URL or hash
  title: string;
  description: string;
  sourceUrl: string;
}

// Domain Knowledge Constants provided by user
const ROUTES = {
  'Suez Canal': 0.95,
  'Strait of Hormuz': 0.90,
  'Panama Canal': 0.85,
  'Taiwan Strait': 0.85,
  'Malacca Strait': 0.80,
  'Gibraltar': 0.70
};

const COMMODITIES = {
  'Semiconductors': 0.95,
  'Oil': 0.90,
  'Gas': 0.90,
  'Grain': 0.75,
  'Agriculture': 0.75,
  'Pharmaceuticals': 0.70,
  'Consumer Goods': 0.60
};

const SEVERITY_KEYWORDS = {
  attack: 100, war: 100, blockade: 100, sanction: 100,
  escalation: 75, disruption: 75, grounding: 75,
  strike: 50, delay: 50, shortage: 50,
  monitor: 25, concern: 25
};

/**
 * Mathematical Baseline Rule-Based Pre-filter
 * Formula: RiskScore = 0.18*EventSeverity + 0.10*SourceConfidence + 0.18*TradeExposure + 0.14*RouteCriticality + 0.12*CommoditySensitivity + 0.10*EscalationMomentum + 0.12*CustomsRelevance + 0.06*GeophysicalClimateImpact
 */
export function calculateBaselineScore(event: EventData): number {
  const textMatches = (event.title + ' ' + event.description).toLowerCase();

  // 1. Event Severity (based on keywords)
  let maxSeverity = 0;
  for (const [kw, val] of Object.entries(SEVERITY_KEYWORDS)) {
    if (textMatches.includes(kw) && val > maxSeverity) {
      maxSeverity = val;
    }
  }

  // 2. Source Confidence (fixed 0.8 for reputable like GDELT standard, adjustable)
  const sourceConfidence = 0.80 * 100;

  // 3. Trade Exposure (general mentions of trade, exports, imports)
  const tradeExposure = textMatches.match(/(export|import|trade|supply chain|cargo|freight|vessel)/i) ? 80 : 20;

  // 4. Route Criticality
  let maxRoute = 0;
  for (const [route, val] of Object.entries(ROUTES)) {
    if (textMatches.includes(route.toLowerCase()) && (val * 100) > maxRoute) {
      maxRoute = val * 100;
    }
  }

  // 5. Commodity Sensitivity
  let maxComm = 0;
  for (const [comm, val] of Object.entries(COMMODITIES)) {
    if (textMatches.includes(comm.toLowerCase()) && (val * 100) > maxComm) {
      maxComm = val * 100;
    }
  }

  // 6. Escalation Momentum, Customs Relevance, Geophysical Climate (simplified heuristics or placeholders before LLM step)
  const escalationMomentum = textMatches.match(/(escalate|worsen|spread|crisis|threat)/i) ? 75 : 20;
  const customsRelevance = textMatches.match(/(customs|tariff|border|inspection|smuggl|seiz|wto)/i) ? 90 : 30;
  const geoPhysical = textMatches.match(/(earthquake|tsunami|hurricane|typhoon|drought|flood)/i) ? 85 : 10;

  const score = 
    (0.18 * maxSeverity) +
    (0.10 * sourceConfidence) +
    (0.18 * tradeExposure) +
    (0.14 * maxRoute) +
    (0.12 * maxComm) +
    (0.10 * escalationMomentum) +
    (0.12 * customsRelevance) +
    (0.06 * geoPhysical);

  return score;
}

export function classifyScore(score: number): 'Critical' | 'High' | 'Elevated' | 'Moderate' | 'Low' {
  if (score >= 85) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 50) return 'Elevated';
  if (score >= 25) return 'Moderate';
  return 'Low';
}
