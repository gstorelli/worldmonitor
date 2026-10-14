// Forecasts only while someone looks at them (Giuseppe, 14/10/2026).
//
// seed-forecasts runs hourly in the `intel` tier and makes several LLM calls
// per run, yet the Forecast panel lives only in the Full dashboard. Opening the
// panel calls POST /api/forecast/viewed, which sets FORECAST_VIEWED_KEY for
// 24 hours; the seeder runs only while that key exists (or when an explicit
// refresh request is pending), so forecasts stay fresh for a day after the
// last view and cost nothing otherwise.

export const FORECAST_VIEWED_KEY = 'forecast:viewed:v1';
export const FORECAST_VIEWED_TTL_SECONDS = 24 * 60 * 60;

export function shouldRunForecasts({ viewed, refreshRequest, alwaysRun }) {
  if (alwaysRun) return { run: true, reason: 'FORECAST_ALWAYS_RUN=1' };
  if (refreshRequest) return { run: true, reason: 'refresh request pending' };
  if (viewed) return { run: true, reason: 'panel viewed in the last 24 hours' };
  return { run: false, reason: 'nobody opened the Forecast panel in the last 24 hours' };
}
