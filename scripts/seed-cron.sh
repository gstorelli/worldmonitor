#!/usr/bin/env bash
# Risk Sentinel — stability-first cron tiers for the self-hosted seed sweep.
#
# Cron stays dumb (cadence only); the sequencing lives here so it is versioned
# and reviewable:
#
#   ./scripts/seed-cron.sh quotes   # market quotes + commodities         (every 20')
#   ./scripts/seed-cron.sh intel    # insights -> forecasts -> correlation (hourly)
#   ./scripts/seed-cron.sh signals  # gdelt-intel, cross-source, chokepoints, FX (hourly)
#   ./scripts/seed-cron.sh slow     # sanctions + UCDP                    (every 6h)
#   ./scripts/seed-cron.sh thesis   # thesis triggers: USGS quakes, GDACS/EONET, climate (hourly)
#   ./scripts/seed-cron.sh context  # context panels: trade policy, shipping, PortWatch transits (every 6h)
#   ./scripts/seed-cron.sh full     # everything else                     (weekly)
#
# Rules that keep the box predictable:
#   * one seeder at a time — the cron entry holds one shared flock;
#   * a failing seeder never aborts the rest of the tier;
#   * every seeder is bounded by SEED_TIMEOUT_SECONDS;
#   * the exit code is non-zero when any seeder failed, so the cron log shows it.
#
# Run from the checkout root. seed-all.sh reads the checkout .env by itself.
set -uo pipefail

REPO_PATH="${REPO_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TIER="${1:-}"
FAILED=0

run() {
  local filter="$1" timeout="${2:-240}"
  printf '\n──── %s (timeout %ss) ────\n' "${filter:-sweep}" "$timeout"
  SEED_TIMEOUT_SECONDS="$timeout" "${REPO_PATH}/scripts/seed-all.sh" "$filter"
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '!!!! seeder "%s" failed (rc=%s) — continuing\n' "${filter:-sweep}" "$rc"
    FAILED=1
  fi
  return 0
}

case "$TIER" in
  quotes)
    run market-quotes 180
    run commodity 180
    ;;
  intel)
    # Ordered on purpose: forecasts and correlation both read a fresh news:insights.
    run insights 300
    run forecasts 300
    run correlation 240
    ;;
  signals)
    run gdelt-intel 240
    run cross-source 240
    run chokepoint 180
    run ecb-fx 180
    ;;
  slow)
    run sanctions 300
    run ucdp 240
    ;;
  thesis)
    # Trigger layer of the thesis view. TTLs: earthquakes 6h, natural events
    # 18h, climate anomalies 9h — the weekly sweep alone leaves them expired
    # for most of the week. (Chokepoint transits come from ais-relay.)
    run earthquakes 180
    run natural-events 240
    run climate-anomalies 300
    ;;
  context)
    # Context panels allowed in the thesis view (trade-policy, supply-chain).
    # seed-supply-chain-trade writes shipping indices, tariffs, barriers and
    # restrictions with an 8h TTL designed for a 6h cadence: left to the weekly
    # sweep, those panels were empty for most of the week.
    run supply-chain-trade 600
    # IMF PortWatch chokepoint transits (supply_chain:portwatch:v1, TTL 12h,
    # designed upstream for a 6h cadence). ais-relay derives the transit
    # summaries and chokepoint flows from this key every 10 minutes, and the
    # chokepoint status endpoint returns nothing without them: left to the
    # weekly sweep, the Supply Chain "Chokepoints" tab was empty 6.5 days in 7.
    # The exact file name keeps the filter from pulling in the heavy
    # port-activity seeder.
    run seed-portwatch.mjs 360
    ;;
  full)
    # Everything without a tier of its own: the weekly catch-all.
    # The second line lists the seeders of the scope groups switched off on
    # 14/10/2026 (src/config/scope.ts): finance, tech/startup, consumer
    # indices, live media, military. They never run on this box.
    OUT_OF_SCOPE_SEEDERS="aaii-sentiment,crypto-quotes,crypto-sectors,etf-flows,stablecoin-markets,token-panels,prediction-markets,fear-greed,seed-cot.mjs,earnings-calendar,hyperliquid-flow,market-breadth,sec-8k-stream,sec-cik-map,china-stock-connect,china-corporate-disclosures,gold-etf-flows,gulf-quotes,bundle-market-backup,seed-research.mjs,bigmac,grocery-basket,consumer-prices,webcams,military-bases,military-cii,military-flights,military-maritime-news,iran-events,defense-patents,thermal-escalation,cross-strait-activity"
    export SEED_SKIP="market-quotes,commodity,insights,forecasts,correlation,gdelt-intel,cross-source,chokepoint,ecb-fx,acled,sanctions,ucdp,earthquakes,natural-events,climate-anomalies,supply-chain-trade,seed-portwatch.mjs,${OUT_OF_SCOPE_SEEDERS}"
    run "" 240
    ;;
  *)
    echo "usage: seed-cron.sh {quotes|intel|signals|slow|thesis|context|full}" >&2
    exit 2
    ;;
esac

if [ "$FAILED" -ne 0 ]; then
  printf '\nseed-cron: %s tier finished with failures\n' "$TIER"
  exit 1
fi
printf '\nseed-cron: %s tier OK\n' "$TIER"
