/**
 * Research — bibliography distributions (types, years, layers).
 *
 * The 8-dimension coverage matrix of the v0 score was removed on 13/10/2026:
 * the thesis declares those dimensions and weights unjustified, so the
 * bibliography is now classified by the layers of the thesis model
 * (layers.ts, computeLayerCoverage). Pure helpers (unit-tested).
 */

import { LAYER_LABELS, sourceLayers } from './layers';
import type { ResearchSource } from './types';

export interface DistributionEntry {
  key: string;
  label: string;
  count: number;
}

export function computeLayerDistribution(sources: ResearchSource[]): DistributionEntry[] {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const layers = sourceLayers(source);
    for (const layer of layers.length ? layers : ['']) counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key ? (LAYER_LABELS[key] ?? key) : 'importata', count }))
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
