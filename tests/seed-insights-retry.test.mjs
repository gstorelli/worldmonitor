import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRetryableSynthesisFailure,
  shouldPreserveLkg,
  synthesisRetryNote,
} from '../scripts/seed-insights.mjs';
import { INSIGHTS_SYNTHESIS_FAILURE_CODES as C } from '../scripts/_insights-synthesis-diagnostics.mjs';

test('editorial-gate rejections get one retry; provider and missing-cluster failures do not', () => {
  for (const code of [C.LEAD_PROPER_NOUN, C.LEAD_NUMERIC_FACT, C.LEAD_GROUNDING, C.LEAD_UNCITED, C.LEAD_EMPTY, C.GATE, C.PARSE]) {
    assert.equal(isRetryableSynthesisFailure(code), true, code);
  }
  for (const code of [C.PROVIDER, C.MISSING_CLUSTER, C.COMPOSER_ERROR, null, undefined]) {
    assert.equal(isRetryableSynthesisFailure(code), false, String(code));
  }
});

test('the retry note names the rule that failed', () => {
  assert.match(synthesisRetryNote(C.LEAD_PROPER_NOUN), /person, place or organisation/);
  assert.match(synthesisRetryNote(C.LEAD_NUMERIC_FACT), /number/);
  assert.match(synthesisRetryNote(C.PARSE), /format/);
});

test('a degraded run with a single-headline brief is published instead of keeping the old payload', () => {
  assert.equal(shouldPreserveLkg({ status: 'degraded', existingStatus: 'ok', worldBrief: 'One headline.' }), false);
});

test('the previous good payload is kept only when the degraded run has no brief at all', () => {
  assert.equal(shouldPreserveLkg({ status: 'degraded', existingStatus: 'ok', worldBrief: '' }), true);
  assert.equal(shouldPreserveLkg({ status: 'degraded', existingStatus: 'ok', worldBrief: '   ' }), true);
  assert.equal(shouldPreserveLkg({ status: 'degraded', existingStatus: 'degraded', worldBrief: '' }), false);
  assert.equal(shouldPreserveLkg({ status: 'ok', existingStatus: 'ok', worldBrief: '' }), false);
});
