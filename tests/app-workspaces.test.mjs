import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const registry = await import(pathToFileURL(join(root, 'src', 'apps', 'registry.ts')).href);

const WORKSPACES = [
  { id: 'osint', file: join(root, 'src', 'apps', 'osint', 'workspace.ts'), exportName: 'createOsintWorkspace', endpoint: '/api/notify/digest' },
  { id: 'research', file: join(root, 'src', 'apps', 'research', 'workspace.ts'), exportName: 'createResearchWorkspace', endpoint: '/api/zotero/library' },
  { id: 'policy', file: join(root, 'src', 'apps', 'policy', 'workspace.ts'), exportName: 'createPolicyWorkspace', endpoint: '/api/policy/registry' },
];

describe('standalone app workspaces', () => {
  it('registers a workspace for osint/research/policy but not for the customs dashboard', () => {
    assert.equal(registry.hasStandaloneWorkspace('osint'), true);
    assert.equal(registry.hasStandaloneWorkspace('research'), true);
    assert.equal(registry.hasStandaloneWorkspace('policy'), true);
    assert.equal(registry.hasStandaloneWorkspace('customs'), false);
    assert.equal(registry.getAppWorkspaceLoader('customs'), null);
  });

  it('loads each workspace module and exposes a mount function', async () => {
    for (const spec of WORKSPACES) {
      const loader = registry.getAppWorkspaceLoader(spec.id);
      assert.equal(typeof loader, 'function', `${spec.id} loader missing`);
      const workspace = await loader();
      assert.equal(typeof workspace.mount, 'function', `${spec.id} must expose mount()`);
    }
  });

  it('keeps the applications functionally separate from the dashboard', () => {
    for (const spec of WORKSPACES) {
      const source = readFileSync(spec.file, 'utf8');
      assert.match(source, new RegExp(`export function ${spec.exportName}`), `${spec.id} must export ${spec.exportName}`);
      assert.ok(source.includes(spec.endpoint), `${spec.id} must own its data endpoint (${spec.endpoint})`);
      assert.ok(!source.includes("from '@/components"), `${spec.id} must not import dashboard components`);
      assert.ok(!source.includes("from '@/app/"), `${spec.id} must not import dashboard managers`);
    }
  });

  it('branches the app bootstrap before the dashboard is initialised', () => {
    const appSource = readFileSync(join(root, 'src', 'App.ts'), 'utf8');
    const seam = appSource.indexOf('getAppWorkspaceLoader(ACTIVE_APP.id)');
    const panels = appSource.indexOf('this.panelLayout.init()');
    assert.ok(seam !== -1, 'App.ts must consult the workspace registry');
    assert.ok(panels !== -1, 'dashboard init expected');
    assert.ok(seam < panels, 'workspace branch must run before the dashboard init');
  });
});
