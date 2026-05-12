const fs = require('fs');

const obsoleteFiles = [
  'tests/entitlement-transition.test.mts',
  'tests/checkout.test.mts',
  'tests/checkout-webhook.test.mts',
  'tests/market-breadth-proto.test.mts',
  'tests/mdx-lint.test.mjs',
  'tests/premium-panels.test.mts',
  'tests/products-catalog.test.mts',
  'tests/tiers.test.mts',
  'tests/fallback-prices.test.mts',
  'tests/quiet-hours-rollout-flags.test.mjs',
  'tests/refund-alert-classifier.test.mts',
  'tests/stock-analysis-history.test.mts',
  'tests/stock-analysis.test.mts',
  'tests/stock-backtest.test.mts',
  'tests/stock-dividend-profile.test.mts',
  'tests/stock-news-search.test.mts',
  'tests/user-prefs-sentry-context.test.mts',
  'tests/webmcp.test.mjs'
];

for (const f of obsoleteFiles) {
  if (fs.existsSync(f)) {
    fs.rmSync(f);
    console.log('Removed', f);
  }
}
