/**
 * Single source of the Year-2 protocol parameters (proposal v0.1, NOT frozen).
 *
 * Shared by the platform (trigger rules, risk chain, panels) and by the
 * retrospective replay (src/services/thesis/engine.ts). The human-readable and
 * replay file is research/replay/protocol.yaml (rationale: risk-sentinel-thesis
 * docs/protocollo-anno2.md); tests/thesis-protocol-parity.test.mts keeps the two
 * in step.
 *
 * This module imports nothing from the thesis model or the engine, so both can
 * depend on it without circular imports.
 */

/** Mirror of research/replay/protocol.yaml (primary values). */
export interface EngineParams {
  radiusKm: number;
  intensityThreshold: { default: number; chips: number };
  intensityToUnit: { zeroAt: number; oneAt: number };
  gdacsToUnit: { green: number; orange: number; red: number };
  earthquakeLatencyHours: number;
  /**
   * Days a seismic trigger stays active after its latest member at the node
   * (not the Gardner-Knopoff time window, which only groups events: for Mw 7.4
   * it is 946 days and would keep an alert open for years).
   */
  activeDays: number;
  /** Foreshock window as a fraction of the aftershock time window (1 = symmetric, as in Chapter 3). */
  foreshockFraction: number;
}

export const PROTOCOL_V0_1: EngineParams = {
  radiusKm: 300,
  intensityThreshold: { default: 6, chips: 5 },
  intensityToUnit: { zeroAt: 4, oneAt: 8 },
  gdacsToUnit: { green: 0, orange: 0.5, red: 1 },
  earthquakeLatencyHours: 1,
  activeDays: 7,
  foreshockFraction: 1,
};

/** HS heading whose production nodes (chip fabs) get the lower threshold (Hualien 2024). */
const CHIPS_HS = '8542';

/**
 * Intensity threshold of a node (Modified Mercalli, expected at the node): the
 * `chips` value for semiconductor fabs (HS 8542), the `default` value otherwise.
 * The only implementation of the rule.
 */
export function nodeThreshold(
  node: { goods?: readonly string[] },
  params: { readonly intensityThreshold: { readonly default: number; readonly chips: number } } = PROTOCOL_V0_1,
): number {
  return node.goods?.includes(CHIPS_HS) ? params.intensityThreshold.chips : params.intensityThreshold.default;
}
