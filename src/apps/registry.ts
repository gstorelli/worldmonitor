/**
 * Risk Sentinel — workspace registry.
 *
 * Maps an app id to its standalone application module. Apps without an entry
 * (customs) fall back to the classic panel dashboard.
 */

import type { WorkspaceLoader } from './types';

const APP_WORKSPACES: Record<string, WorkspaceLoader> = {
  osint: () => import('./osint/workspace').then((m) => m.createOsintWorkspace()),
  research: () => import('./research/workspace').then((m) => m.createResearchWorkspace()),
  policy: () => import('./policy/workspace').then((m) => m.createPolicyWorkspace()),
};

export function getAppWorkspaceLoader(appId: string): WorkspaceLoader | null {
  return APP_WORKSPACES[appId] ?? null;
}

export function hasStandaloneWorkspace(appId: string): boolean {
  return appId in APP_WORKSPACES;
}
