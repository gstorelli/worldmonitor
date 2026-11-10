/**
 * Research — the layers of the thesis model used to classify the bibliography
 * (13/10/2026: replaces the A-E theme areas and the v0 8-dimension matrix,
 * whose weights the thesis declares unjustified).
 *
 * The layer of a source comes from the section of the thesis verification
 * register (docs/FONTI_VERIFICATE.md) it is filed under; see
 * scripts/build-research-bibliography.mjs. Pure data and helpers (unit-tested).
 */

import type { ResearchSource } from './types';

export interface ModelLayer {
  id: string;
  label: string;
  /** Compact label for table cells. */
  short: string;
  /** Default OpenAlex keywords for the "Novità accademiche" tab. */
  query: string;
}

export const MODEL_LAYERS: ModelLayer[] = [
  { id: 'trigger', short: 'Innesco', label: 'Innesco', query: 'earthquake volcanic eruption hazard catalogue critical infrastructure' },
  { id: 'node', short: 'Nodo', label: 'Nodo critico', query: 'maritime chokepoint port disruption natural hazard' },
  { id: 'good', short: 'Bene', label: 'Bene strategico', query: 'critical raw materials semiconductors supply disruption' },
  { id: 'supply', short: 'Fornitura', label: 'Vulnerabilità di fornitura', query: 'import dependence supplier concentration critical raw materials Europe' },
  { id: 'modulator', short: 'Modulatore', label: 'Modulatore', query: 'export restrictions sanctions anti-dumping trade policy' },
  { id: 'customs', short: 'Dogana', label: 'Vulnerabilità e rischio doganale', query: 'customs risk management artificial intelligence border control' },
  { id: 'method', short: 'Metodo', label: 'Metodo', query: 'design science research global sensitivity analysis composite indicators' },
  { id: 'platform', short: 'Piattaforma', label: 'Piattaforma', query: 'early warning system platform open data' },
];

export const LAYER_LABELS: Record<string, string> = Object.fromEntries(MODEL_LAYERS.map((layer) => [layer.id, layer.label]));
export const LAYER_SHORT_LABELS: Record<string, string> = Object.fromEntries(MODEL_LAYERS.map((layer) => [layer.id, layer.short]));

/** Verification levels, strongest first. */
export const VERIFICATION_LEVELS = ['T', 'API', 'P', 'S'] as const;
export const VERIFICATION_LABELS: Record<string, string> = {
  T: 'testo completo letto',
  API: 'dati estratti dal servizio della fonte',
  P: 'pagina editore, catalogo o abstract',
  S: 'copia secondaria (da ricontrollare)',
};

/** Accepts an id ("trigger") or the start of an Italian label ("innesco", "nodo"). */
export function resolveLayer(value: string): string | null {
  const wanted = String(value ?? '').trim().toLowerCase();
  if (!wanted) return null;
  const byId = MODEL_LAYERS.find((layer) => layer.id === wanted);
  if (byId) return byId.id;
  const byLabel = MODEL_LAYERS.find((layer) => layer.label.toLowerCase().startsWith(wanted));
  return byLabel?.id ?? null;
}

export function sourceLayers(source: ResearchSource): string[] {
  return Array.isArray(source.layers) ? source.layers : [];
}

export interface LayerCoverage {
  id: string;
  label: string;
  count: number;
  /** Count per verification level; "none" = not verified. */
  byLevel: Record<string, number>;
  refs: number[];
}

export function computeLayerCoverage(sources: ResearchSource[]): LayerCoverage[] {
  return MODEL_LAYERS.map((layer) => {
    const inLayer = sources.filter((source) => sourceLayers(source).includes(layer.id));
    const byLevel: Record<string, number> = { T: 0, API: 0, P: 0, S: 0, none: 0 };
    for (const source of inLayer) {
      const level = source.verified && source.verification && source.verification in byLevel ? source.verification : 'none';
      byLevel[level] = (byLevel[level] ?? 0) + 1;
    }
    return { id: layer.id, label: layer.label, count: inLayer.length, byLevel, refs: inLayer.map((source) => source.ref) };
  });
}

/** Layers with no source, or with no source read in full (T) or taken from data (API). */
export function findWeakLayers(coverage: LayerCoverage[]): { empty: LayerCoverage[]; noFullText: LayerCoverage[] } {
  return {
    empty: coverage.filter((entry) => entry.count === 0),
    noFullText: coverage.filter((entry) => entry.count > 0 && entry.byLevel.T === 0 && entry.byLevel.API === 0),
  };
}
