// Behavioural checks on the provisional v0 scoring node of n8n workflow 01.
//
// The node is executed as-is (its jsCode string), with a stubbed `$input`, so
// the assertions describe what production actually computes on GDELT titles.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = JSON.parse(
  readFileSync(join(repoRoot, 'n8n-workflows', '01-gdelt-customs-ingestion.json'), 'utf8'),
);
const node = workflow.nodes.find((n) => n.name === 'Risk Scoring Engine (8 Dimensions)');
assert.ok(node?.parameters?.jsCode, 'workflow 01 must carry the scoring code node');

// eslint-disable-next-line no-new-func -- executing the committed n8n code node under test
const runNode = new Function('$input', node.parameters.jsCode);

function score(title, domain = 'example.org') {
  const out = runNode({ item: { json: { articles: [{ title, domain, url: `https://${domain}/a` }] } } });
  return out.json.scoredArticles[0];
}

describe('n8n 01 route keywords (v0)', () => {
  it('scores Bab el-Mandeb as its own chokepoint, not as Suez', () => {
    assert.equal(score('Shipping attacked near Bab el-Mandeb').matchedRoute, 'Bab el-Mandeb Strait');
    assert.equal(score('Houthi threat at Bab al-Mandab').matchedRoute, 'Bab el-Mandeb Strait');
  });

  it('keeps Suez and the Red Sea mapped to the Suez Canal', () => {
    assert.equal(score('Suez Canal transits fall').matchedRoute, 'Suez Canal');
    assert.equal(score('Red Sea shipping disruption').matchedRoute, 'Suez Canal');
  });

  it('does not treat any mention of Taiwan as the Taiwan Strait', () => {
    assert.equal(score('Taiwan election results announced').matchedRoute, null);
    assert.equal(score('Tensions rise in the Taiwan Strait').matchedRoute, 'Taiwan Strait');
  });
});

describe('n8n 01 v0 known limits (documented, not desired)', () => {
  it('gives a positive score to a title with no hazard at all (additive floor)', () => {
    // The thesis model requires zero risk without a trigger; the additive v0
    // cannot satisfy it. Year 2 adds hazard-gated (F1) and multiplicative (F2)
    // formulations in parallel. If this assertion ever fails, update the
    // thesis documentation (docs/thesis/ARCHITECTURE-THESIS.md, section 2).
    const plain = score('Quarterly report on retail trends');
    assert.equal(plain.dimensions.geophysicalImpact, 5);
    assert.ok(plain.riskScore > 0, `expected a positive v0 score, got ${plain.riskScore}`);
  });
});
