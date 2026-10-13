#!/usr/bin/env node
// Probe the two LLM tiers of scripts/_llm-models.mjs with the real key before
// relying on them (13/10/2026). For each tier: one short JSON classification
// (the fast-tier job) and one ~400-word narrative (the quality-tier job), N
// rounds each. Prints latency, tokens and whether the JSON parsed. No prompt or
// output text is stored; nothing is written to Redis.
//
//   docker run --rm --env-file .env -v "$PWD:/repo:ro" -w /repo node:24-alpine \
//     node scripts/llm-tier-probe.mjs 3
//
// Exit code 1 if a tier never answered.
import {
  getLlmFastModel,
  getLlmQualityModel,
  getOpenRouterChatUrl,
  OPENROUTER_ATTRIBUTION_HEADERS,
} from './_llm-models.mjs';
import { OPENROUTER_PROVIDER_ROUTING } from './_llm-model-timeouts.mjs';

const rounds = Math.max(1, Math.min(10, Number(process.argv[2]) || 3));
const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error('OPENROUTER_API_KEY is not set');
  process.exit(2);
}

const CLASSIFY = [
  { role: 'system', content: 'Classify the headline for EU customs risk. Answer ONLY with JSON: {"relevant": boolean, "node": string|null, "confidence": number}.' },
  { role: 'user', content: 'Magnitude 6.4 earthquake strikes near Hualien, Taiwan; chip fabs in Hsinchu briefly halt production.' },
];
const NARRATIVE = [
  { role: 'system', content: 'You write concise analytical briefs in English.' },
  { role: 'user', content: 'In about 400 words, explain how a week-long closure of the Bab el-Mandeb strait would affect EU imports of fertilisers and what a customs office should watch for. No headings.' },
];

async function call(model, messages, maxTokens, timeoutMs) {
  const t0 = Date.now();
  try {
    const resp = await fetch(getOpenRouterChatUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...OPENROUTER_ATTRIBUTION_HEADERS },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2, reasoning: { enabled: false }, provider: OPENROUTER_PROVIDER_ROUTING }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    if (!resp.ok) return { ok: false, ms, err: `HTTP ${resp.status}` };
    const body = await resp.json();
    const text = body?.choices?.[0]?.message?.content || '';
    return { ok: true, ms, model: body?.model || model, provider: body?.provider || '?', out: body?.usage?.completion_tokens ?? null, text };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, err: err?.name === 'TimeoutError' ? 'timeout' : err.message };
  }
}

function jsonOk(text) {
  const m = text.replace(/```(?:json)?/gi, '').match(/\{[\s\S]*\}/);
  if (!m) return false;
  try { const o = JSON.parse(m[0]); return typeof o.relevant === 'boolean'; } catch { return false; }
}

const tiers = [
  ['fast', getLlmFastModel()],
  ['quality', getLlmQualityModel()],
];
console.log(`endpoint ${getOpenRouterChatUrl()} | rounds ${rounds}`);
let failedTier = false;
for (const [tier, model] of tiers) {
  let answered = 0;
  for (const [job, messages, maxTokens, timeoutMs] of [['classify', CLASSIFY, 120, 30_000], ['narrative', NARRATIVE, 900, 90_000]]) {
    const runs = [];
    for (let i = 0; i < rounds; i++) runs.push(await call(model, messages, maxTokens, timeoutMs));
    const ok = runs.filter((r) => r.ok);
    answered += ok.length;
    const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
    const p50 = lat.length ? lat[Math.floor((lat.length - 1) / 2)] : null;
    const max = lat.length ? lat[lat.length - 1] : null;
    const extra = job === 'classify'
      ? `json ${ok.filter((r) => jsonOk(r.text)).length}/${ok.length}`
      : `words ${ok.map((r) => r.text.split(/\s+/).filter(Boolean).length).join(',')}`;
    const errs = runs.filter((r) => !r.ok).map((r) => r.err);
    console.log(`${tier.padEnd(7)} ${model.padEnd(32)} ${job.padEnd(9)} ok ${ok.length}/${runs.length} p50 ${p50 ?? '-'}ms max ${max ?? '-'}ms ${extra}`
      + ` providers ${[...new Set(ok.map((r) => r.provider))].join('/') || '-'}${errs.length ? ` errors ${errs.join('; ')}` : ''}`);
  }
  if (answered === 0) failedTier = true;
}
process.exit(failedTier ? 1 : 0);
