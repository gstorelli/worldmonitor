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
    run acled 180
    ;;
  slow)
    run sanctions 300
    run ucdp 240
    ;;
  full)
    # Everything without a tier of its own: the weekly catch-all.
    export SEED_SKIP="market-quotes,commodity,insights,forecasts,correlation,gdelt-intel,cross-source,chokepoint,ecb-fx,sanctions,ucdp"
    run "" 240
    ;;
  *)
    echo "usage: seed-cron.sh {quotes|intel|signals|slow|full}" >&2
    exit 2
    ;;
esac

if [ "$FAILED" -ne 0 ]; then
  printf '\nseed-cron: %s tier finished with failures\n' "$TIER"
  exit 1
fi
printf '\nseed-cron: %s tier OK\n' "$TIER"
