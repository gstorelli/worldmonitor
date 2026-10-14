// Fork (13/10/2026): scripts/_llm-models.mjs is the single place where model ids
// and the OpenRouter base URL are chosen. Three consumers cannot import it
// (two CommonJS files and one self-contained Edge function) and keep a copy of
// the defaults; this test keeps the copies in step and guards the behaviour.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  DEFAULT_LLM_FAST_MODEL,
  DEFAULT_LLM_QUALITY_MODEL,
  DEFAULT_OPENROUTER_API_BASE,
  getLlmFastModel,
  getLlmQualityModel,
  getOpenRouterApiBase,
  getOpenRouterChatUrl,
  isInheritedMarketLlmEnabled,
} from '../scripts/_llm-models.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ENV = ['LLM_FAST_MODEL', 'LLM_QUALITY_MODEL', 'OPENROUTER_BASE_URL', 'LLM_INHERITED_MARKET_FEATURES'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('LLM model tiers (scripts/_llm-models.mjs)', () => {
  it('defaults to option B of the 13/10/2026 review and honours env overrides', () => {
    for (const k of ENV) delete process.env[k];
    assert.equal(DEFAULT_LLM_FAST_MODEL, 'anthropic/claude-haiku-5.5');
    assert.equal(DEFAULT_LLM_QUALITY_MODEL, 'mistralai/mistral-large-4-0');
    assert.equal(getLlmFastModel(), DEFAULT_LLM_FAST_MODEL);
    assert.equal(getLlmQualityModel(), DEFAULT_LLM_QUALITY_MODEL);
    process.env.LLM_FAST_MODEL = ' some/fast ';
    process.env.LLM_QUALITY_MODEL = 'some/quality';
    assert.equal(getLlmFastModel(), 'some/fast');
    assert.equal(getLlmQualityModel(), 'some/quality');
  });

  it('accepts only an https OpenRouter base and strips trailing slashes', () => {
    delete process.env.OPENROUTER_BASE_URL;
    assert.equal(getOpenRouterChatUrl(), `${DEFAULT_OPENROUTER_API_BASE}/chat/completions`);
    process.env.OPENROUTER_BASE_URL = 'https://eu.openrouter.ai/api/v1/';
    assert.equal(getOpenRouterApiBase(), 'https://eu.openrouter.ai/api/v1');
    assert.equal(getOpenRouterChatUrl(), 'https://eu.openrouter.ai/api/v1/chat/completions');
    process.env.OPENROUTER_BASE_URL = 'http://example.test/api/v1';
    assert.equal(getOpenRouterApiBase(), DEFAULT_OPENROUTER_API_BASE);
    process.env.OPENROUTER_BASE_URL = 'not a url';
    assert.equal(getOpenRouterApiBase(), DEFAULT_OPENROUTER_API_BASE);
  });

  it('keeps the inherited market LLM features off unless explicitly enabled', () => {
    delete process.env.LLM_INHERITED_MARKET_FEATURES;
    assert.equal(isInheritedMarketLlmEnabled(), false);
    process.env.LLM_INHERITED_MARKET_FEATURES = '1';
    assert.equal(isInheritedMarketLlmEnabled(), false, 'only the literal "true" enables them');
    process.env.LLM_INHERITED_MARKET_FEATURES = 'true';
    assert.equal(isInheritedMarketLlmEnabled(), true);
  });
});

describe('copies of the defaults stay in step', () => {
  it('scripts/lib/llm-chain.cjs (digest prose, quality tier)', () => {
    const src = read('scripts/lib/llm-chain.cjs');
    assert.match(src, new RegExp(`DEFAULT_LLM_QUALITY_MODEL = '${DEFAULT_LLM_QUALITY_MODEL}'`));
    assert.match(src, new RegExp(`DEFAULT_OPENROUTER_API_BASE = '${DEFAULT_OPENROUTER_API_BASE}'`));
  });

  it('scripts/ais-relay.cjs (headline classification, fast tier)', () => {
    const src = read('scripts/ais-relay.cjs');
    assert.match(src, new RegExp(`RELAY_DEFAULT_LLM_FAST_MODEL = '${DEFAULT_LLM_FAST_MODEL}'`));
    assert.match(src, new RegExp(`RELAY_DEFAULT_OPENROUTER_API_BASE = '${DEFAULT_OPENROUTER_API_BASE}'`));
  });

  it('api/customs/classify.js (Edge, fast tier)', () => {
    const src = read('api/customs/classify.js');
    assert.ok(src.includes(`process.env.LLM_FAST_MODEL || '${DEFAULT_LLM_FAST_MODEL}'`));
    assert.ok(src.includes(`process.env.OPENROUTER_BASE_URL || '${DEFAULT_OPENROUTER_API_BASE}'`));
  });

  it('the CommonJS chain resolves the quality model and the EU base at call time', () => {
    const require = createRequire(import.meta.url);
    const chainSrc = read('scripts/lib/llm-chain.cjs');
    assert.ok(chainSrc.includes("get model() { return (process.env.LLM_QUALITY_MODEL || '').trim() || DEFAULT_LLM_QUALITY_MODEL; }"));
    assert.ok(typeof require('../scripts/lib/llm-chain.cjs').callLLM === 'function');
  });
});

describe('no runtime file pins a model outside the tiers', () => {
  const RUNTIME = [
    'server/_shared/llm.ts',
    'api/internal/brief-why-matters.ts',
    'scripts/seed-insights.mjs',
    'scripts/seed-forecasts.mjs',
    'scripts/seed-forecast-resolutions.mjs',
    'scripts/regional-snapshot/narrative.mjs',
    'scripts/regional-snapshot/weekly-brief.mjs',
    'scripts/lib/llm-chain.cjs',
    'scripts/ais-relay.cjs',
    'api/customs/classify.js',
  ];
  it('Gemini 2.5 Flash is gone and no file hardcodes the OpenRouter chat URL', () => {
    for (const p of RUNTIME) {
      const src = read(p);
      assert.ok(!/'google\/gemini-2\.5-flash'/.test(src), `${p} still pins Gemini 2.5 Flash`);
      assert.ok(!src.includes("'https://openrouter.ai/api/v1/chat/completions'"), `${p} hardcodes the OpenRouter chat URL`);
      assert.ok(!src.includes("'deepseek/deepseek-v4-flash'"), `${p} pins DeepSeek V4 Flash instead of a tier`);
    }
  });
});
