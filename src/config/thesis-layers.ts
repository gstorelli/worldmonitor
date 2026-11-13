/**
 * Canonical layer list of the thesis model (CLAUDE.md, "Il modello a sei strati").
 *
 * Six layers of the chain (trigger → critical node → strategic good → supply
 * vulnerability → customs vulnerability → customs risk), the two cross-cutting
 * elements (modulators and signals) and two classification-only layers for the
 * bibliography (method, platform). Customs vulnerability (degradation of the
 * control function) and customs risk (pre-arrival alert) are separate layers.
 *
 * GDELT and UCDP are signals, never triggers. Pure data, no imports: the
 * bibliography generator (scripts/build-research-bibliography.mjs) cannot import
 * from src/, so tests/thesis-layers-parity.test.mts checks that every layer id it
 * emits is listed here.
 */

export type ThesisLayerKind = 'chain' | 'cross-cutting' | 'classification';

export interface ThesisLayer {
  id: string;
  kind: ThesisLayerKind;
  /** Position in the six-layer chain (1-6); null for cross-cutting and classification layers. */
  position: number | null;
  label: { it: string; en: string };
  /** Compact labels for table cells. */
  short: { it: string; en: string };
}

export const THESIS_LAYERS: readonly ThesisLayer[] = [
  { id: 'trigger', kind: 'chain', position: 1, label: { it: 'Innesco', en: 'Trigger' }, short: { it: 'Innesco', en: 'Trigger' } },
  { id: 'node', kind: 'chain', position: 2, label: { it: 'Nodo critico', en: 'Critical node' }, short: { it: 'Nodo', en: 'Node' } },
  { id: 'good', kind: 'chain', position: 3, label: { it: 'Bene strategico', en: 'Strategic good' }, short: { it: 'Bene', en: 'Good' } },
  { id: 'supply', kind: 'chain', position: 4, label: { it: 'Vulnerabilità di fornitura', en: 'Supply vulnerability' }, short: { it: 'Fornitura', en: 'Supply' } },
  { id: 'customs-vulnerability', kind: 'chain', position: 5, label: { it: 'Vulnerabilità doganale', en: 'Customs vulnerability' }, short: { it: 'Vuln. doganale', en: 'Customs vuln.' } },
  { id: 'customs-risk', kind: 'chain', position: 6, label: { it: 'Rischio doganale', en: 'Customs risk' }, short: { it: 'Rischio doganale', en: 'Customs risk' } },
  { id: 'modulator', kind: 'cross-cutting', position: null, label: { it: 'Modulatore', en: 'Modulator' }, short: { it: 'Modulatore', en: 'Modulator' } },
  { id: 'signal', kind: 'cross-cutting', position: null, label: { it: 'Segnale', en: 'Signal' }, short: { it: 'Segnale', en: 'Signal' } },
  { id: 'method', kind: 'classification', position: null, label: { it: 'Metodo', en: 'Method' }, short: { it: 'Metodo', en: 'Method' } },
  { id: 'platform', kind: 'classification', position: null, label: { it: 'Piattaforma', en: 'Platform' }, short: { it: 'Piattaforma', en: 'Platform' } },
];

export const THESIS_LAYER_IDS: readonly string[] = THESIS_LAYERS.map((layer) => layer.id);

/**
 * Layer ids used before 13/11/2026, mapped to the current ones. The single
 * 'customs' layer merged customs vulnerability and customs risk; entries saved
 * with it (per-user imports, old exports) are read as customs vulnerability.
 */
export const LEGACY_LAYER_IDS: Readonly<Record<string, string>> = {
  customs: 'customs-vulnerability',
};

/** Current id of a layer id, legacy ids included; unknown ids are returned unchanged. */
export function canonicalLayerId(id: string): string {
  return LEGACY_LAYER_IDS[id] ?? id;
}
