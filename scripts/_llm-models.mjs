// Risk Sentinel fork (13/10/2026): the ONE place where LLM model ids, the
// OpenRouter base URL and the inherited-market switch are decided. Option B of
// the model review in the thesis repository
// (docs/note-di-lavoro/2026-10-13-modelli-llm.md):
//
//   fast tier    — classification, extraction, short summaries:
//                  anthropic/claude-haiku-5.5
//   quality tier — narrative synthesis, digests, briefs, second judge:
//                  mistralai/mistral-large-4-0
//
// Both are text-only uses with structured (JSON) output; neither tier needs
// multimodal input. Override per deployment with LLM_FAST_MODEL /
// LLM_QUALITY_MODEL. OPENROUTER_BASE_URL switches to OpenRouter's EU in-region
// endpoint (https://eu.openrouter.ai/api/v1, Business/Enterprise plans) for a
// deployment that must keep inference in the EU (the future ADM instance).
//
// Lives in scripts/ (like _llm-model-timeouts.mjs) so seeders can import it and
// server code can too. The two CommonJS consumers (scripts/lib/llm-chain.cjs,
// scripts/ais-relay.cjs) cannot import ESM synchronously and keep a copy of the
// defaults; tests/llm-models-parity.test.mjs keeps the copies in step.

export const DEFAULT_LLM_FAST_MODEL = 'anthropic/claude-haiku-5.5';
export const DEFAULT_LLM_QUALITY_MODEL = 'mistralai/mistral-large-4-0';
export const DEFAULT_OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

// Shown on the OpenRouter activity dashboard (upstream sent World Monitor's).
export const OPENROUTER_ATTRIBUTION_HEADERS = Object.freeze({
  'HTTP-Referer': 'https://risksentinel.opencyber.org',
  'X-Title': 'Risk Sentinel',
});

function readEnv(name) {
  const value = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function getLlmFastModel() {
  return readEnv('LLM_FAST_MODEL') || DEFAULT_LLM_FAST_MODEL;
}

export function getLlmQualityModel() {
  return readEnv('LLM_QUALITY_MODEL') || DEFAULT_LLM_QUALITY_MODEL;
}

/** OpenRouter API base without a trailing slash; only https bases are accepted. */
export function getOpenRouterApiBase() {
  const raw = readEnv('OPENROUTER_BASE_URL');
  if (!raw) return DEFAULT_OPENROUTER_API_BASE;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return DEFAULT_OPENROUTER_API_BASE;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_OPENROUTER_API_BASE;
  }
}

export function getOpenRouterChatUrl() {
  return `${getOpenRouterApiBase()}/chat/completions`;
}

/**
 * Inherited WorldMonitor market features that do not serve the thesis (stock
 * analysis overlay, market-implications cards, daily market brief summary).
 * Off unless LLM_INHERITED_MARKET_FEATURES=true; every caller keeps its
 * rules-based fallback, so the panels still render without an LLM.
 */
export function isInheritedMarketLlmEnabled() {
  return readEnv('LLM_INHERITED_MARKET_FEATURES') === 'true';
}
