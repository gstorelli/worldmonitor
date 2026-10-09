#!/usr/bin/env node
/**
 * Sync the Code-node source of the committed n8n workflows into the live n8n
 * instance, through the n8n public REST API.
 *
 * Only `n8n-nodes-base.code` nodes are touched, matched by workflow name and
 * node name. Credentials, triggers, HTTP nodes and every other setting stay as
 * they are in n8n, so a committed JSON with placeholder credential ids can
 * never break a live workflow. A workflow that was active is re-activated
 * after the update so the schedule runs the new code.
 *
 * Environment:
 *   N8N_BASE_URL   e.g. https://automata.opencyber.org (no trailing slash)
 *   N8N_API_KEY    n8n public API key (X-N8N-API-KEY)
 *   N8N_SYNC_FILES comma-separated file names in n8n-workflows/ (default: all
 *                  non-legacy workflows)
 *   N8N_DRY_RUN    "1" = report the diff, change nothing
 *
 * Output: one GitHub Actions annotation per workflow (::notice / ::warning),
 * so results are readable from the run summary without the raw log.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF_DIR = join(repoRoot, 'n8n-workflows');

const BASE = (process.env.N8N_BASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.N8N_API_KEY || '';
const DRY = process.env.N8N_DRY_RUN === '1';

// Settings keys accepted by the public API on update; anything else is a 400.
const SETTINGS_KEYS = [
  'saveExecutionProgress',
  'saveManualExecutions',
  'saveDataErrorExecution',
  'saveDataSuccessExecution',
  'executionTimeout',
  'errorWorkflow',
  'timezone',
  'executionOrder',
];

function note(level, msg) {
  console.log(`::${level}::${msg.replace(/\r?\n/g, ' ')}`);
}

export function selectFiles(all, wanted) {
  const files = all.filter((f) => f.endsWith('.json') && !f.includes('legacy'));
  if (!wanted) return files;
  const set = new Set(wanted.split(',').map((s) => s.trim()).filter(Boolean));
  return files.filter((f) => set.has(f));
}

/** Returns the live workflow with committed Code-node sources applied, plus the changed node names. */
export function patchCodeNodes(live, committed) {
  const committedCode = new Map(
    committed.nodes
      .filter((n) => n.type === 'n8n-nodes-base.code' && typeof n.parameters?.jsCode === 'string')
      .map((n) => [n.name, n.parameters.jsCode]),
  );
  const changed = [];
  const missing = [];
  const nodes = live.nodes.map((n) => {
    if (n.type !== 'n8n-nodes-base.code' || !committedCode.has(n.name)) return n;
    const code = committedCode.get(n.name);
    if (n.parameters?.jsCode === code) return n;
    changed.push(n.name);
    return { ...n, parameters: { ...n.parameters, jsCode: code } };
  });
  for (const name of committedCode.keys()) {
    if (!live.nodes.some((n) => n.name === name)) missing.push(name);
  }
  return { nodes, changed, missing };
}

/** Live names sharing a distinctive word with the committed name (helps after a rename in n8n). */
export function similarNames(name, liveNames) {
  const stop = new Set(['risk', 'sentinel', 'ingestion', 'data', 'and', 'the']);
  const words = name.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 2 && !stop.has(w));
  return liveNames.filter((n) => words.some((w) => n.toLowerCase().includes(w))).slice(0, 8);
}

export function updateBody(live, nodes) {
  const settings = {};
  for (const k of SETTINGS_KEYS) if (live.settings && k in live.settings) settings[k] = live.settings[k];
  const body = { name: live.name, nodes, connections: live.connections, settings };
  if (live.staticData) body.staticData = live.staticData;
  return body;
}

async function api(path, init = {}) {
  const res = await globalThis.fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'X-N8N-API-KEY': KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'risk-sentinel-n8n-sync/1.0',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function listWorkflows() {
  const out = [];
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const q = `/workflows?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await api(q);
    out.push(...(data.data || []));
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return out;
}

async function main() {
  if (!BASE || !KEY) {
    note('warning', 'n8n sync skipped: N8N_BASE_URL or N8N_API_KEY not set (add the N8N_API_KEY repository secret).');
    return 0;
  }
  const files = selectFiles(readdirSync(WF_DIR), process.env.N8N_SYNC_FILES);
  const live = await listWorkflows();
  note('notice', `n8n reachable: ${live.length} workflows on the instance; checking ${files.length} committed files${DRY ? ' (dry run)' : ''}.`);
  let failures = 0;
  for (const file of files) {
    const committed = JSON.parse(readFileSync(join(WF_DIR, file), 'utf8'));
    const matches = live.filter((w) => w.name === committed.name);
    if (matches.length !== 1) {
      const similar = similarNames(committed.name, live.map((w) => w.name));
      note(
        'warning',
        `${file}: ${matches.length} live workflows named "${committed.name}" — skipped.${similar.length ? ` Similar live names: ${similar.map((n) => `"${n}"`).join(', ')}.` : ''}`,
      );
      continue;
    }
    try {
      const full = await api(`/workflows/${matches[0].id}`);
      const { nodes, changed, missing } = patchCodeNodes(full, committed);
      if (missing.length) note('warning', `${file}: code nodes not found live: ${missing.join(', ')}.`);
      if (!changed.length) {
        note('notice', `${file}: up to date (active=${full.active}).`);
        continue;
      }
      if (DRY) {
        note('notice', `${file}: would update ${changed.join(', ')} (active=${full.active}).`);
        continue;
      }
      await api(`/workflows/${full.id}`, { method: 'PUT', body: JSON.stringify(updateBody(full, nodes)) });
      let activation = 'left inactive';
      if (full.active) {
        await api(`/workflows/${full.id}/activate`, { method: 'POST' });
        activation = 're-activated';
      }
      note('notice', `${file}: updated ${changed.join(', ')}; ${activation}.`);
    } catch (err) {
      failures++;
      note('error', `${file}: ${err.message}`);
    }
  }
  return failures ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      note('error', `n8n sync failed: ${err.message}`);
      process.exit(1);
    },
  );
}
