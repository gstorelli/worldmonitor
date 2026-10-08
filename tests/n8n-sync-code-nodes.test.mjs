import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { patchCodeNodes, selectFiles, updateBody } from '../scripts/n8n-sync-code-nodes.mjs';

const live = {
  id: 'w1',
  name: 'WF',
  active: true,
  settings: { executionOrder: 'v1', timezone: 'Europe/Rome', unknownKey: 1 },
  connections: { A: {} },
  nodes: [
    { name: 'Code A', type: 'n8n-nodes-base.code', parameters: { jsCode: 'old' } },
    { name: 'HTTP', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'x' }, credentials: { h: { id: 'live-cred' } } },
    { name: 'Code B', type: 'n8n-nodes-base.code', parameters: { jsCode: 'same' } },
  ],
};

describe('n8n code-node sync', () => {
  it('patches only Code nodes whose source changed, never credentials', () => {
    const committed = {
      nodes: [
        { name: 'Code A', type: 'n8n-nodes-base.code', parameters: { jsCode: 'new' } },
        { name: 'Code B', type: 'n8n-nodes-base.code', parameters: { jsCode: 'same' } },
        { name: 'HTTP', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'changed' }, credentials: { h: { id: 'placeholder' } } },
        { name: 'Code C', type: 'n8n-nodes-base.code', parameters: { jsCode: 'c' } },
      ],
    };
    const { nodes, changed, missing } = patchCodeNodes(live, committed);
    assert.deepEqual(changed, ['Code A']);
    assert.deepEqual(missing, ['Code C']);
    assert.equal(nodes[0].parameters.jsCode, 'new');
    assert.equal(nodes[1].parameters.url, 'x');
    assert.equal(nodes[1].credentials.h.id, 'live-cred');
  });

  it('builds an update body with only API-accepted settings', () => {
    const body = updateBody(live, live.nodes);
    assert.deepEqual(Object.keys(body).sort(), ['connections', 'name', 'nodes', 'settings']);
    assert.deepEqual(body.settings, { executionOrder: 'v1', timezone: 'Europe/Rome' });
  });

  it('skips legacy workflows and honours an explicit file list', () => {
    const all = ['01-a.json', '08-x-legacy.json', 'README.md', '02-b.json'];
    assert.deepEqual(selectFiles(all), ['01-a.json', '02-b.json']);
    assert.deepEqual(selectFiles(all, '02-b.json, 08-x-legacy.json'), ['02-b.json']);
  });
});
