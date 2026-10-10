/**
 * Pure logic of the response outlook (PoC): which administrative responses a
 * node chain would suggest, and in which direction a change of modulator moves
 * the incentive to misdeclare. No DOM, no fetch, no weights, no magnitudes.
 *
 * Two rules of the model are enforced here:
 *  - no significant trigger on a node with exposed goods → no suggested response;
 *  - a modulator change alone creates no induced risk: it only changes the
 *    structural incentive, which matters when a trigger creates scarcity.
 */
import { TRIGGER_WORKING_RULES, type ThesisNode } from '@/config/thesis-model';
import {
  CHANNELS,
  GOOD_CHANNELS,
  RESPONSE_ACTIONS,
  type MeasureChange,
  type MeasureKind,
  type MisdeclarationChannel,
  type ResponseAction,
} from '@/config/thesis-response';
import { buildNodeChain, type NodeChain, type TriggerEvent } from './risk-chain';

export type Direction = 'up' | 'down' | 'same';
export type IncentiveEffect = Record<MisdeclarationChannel, Direction>;

const SAME: IncentiveEffect = { origin: 'same', value: 'same', classification: 'same' };

/**
 * Direction of the change in the incentive to misdeclare, per channel, when a
 * measure changes. The reasoning is the treatment-differential argument of the
 * customs-vulnerability layer:
 *  - an origin-specific measure (anti-dumping, sanction) creates a differential
 *    between origins → incentive to declare another origin;
 *  - a duty applied to all origins does not change the origin differential, but
 *    a higher duty raises the pay-off of undervaluing and of shifting to a
 *    lower-duty heading;
 *  - a producer-country export restriction moves trade between products and
 *    codes (ore, intermediates) → classification.
 */
export function incentiveEffect(kind: MeasureKind, change: MeasureChange): IncentiveEffect {
  const up = change === 'introduce' || change === 'raise';
  const dir: Direction = up ? 'up' : 'down';
  switch (kind) {
    case 'origin-specific':
      return { ...SAME, origin: dir };
    case 'erga-omnes-duty':
      return { ...SAME, value: dir, classification: dir };
    case 'export-restriction':
      return { ...SAME, classification: dir };
    default:
      return { ...SAME };
  }
}

export function channelsForGood(hs: string): MisdeclarationChannel[] {
  return GOOD_CHANNELS.find((g) => g.hs === hs)?.channels ?? [];
}

export interface GoodResponse {
  hs: string;
  /** Empty when the measures of the good are not listed yet. */
  channels: MisdeclarationChannel[];
  actions: ResponseAction[];
}

export interface ChainResponse {
  chain: NodeChain;
  /** Why no response is suggested (`no-trigger`, `minor-trigger`, `no-goods`). */
  blockedBy: string | null;
  goods: GoodResponse[];
}

/**
 * Suggested responses for one node chain. Capacity is always relevant once a
 * significant trigger hits a node with goods (diverted flows); the
 * channel-specific actions only for the channels documented for the good.
 */
export function responsesForChain(chain: NodeChain): ChainResponse {
  if (chain.state === 'none') return { chain, blockedBy: 'no-trigger', goods: [] };
  if (chain.state === 'monitor') return { chain, blockedBy: 'minor-trigger', goods: [] };
  if (!chain.node.goods.length) return { chain, blockedBy: 'no-goods', goods: [] };
  const goods = chain.node.goods.map((hs) => {
    const channels = channelsForGood(hs);
    const actions = RESPONSE_ACTIONS.filter((a) => a.channel === 'capacity' || channels.includes(a.channel));
    return { hs, channels, actions };
  });
  return { chain, blockedBy: null, goods };
}

/**
 * A clearly labelled hypothetical significant trigger at the node reference
 * point, for demonstrations and for the Year-2 replay of historical scenarios.
 */
export function hypotheticalTrigger(node: Pick<ThesisNode, 'id' | 'lat' | 'lon'>, time: number): TriggerEvent {
  return {
    id: `hypothetical-${node.id}`,
    kind: 'other',
    source: 'scenario',
    title: 'hypothetical',
    lat: node.lat,
    lon: node.lon,
    time,
    alertLevel: 'red',
  };
}

export function hypotheticalChain(node: ThesisNode, time: number): NodeChain {
  return buildNodeChain(node, [hypotheticalTrigger(node, time)], null, TRIGGER_WORKING_RULES);
}

export interface ScenarioOutcome {
  effect: IncentiveEffect;
  /** True when a significant trigger currently hits a node producing the good. */
  amplifiedByTrigger: boolean;
}

/**
 * Outcome of a modulator change for a good. With no active trigger the change
 * is structural only (the model's modulator rule); with one, the same change
 * acts on goods that are becoming scarce.
 */
export function scenarioOutcome(
  kind: MeasureKind,
  change: MeasureChange,
  hs: string,
  chains: readonly NodeChain[],
): ScenarioOutcome {
  const amplifiedByTrigger = chains.some(
    (c) => c.state === 'assess' && (hs === '*' ? c.node.goods.length > 0 : c.node.goods.includes(hs)),
  );
  return { effect: incentiveEffect(kind, change), amplifiedByTrigger };
}

export { CHANNELS };
