import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const CANONICAL_PATH = join(repoRoot, 'src', 'services', 'customs-risk-scoring.ts');
const SCORER_PATH = join(repoRoot, 'src', 'services', 'CustomsRiskScorer.ts');
const SIDECAR_TS_PATH = join(repoRoot, 'src-tauri', 'sidecar', 'services', 'scoring.ts');
// The desktop/local sidecar runs the committed compiled twin, not the TS source.
const SIDECAR_JS_PATH = join(repoRoot, 'src-tauri', 'sidecar', 'services', 'scoring.js');
const N8N_PATH = join(repoRoot, 'n8n-workflows', '01-gdelt-customs-ingestion.json');
const N8N_SCORING_NODE = 'Risk Scoring Engine (8 Dimensions)';

/** Pull `key: number` pairs from a `{ ... }` weights object literal. */
function parseWeightsObject(block) {
  const weights = {};
  for (const match of block.matchAll(/([A-Za-z][A-Za-z0-9]*):\s*([0-9]*\.?[0-9]+)/g)) {
    weights[match[1]] = Number(match[2]);
  }
  return weights;
}

function sliceObject(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `expected to find ${startMarker}`);
  const end = source.indexOf('}', start);
  assert.ok(end !== -1, `expected a closing brace after ${startMarker}`);
  return source.slice(start, end);
}

function canonicalWeights() {
  return parseWeightsObject(sliceObject(readFileSync(CANONICAL_PATH, 'utf8'), 'CUSTOMS_RISK_WEIGHTS'));
}

function n8nScoringCode() {
  const workflow = JSON.parse(readFileSync(N8N_PATH, 'utf8'));
  const node = workflow.nodes.find((n) => n.name === N8N_SCORING_NODE);
  assert.ok(node, `workflow 01 must contain the ${N8N_SCORING_NODE} node`);
  assert.ok(typeof node.parameters?.jsCode === 'string', 'risk scoring node must carry a jsCode string');
  return node.parameters.jsCode;
}

function n8nWeights() {
  return parseWeightsObject(sliceObject(n8nScoringCode(), 'const WEIGHTS'));
}

/** Ordered coefficient list from a `(0.18 * dimension) + ...` score expression. */
function weightSequence(source) {
  const block = source.slice(source.indexOf('const score ='));
  const expression = block.slice(0, block.indexOf(';'));
  const sequence = [];
  for (const match of expression.matchAll(/\((\d+\.\d+)\s*\*\s*[A-Za-z]+\)/g)) {
    sequence.push(Number(match[1]));
  }
  return sequence;
}

/** `{ threshold: level }` from a canonical `if (score >= N) return 'Level'` chain. */
function canonicalBands() {
  const source = readFileSync(CANONICAL_PATH, 'utf8');
  const bands = {};
  for (const match of source.matchAll(/if \(score >= (\d+)\) return '([A-Za-z]+)'/g)) {
    bands[Number(match[1])] = match[2];
  }
  return bands;
}

/** `{ threshold: level }` from a sidecar `if (score >= N)\n return 'Level'` chain. */
function sidecarBands(path) {
  const source = readFileSync(path, 'utf8');
  const bands = {};
  for (const match of source.matchAll(/if \(score >= (\d+)\)\s*return '([A-Za-z]+)'/g)) {
    bands[Number(match[1])] = match[2];
  }
  return bands;
}

/** `{ threshold: level }` from the n8n `if (riskScore >= N) level = 'Level'` chain. */
function n8nBands() {
  const bands = {};
  for (const match of n8nScoringCode().matchAll(/if \(riskScore >= (\d+)\) level = '([A-Za-z]+)'/g)) {
    bands[Number(match[1])] = match[2];
  }
  return bands;
}

describe('customs 8-dimension risk scoring parity', () => {
  it('keeps the canonical weights summing to 1.0 across exactly 8 dimensions', () => {
    const weights = canonicalWeights();
    const entries = Object.entries(weights);
    assert.equal(entries.length, 8, 'the PhD spec defines exactly 8 dimensions');
    const sum = entries.reduce((acc, [, value]) => acc + value, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `weights must sum to 1.0 (got ${sum})`);
  });

  it('matches the n8n workflow 01 weights to the canonical model', () => {
    assert.deepEqual(n8nWeights(), canonicalWeights());
  });

  it('matches both the sidecar TS source and its compiled runtime twin', () => {
    const canonicalOrder = Object.values(canonicalWeights());
    assert.deepEqual(weightSequence(readFileSync(SIDECAR_TS_PATH, 'utf8')), canonicalOrder);
    assert.deepEqual(weightSequence(readFileSync(SIDECAR_JS_PATH, 'utf8')), canonicalOrder);
  });

  it('locks the alert bands across canonical, sidecar and n8n', () => {
    const canonical = canonicalBands();
    assert.deepEqual(canonical, { 85: 'Critical', 70: 'High', 50: 'Elevated', 25: 'Moderate' });
    assert.deepEqual(sidecarBands(SIDECAR_TS_PATH), canonical);
    assert.deepEqual(sidecarBands(SIDECAR_JS_PATH), canonical);
    assert.deepEqual(n8nBands(), canonical);
  });

  it('computes the documented composite (behavior, not just literals)', async () => {
    const canonical = await import(pathToFileURL(CANONICAL_PATH).href);
    const zeros = Object.fromEntries(canonical.CUSTOMS_RISK_DIMENSIONS.map((d) => [d, 0]));
    const hundreds = Object.fromEntries(canonical.CUSTOMS_RISK_DIMENSIONS.map((d) => [d, 100]));

    assert.equal(canonical.computeWeightedRiskScore(zeros), 0);
    assert.equal(canonical.computeWeightedRiskScore(hundreds), 100);
    assert.equal(canonical.computeWeightedRiskScore({ ...zeros, eventSeverity: 100 }), 18);
    assert.equal(canonical.computeWeightedRiskScore({ ...zeros, geophysicalImpact: 100 }), 6);

    assert.equal(canonical.classifyCustomsRisk(84), 'High');
    assert.equal(canonical.classifyCustomsRisk(85), 'Critical');
    assert.equal(canonical.classifyCustomsRisk(69), 'Elevated');
    assert.equal(canonical.classifyCustomsRisk(70), 'High');
    assert.equal(canonical.classifyCustomsRisk(49), 'Moderate');
    assert.equal(canonical.classifyCustomsRisk(50), 'Elevated');
    assert.equal(canonical.classifyCustomsRisk(24), 'Low');
    assert.equal(canonical.classifyCustomsRisk(25), 'Moderate');
  });

  it('routes the typed scorer through the canonical weights (no fourth formula)', () => {
    const source = readFileSync(SCORER_PATH, 'utf8');
    assert.match(source, /from '\.\/customs-risk-scoring'/, 'scorer must import the canonical module');
    assert.match(source, /computeWeightedRiskScore/, 'scorer must use the canonical weighted composite');
  });
});
