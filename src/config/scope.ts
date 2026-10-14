/**
 * Risk Sentinel — scope switches.
 *
 * Decision of 14/10/2026 (Giuseppe; thesis repository issue #90): the
 * inherited WorldMonitor surfaces that have nothing to do with the thesis are
 * switched off for good, not just hidden. A group listed here is:
 *   1. never created as a panel (its panels are tier 3, see panel-tiers.ts);
 *   2. never fetched by the browser (the loaders check `isScopeOff`);
 *   3. absent from the map layer picker (OUT_OF_SCOPE_LAYERS);
 *   4. out of the seed cron and of /api/health (scripts/seed-cron.sh,
 *      api/health.js read the same groups by seeder/key name).
 *
 * Kept on purpose (14/10): country instability (CII, Strategic Risk,
 * Strategic Posture) "for now"; macro (FRED/BIS/IMF) only loads when the
 * Macro Stress panel is enabled; Trade Policy stays and its EU/Italy port is
 * thesis issue #91.
 *
 * The upstream code stays in place so future syncs remain non-disruptive.
 * Rebuilding any of these internally, if ever needed, is part of the
 * independence-from-upstream work, not a reason to switch a group back on.
 */

export type ScopeGroup = 'finance' | 'techStartup' | 'consumerIndices' | 'liveMedia' | 'military';

export const OUT_OF_SCOPE: Record<ScopeGroup, boolean> = {
  /** Crypto, stablecoins, tokens, prediction markets, stock markets and analysis. */
  finance: true,
  /** Upstream tech/startup news and trackers. */
  techStartup: true,
  /** Consumer-price indices and the "good news" variant. */
  consumerIndices: true,
  /** Webcams and live news channels. */
  liveMedia: true,
  /** Military flights/vessels/bases, USNI fleet, sirens, strikes, GPS jamming, Telegram OSINT. */
  military: true,
};

export function isScopeOff(group: ScopeGroup): boolean {
  return OUT_OF_SCOPE[group] === true;
}

/** Panels of each switched-off group (merged into tier 3 by panel-tiers.ts). */
export const OUT_OF_SCOPE_PANELS: Record<ScopeGroup, readonly string[]> = {
  finance: [
    'crypto', 'crypto-heatmap', 'defi-tokens', 'ai-tokens', 'other-tokens', 'stablecoins',
    'etf-flows', 'polymarket', 'stock-analysis', 'stock-backtest', 'wsb-ticker-scanner',
    'markets', 'heatmap', 'daily-market-brief', 'market-implications', 'markets-news',
    'fear-greed', 'macro-signals', 'earnings-calendar', 'cot-positioning', 'ipo', 'funding',
    'finance', 'regulation', 'gcc-investments',
  ],
  techStartup: [
    'tech', 'ai', 'startups', 'vcblogs', 'regionalStartups', 'unicorns', 'accelerators',
    'github', 'producthunt', 'events', 'layoffs', 'tech-hubs', 'cloud', 'dev', 'security',
    'policy', 'ai-regulation', 'tech-readiness',
  ],
  consumerIndices: [
    'bigmac', 'grocery-basket', 'consumer-prices', 'positive-feed', 'progress', 'counters',
    'spotlight', 'breakthroughs', 'digest', 'species', 'renewable', 'giving',
  ],
  liveMedia: ['live-news', 'live-webcams', 'windy-webcams'],
  military: [
    'military-correlation', 'oref-sirens', 'telegram-intel', 'thermal-escalation',
    'defense-patents',
  ],
};

/** Map layers of each switched-off group (removed from the picker and forced off). */
export const OUT_OF_SCOPE_LAYER_KEYS: Record<ScopeGroup, readonly string[]> = {
  finance: [],
  techStartup: [],
  consumerIndices: [],
  liveMedia: ['webcams'],
  military: ['military', 'bases', 'iranAttacks', 'gpsJamming'],
};

function collect(map: Record<ScopeGroup, readonly string[]>): Set<string> {
  const out = new Set<string>();
  for (const group of Object.keys(map) as ScopeGroup[]) {
    if (isScopeOff(group)) for (const id of map[group]) out.add(id);
  }
  return out;
}

export const OUT_OF_SCOPE_PANEL_IDS: ReadonlySet<string> = collect(OUT_OF_SCOPE_PANELS);
export const OUT_OF_SCOPE_LAYERS: ReadonlySet<string> = collect(OUT_OF_SCOPE_LAYER_KEYS);
