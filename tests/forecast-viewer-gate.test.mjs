import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FORECAST_VIEWED_KEY, FORECAST_VIEWED_TTL_SECONDS, shouldRunForecasts } from '../scripts/_forecast-viewer-gate.mjs';
import { readFileSync } from 'node:fs';

describe('forecast viewer gate', () => {
  it('skips the LLM run when nobody viewed the panel', () => {
    assert.equal(shouldRunForecasts({ viewed: null, refreshRequest: null, alwaysRun: false }).run, false);
  });
  it('runs after a view, on a refresh request, or when forced', () => {
    assert.equal(shouldRunForecasts({ viewed: { at: 'x' }, refreshRequest: null, alwaysRun: false }).run, true);
    assert.equal(shouldRunForecasts({ viewed: null, refreshRequest: { requestedAt: 1 }, alwaysRun: false }).run, true);
    assert.equal(shouldRunForecasts({ viewed: null, refreshRequest: null, alwaysRun: true }).run, true);
  });
  it('the endpoint writes the same key with the same 24-hour TTL', () => {
    const src = readFileSync(new URL('../api/forecast/viewed.js', import.meta.url), 'utf8');
    assert.match(src, new RegExp(`'${FORECAST_VIEWED_KEY}'`));
    assert.equal(FORECAST_VIEWED_TTL_SECONDS, 86400);
    assert.match(src, /24 \* 60 \* 60/);
  });
});
