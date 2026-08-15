import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const WORKFLOWS_DIR = resolve(root, 'n8n-workflows');
const CUSTOMS_KEYS = {
  gdelt: 'risk_sentinel:n8n:gdelt',
  usgs: 'risk_sentinel:n8n:usgs',
  openmeteo: 'risk_sentinel:n8n:openmeteo',
  acled: 'risk_sentinel:n8n:acled',
  comtrade: 'risk_sentinel:n8n:comtrade',
};

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function loadWorkflows() {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const raw = read(`n8n-workflows/${f}`);
    let json;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      assert.fail(`n8n-workflows/${f} is not valid JSON: ${err.message}`);
    }
    return { file: f, json };
  });
}

function walkParameters(node, visit) {
  const seen = new Set();
  const walk = (value) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'object' && v !== null) {
        visit(k, v);
        walk(v);
      }
    }
  };
  walk(node);
}

describe('n8n workflow JSON contract', () => {
  const workflows = loadWorkflows();

  it('loads at least one workflow', () => {
    assert.ok(workflows.length > 0);
  });

  for (const { file, json } of workflows) {
    it(`${file}: connections reference existing nodes`, () => {
      const names = new Set(json.nodes.map((n) => n.name));
      for (const [from, outputs] of Object.entries(json.connections || {})) {
        assert.ok(names.has(from), `connection source "${from}" is not a node`);
        for (const output of outputs.main || []) {
          for (const conn of output) {
            assert.ok(names.has(conn.node), `connection target "${conn.node}" is not a node`);
          }
        }
      }
    });

    it(`${file}: scheduleTrigger (when present) has a non-empty interval rule`, () => {
      for (const node of json.nodes) {
        if (node.type !== 'n8n-nodes-base.scheduleTrigger') continue;
        const interval = node.parameters?.rule?.interval;
        assert.ok(Array.isArray(interval) && interval.length > 0, `trigger "${node.name}" has no interval`);
        for (const entry of interval) {
          assert.ok(entry && typeof entry === 'object' && Object.keys(entry).length > 0,
            `trigger "${node.name}" interval is empty — the workflow would never fire`);
          if (entry.field === 'cronExpression') {
            assert.ok(entry.expression, `cron trigger "${node.name}" has no expression`);
          } else {
            assert.ok(entry.field, `trigger "${node.name}" interval entry has no field`);
          }
        }
      }
    });

    it(`${file}: push nodes use the shared header-auth credential (no $env, no hardcoded bearer)`, () => {
      for (const node of json.nodes) {
        if (node.type !== 'n8n-nodes-base.httpRequest') continue;
        // A headerParameters SIBLING of parameters is silently ignored by n8n:
        // the node then pushes without the bearer token and the server 401s.
        assert.ok(!('headerParameters' in node),
          `node "${node.name}" has headerParameters OUTSIDE parameters — move it inside`);
        const url = node.parameters?.url || '';
        if (!url.includes('/api/n8n/ingest')) continue;
        assert.equal(url, 'https://risksentinel.opencyber.org/api/n8n/ingest',
          `push node "${node.name}" URL must be the literal production ingest URL`);
        assert.equal(node.parameters.authentication, 'genericCredentialType',
          `push node "${node.name}" must authenticate via a credential`);
        assert.equal(node.parameters.genericAuthType, 'httpHeaderAuth',
          `push node "${node.name}" must use httpHeaderAuth`);
        assert.ok(node.credentials?.httpHeaderAuth, `push node "${node.name}" references no httpHeaderAuth credential`);
        assert.equal(node.credentials.httpHeaderAuth.name, 'Risk Sentinel Ingest Bearer',
          `push node "${node.name}" must reference the "Risk Sentinel Ingest Bearer" credential`);
      }
    });

    it(`${file}: no $env references (production instance blocks env access)`, () => {
      if (file.startsWith('08-') || file.startsWith('09-')) return; // legacy reference exports
      const raw = JSON.stringify(json);
      assert.ok(!raw.includes('$env.'), `${file} must not use $env expressions — use n8n credentials`);
    });

    it(`${file}: push URLs point at the production ingest endpoint`, () => {
      for (const node of json.nodes) {
        if (node.type !== 'n8n-nodes-base.httpRequest') continue;
        const url = node.parameters?.url;
        if (typeof url === 'string' && url.includes('/api/n8n/ingest')) {
          assert.equal(url, 'https://risksentinel.opencyber.org/api/n8n/ingest',
            `node "${node.name}" URL must be the literal production ingest endpoint`);
        }
      }
    });
  }

  it('every pipeline in the ingest handler is reachable from at least one workflow', () => {
    const ingest = read('api/n8n/ingest.js');
    const pipelines = [...ingest.matchAll(/'([a-z-]+)':\s*\{\s*\n\s*redisKey/g)].map((m) => m[1]);
    assert.ok(pipelines.length >= 6, `expected 6+ pipelines, found ${pipelines.length}`);
    const allJson = workflows.map((w) => JSON.stringify(w.json)).join('\n');
    for (const pipeline of pipelines) {
      assert.ok(allJson.includes(pipeline),
        `pipeline "${pipeline}" is defined in the ingest handler but no workflow pushes it`);
    }
  });

  it('ingest writes only dedicated n8n keys, never canonical seeded keys', () => {
    const ingest = read('api/n8n/ingest.js');
    assert.doesNotMatch(ingest, /redisKey:\s*'seismology:earthquakes:v1'/);
    assert.doesNotMatch(ingest, /redisKey:\s*'climate:anomalies:v2'/);
    assert.doesNotMatch(ingest, /redisKey:\s*'market:commodities-bootstrap:v1'/);
    assert.doesNotMatch(ingest, /redisKey:\s*'conflict:acled:v1:all:0:0'/);
    assert.doesNotMatch(ingest, /redisKey:\s*'intelligence:gdelt-intel:v1'/);
    assert.match(ingest, /redisKey:\s*'risk_sentinel:n8n:/);
    // The one canonical exception is the policy monitor, which has no native seeder.
    assert.match(ingest, /redisKey:\s*'policy:monitor:v1'/);
  });

  it('api/customs/* read the exact keys the ingest pipelines write', () => {
    const ingest = read('api/n8n/ingest.js');
    const byResource = {};
    for (const m of ingest.matchAll(/'([a-z-]+)':\s*\{\s*\n\s*redisKey:\s*'(risk_sentinel:n8n:[a-z0-9-]+)',\s*\n\s*ttl:[^,]+,\s*\n\s*resource:\s*'([a-z0-9-]+)'/g)) {
      byResource[m[3]] = { pipeline: m[1], key: m[2] };
    }
    const customs = read('api/customs/gdelt.js');
    assert.match(customs, /cacheKey\s*=\s*'risk_sentinel:n8n:gdelt'/);
    for (const [resource, { key }] of Object.entries(byResource)) {
      if (resource === 'commodities' || resource === 'policy-monitor') continue; // no customs endpoint yet
      const endpointName = { gdelt: 'gdelt', usgs: 'usgs', openmeteo: 'open-meteo', acled: 'acled' }[resource];
      if (!endpointName) continue;
      const src = read(`api/customs/${endpointName}.js`);
      assert.match(src, new RegExp(`cacheKey\\s*=\\s*'${key}'`),
        `api/customs/${endpointName}.js must read ${key}`);
    }
  });

  it('customs endpoints keep the mock fallback explicit about pending n8n sync', () => {
    const gdelt = read('api/customs/gdelt.js');
    assert.match(gdelt, /N8N SYNC PENDING/);
  });
});
