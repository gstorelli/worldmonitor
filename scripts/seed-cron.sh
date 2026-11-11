#!/usr/bin/env bash
# Risk Sentinel — stability-first cron tiers for the self-hosted seed sweep.
#
# Cron stays dumb (cadence only); the sequencing lives here so it is versioned
# and reviewable:
#
#   ./scripts/seed-cron.sh quotes   # quotes, commodities, energy prices, cross-source (every 20')
#   ./scripts/seed-cron.sh intel    # insights -> forecasts -> correlation (hourly)
#   ./scripts/seed-cron.sh signals  # gdelt-intel, PortWatch disruptions, chokepoints, FX (hourly)
#   ./scripts/seed-cron.sh slow     # sanctions + UCDP + EU acts          (every 6h)
#   ./scripts/seed-cron.sh thesis   # thesis triggers: EMSC/USGS quakes, GDACS/EONET, climate (hourly)
#   ./scripts/seed-cron.sh context  # context panels: trade policy, shipping, PortWatch transits (every 6h)
#   ./scripts/seed-cron.sh full     # everything else                     (weekly)
#   ./scripts/seed-cron.sh changed seed-x.mjs ...  # seeders changed by a deploy (deploy.yml)
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

# Seeders of the scope groups switched off (src/config/scope.ts): finance,
# tech/startup, consumer indices, live media, military (14/10/2026); macro and
# upstreamExtra (15/10/2026). They never run on this box (full sweep and
# post-deploy runs).
OUT_OF_SCOPE_SEEDERS="aaii-sentiment,crypto-quotes,crypto-sectors,etf-flows,stablecoin-markets,token-panels,prediction-markets,fear-greed,seed-cot.mjs,earnings-calendar,hyperliquid-flow,market-breadth,sec-8k-stream,sec-cik-map,china-stock-connect,china-corporate-disclosures,gold-etf-flows,gulf-quotes,bundle-market-backup,seed-research.mjs,bigmac,grocery-basket,consumer-prices,webcams,military-bases,military-cii,military-flights,military-maritime-news,iran-events,defense-patents,thermal-escalation,cross-strait-activity,seed-bis-data.mjs,seed-bis-extended.mjs,seed-bundle-macro.mjs,seed-bls-series.mjs,seed-cbr-rates.mjs,seed-china-policy-events.mjs,seed-economic-calendar.mjs,seed-fsi-eu.mjs,seed-yield-curve-eu.mjs,seed-bundle-ecb-eu.mjs,seed-ecb-short-rates.mjs,seed-eurostat-country-data.mjs,seed-fred-rates.mjs,seed-fx-yoy.mjs,seed-china-coverage-health.mjs,seed-china-decision-signals.mjs,seed-china-release-calendar.mjs,seed-health-air-quality.mjs,seed-co2-monitoring.mjs,seed-climate-ocean-ice.mjs,seed-cyber-threats.mjs,seed-internet-outages.mjs,seed-digest-notifications.mjs,seed-disease-outbreaks.mjs,seed-bundle-health.mjs,seed-vpd-tracker.mjs,seed-electricity-prices.mjs,seed-fatf-listing.mjs,seed-aviation.mjs,seed-global-tenders.mjs,seed-conflict-intel.mjs,seed-recall-benchmark.mjs,seed-radiation-watch.mjs,seed-recovery-import-hhi.mjs,seed-recovery-reexport-share.mjs,seed-bundle-resilience-recovery.mjs,seed-resilience-scores.mjs,seed-regional-snapshots.mjs,seed-regulatory-actions.mjs,seed-security-advisories.mjs,seed-service-statuses.mjs,seed-unrest-events.mjs,seed-energy-intelligence.mjs,seed-displacement-summary.mjs,seed-bundle-resilience.mjs,seed-bundle-resilience-validation.mjs,seed-bundle-static-ref.mjs,seed-infra.mjs,seed-usa-spending.mjs,seed-fx-rates.mjs"

# True when the seeder name matches an out-of-scope entry (same substring rule
# as SEED_SKIP in seed-all.sh).
out_of_scope() {
  local name="$1" entry
  IFS=',' read -ra entries <<< "$OUT_OF_SCOPE_SEEDERS"
  for entry in "${entries[@]}"; do
    [ -n "$entry" ] && [[ "$name" == *"$entry"* ]] && return 0
  done
  return 1
}

case "$TIER" in
  changed)
    # Post-deploy (deploy.yml, 11/11/2026): re-run the seeders whose file the
    # deploy changed, so a fix reaches Redis without waiting for its tier.
    # Bundles are skipped (they launch whole groups), as are out-of-scope and
    # deleted seeders.
    shift
    for name in "$@"; do
      case "$name" in
        seed-bundle-*) echo "skip ${name}: bundle"; continue ;;
        seed-*.mjs) ;;
        *) echo "skip ${name}: not a seeder"; continue ;;
      esac
      if [ ! -f "${REPO_PATH}/scripts/${name}" ]; then echo "skip ${name}: deleted"; continue; fi
      if out_of_scope "$name"; then echo "skip ${name}: out of scope"; continue; fi
      run "$name" 300
    done
    ;;
  quotes)
    run market-quotes 180
    run commodity 180
    # Short-TTL keys (10/11/2026): energy prices live 1h and cross-source
    # signals 30 min, designed upstream for 15-30 min cadences. Hourly or 6-hourly
    # runs left them expired most of the time (health EMPTY). Both take seconds.
    run seed-economy.mjs 240
    run cross-source 240
    ;;
  intel)
    # Ordered on purpose: forecasts and correlation both read a fresh news:insights.
    run insights 300
    run forecasts 300
    run correlation 240
    ;;
  signals)
    run gdelt-intel 240
    # PortWatch disruptions: key TTL 2h, health budget 150 min (10/11/2026).
    run seed-portwatch-disruptions.mjs 240
    run chokepoint 180
    run ecb-fx 180
    ;;
  slow)
    # Exact file name: the 'sanctions' substring would also match seed-eu-sanctions.
    run seed-sanctions-pressure.mjs 300
    run ucdp 240
    # Recent EU acts for the Policy workspace (Publications Office SPARQL).
    run seed-policy-eu-acts.mjs 180
    # EU consolidated sanctions list, aggregated (Sanctions pressure panel).
    run seed-eu-sanctions.mjs 300
    ;;
  thesis)
    # Trigger layer of the thesis view. TTLs: earthquakes 6h, natural events
    # 18h, climate anomalies 9h — the weekly sweep alone leaves them expired
    # for most of the week. (Chokepoint transits come from ais-relay.)
    run earthquakes 180
    # EMSC triggers (USGS fallback) served by /api/thesis/triggers from Redis.
    run thesis-triggers 180
    run natural-events 240
    run climate-anomalies 300
    # FIRMS fires around the nodes (11/11/2026): the key lives 2 h by upstream
    # design (a dead feed must turn the health check red), so the seeder runs
    # hourly here instead of every 6 h; ~2.5 min, 20 FIRMS calls.
    run seed-fire-detections.mjs 300
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
    # EU/Italy imports (Eurostat Comext) and EU duties (WTO) for the 8 thesis
    # goods: Trade Policy panel and OSINT (thesis issue #91).
    run seed-eu-trade.mjs 300
    # Climate disasters of the thesis map (10/11/2026; fires moved to the
    # hourly thesis tier on 11/11). Left to the weekly sweep they were stale
    # six days in seven.
    run seed-climate-disasters.mjs 120
    # Once a day, in the 06:05 run (server time): Comtrade flows and PortWatch
    # port activity keep their keys 3 days but ran only in the weekly sweep, so
    # they were empty four days in seven (11/11/2026). ~5 and ~3 min.
    if [ "$(date +%H)" = "06" ]; then
      run seed-trade-flows.mjs 600
      run seed-portwatch-port-activity.mjs 600
    fi
    # Energy and gas (15/10/2026): crude and gas/LNG are thesis goods (2709,
    # 2711) and Hormuz/Suez are thesis nodes; seeded weekly they were empty
    # most of the week. Exact file names (no substring matches).
    run seed-gie-gas-storage.mjs 240
    run seed-gas-storage-countries.mjs 240
    run seed-jodi-oil.mjs 240
    run seed-jodi-gas.mjs 240
    run seed-eia-petroleum.mjs 240
    run seed-energy-spine.mjs 240
    run seed-ember-electricity.mjs 240
    run seed-fuel-shortages.mjs 240
    run seed-hormuz.mjs 240
    ;;
  full)
    # Climate zone normals (1991-2020, Open-Meteo) first and on their own: one
    # zone at a time to stay under Open-Meteo's rate limit, which takes far
    # longer than the 240 s of the sweep. Without them the hourly climate
    # anomalies (thesis tier) fail. Key TTL 95 days, so one good weekly run
    # in a month is enough.
    run seed-climate-zone-normals.mjs 3000
    # Everything without a tier of its own: the weekly catch-all, without the
    # OUT_OF_SCOPE_SEEDERS (defined above).
    export SEED_SKIP="seed-climate-zone-normals.mjs,seed-trade-flows.mjs,seed-portwatch-port-activity.mjs,seed-bundle-portwatch-port-activity.mjs,seed-fire-detections.mjs,seed-climate-disasters.mjs,seed-gie-gas-storage.mjs,seed-gas-storage-countries.mjs,seed-jodi-oil.mjs,seed-jodi-gas.mjs,seed-eia-petroleum.mjs,seed-economy.mjs,seed-energy-spine.mjs,seed-ember-electricity.mjs,seed-fuel-shortages.mjs,seed-hormuz.mjs,seed-portwatch-disruptions.mjs,seed-bundle-energy-sources.mjs,seed-eu-sanctions.mjs,seed-policy-eu-acts.mjs,seed-eu-trade.mjs,market-quotes,commodity,insights,forecasts,correlation,gdelt-intel,cross-source,chokepoint,ecb-fx,acled,sanctions,ucdp,earthquakes,thesis-triggers,natural-events,climate-anomalies,supply-chain-trade,seed-portwatch.mjs,${OUT_OF_SCOPE_SEEDERS}"
    run "" 240
    ;;
  *)
    echo "usage: seed-cron.sh {quotes|intel|signals|slow|thesis|context|full|changed <seeder.mjs>...}" >&2
    exit 2
    ;;
esac

if [ "$FAILED" -ne 0 ]; then
  printf '\nseed-cron: %s tier finished with failures\n' "$TIER"
  exit 1
fi
printf '\nseed-cron: %s tier OK\n' "$TIER"
