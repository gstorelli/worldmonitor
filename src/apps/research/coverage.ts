/**
 * Research — methodological coverage analysis.
 *
 * Maps the curated bibliography onto the canonical 8-dimension customs risk
 * model and reports which dimensions the literature actually supports. The
 * entries use `geophysicalClimate`, which is an alias of the canonical
 * `geophysicalImpact`; unknown keys are surfaced instead of being dropped.
 *
 * Pure helpers (unit-tested).
 */

import type { ResearchSource } from './types';

export const RISK_DIMENSIONS = [
  'eventSeverity',
  'sourceConfidence',
  'tradeExposure',
  'routeCriticality',
  'commoditySensitivity',
  'escalationMomentum',
  'customsRelevance',
  'geophysicalImpact',
] as const;

export type RiskDimension = (typeof RISK_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<RiskDimension, string> = {
  eventSeverity: 'Event Severity',
  sourceConfidence: 'Source Confidence',
  tradeExposure: 'Trade Exposure',
  routeCriticality: 'Route Criticality',
  commoditySensitivity: 'Commodity Sensitivity',
  escalationMomentum: 'Escalation Momentum',
  customsRelevance: 'Customs Relevance',
  geophysicalImpact: 'Geophysical / Climate Impact',
};

const DIMENSION_ALIASES: Record<string, RiskDimension> = {
  geophysicalClimate: 'geophysicalImpact',
  geophysical: 'geophysicalImpact',
  climate: 'geophysicalImpact',
};

export function normalizeDimension(value: string): RiskDimension | null {
  const key = String(value ?? '').trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  const canonical = RISK_DIMENSIONS.find((dimension) => dimension.toLowerCase() === lower);
  if (canonical) return canonical;
  for (const [alias, dimension] of Object.entries(DIMENSION_ALIASES)) {
    if (alias.toLowerCase() === lower) return dimension;
  }
  return null;
}

export interface DimensionCoverage {
  id: RiskDimension;
  label: string;
  count: number;
  refs: number[];
}

export function computeDimensionCoverage(sources: ResearchSource[]): DimensionCoverage[] {
  const byDimension = new Map<RiskDimension, number[]>();
  for (const dimension of RISK_DIMENSIONS) byDimension.set(dimension, []);
  for (const source of sources) {
    for (const raw of source.dimensions ?? []) {
      const dimension = normalizeDimension(raw);
      if (dimension) byDimension.get(dimension)?.push(source.ref);
    }
  }
  return RISK_DIMENSIONS.map((id) => ({
    id,
    label: DIMENSION_LABELS[id],
    count: byDimension.get(id)?.length ?? 0,
    refs: byDimension.get(id) ?? [],
  }));
}

export function findCoverageGaps(sources: ResearchSource[], minSources = 1): DimensionCoverage[] {
  return computeDimensionCoverage(sources).filter((entry) => entry.count < minSources);
}

export function countSourcesForDimension(sources: ResearchSource[], dimension: RiskDimension): number {
  return sources.filter((source) =>
    (source.dimensions ?? []).some((raw) => normalizeDimension(raw) === dimension),
  ).length;
}

export interface DistributionEntry {
  key: string;
  label: string;
  count: number;
}

export function computeThemeDistribution(sources: ResearchSource[], labels: Record<string, string> = {}): DistributionEntry[] {
  const counts = new Map<string, number>();
  for (const source of sources) counts.set(source.themeArea, (counts.get(source.themeArea) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: labels[key] ?? key, count }))
    .sort((a, b) => b.count - a.count);
}

export function computeTypeDistribution(sources: ResearchSource[]): DistributionEntry[] {
  const counts = new Map<string, number>();
  for (const source of sources) counts.set(source.type, (counts.get(source.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count);
}

export function computeYearHistogram(sources: ResearchSource[]): DistributionEntry[] {
  const counts = new Map<string, number>();
  for (const source of sources) counts.set(String(source.year), (counts.get(String(source.year)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => Number(b.key) - Number(a.key));
}
