/**
 * Risk Sentinel — application registry.
 *
 * The platform hosts multiple "apps" over the same SPA/backend. An app is a
 * curated panel allowlist plus a default enabled set for first-time use; the
 * active app is selected with `?app=<id>` (persisted in localStorage) and
 * defaults to `customs`.
 *
 * This is deliberately layered ON TOP of the existing collapsed variant system
 * (SITE_VARIANT) instead of reviving upstream variants: the variant machinery
 * (build-time metadata rewrite, favicon swap, map styles) is inert in this
 * fork and reviving it would add churn and upstream-sync hazards.
 */

export interface AppDefinition {
  id: string;
  label: string;
  description: string;
  /** Panels visible inside this app. `null` allows every registered panel. */
  allowedPanels: string[] | null;
  /** Panels force-enabled the first time the app is opened. */
  defaultPanels: string[];
}

export const CUSTOMS_APP: AppDefinition = {
  id: 'customs',
  label: 'Customs Risk',
  description: 'PhD customs-risk early warning (current dashboard)',
  allowedPanels: null,
  defaultPanels: [],
};

/**
 * OSINT surface: reuses the existing intelligence/news/cyber panels and leaves
 * room for ad-hoc OSINT panels added later. New panels only need to be appended
 * here to appear in the app.
 */
export const OSINT_APP: AppDefinition = {
  id: 'osint',
  label: 'OSINT',
  description: 'Open-source intelligence workspace',
  allowedPanels: [
    'map',
    'live-news',
    'live-webcams',
    'windy-webcams',
    'insights',
    'cii',
    'strategic-risk',
    'intel',
    'gdelt-intel',
    'cascade',
    'military-correlation',
    'escalation-correlation',
    'disaster-correlation',
    'politics',
    'us',
    'europe',
    'middleeast',
    'africa',
    'latam',
    'asia',
    'gov',
    'thinktanks',
    'security',
    'internet-disruptions',
    'service-status',
    'telegram-intel',
    'airline-intel',
    'oref-sirens',
    'radiation-watch',
    'thermal-escalation',
    'ucdp-events',
    'displacement',
    'disease-outbreaks',
    'satellite-fires',
    'sanctions-pressure',
    'security-advisories',
    'geo-hubs',
    'world-clock',
    'monitors',
    'alert-feed',
    'source-validation',
    'cross-source-signals',
  ],
  defaultPanels: [
    'map',
    'live-news',
    'insights',
    'cii',
    'strategic-risk',
    'intel',
    'gdelt-intel',
    'cascade',
    'military-correlation',
    'escalation-correlation',
    'middleeast',
    'europe',
    'asia',
    'security',
    'internet-disruptions',
    'telegram-intel',
    'airline-intel',
    'oref-sirens',
    'alert-feed',
    'source-validation',
    'cross-source-signals',
    'satellite-fires',
    'disaster-correlation',
    'displacement',
    'ucdp-events',
    'sanctions-pressure',
    'security-advisories',
    'monitors',
  ],
};

/**
 * Research surface: Zotero library + document analysis. Own panel set and
 * default layout, with room for the document-analysis developments
 * (annotations, cross-references, collection workspaces).
 */
export const RESEARCH_APP: AppDefinition = {
  id: 'research',
  label: 'Research',
  description: 'Zotero library and document analysis workspace',
  allowedPanels: [
    'map',
    'source-validation',
    'intel',
    'insights',
    'live-news',
    'cross-source-signals',
    'monitors',
    'alert-feed',
    'world-clock',
  ],
  defaultPanels: ['map', 'source-validation', 'intel', 'insights', 'cross-source-signals', 'monitors'],
};

/** Policy surface: EU/regulatory monitoring and compliance analysis. */
export const POLICY_APP: AppDefinition = {
  id: 'policy',
  label: 'Policy',
  description: 'Policy, regulatory and compliance analysis',
  allowedPanels: [
    'map',
    'policy-analysis',
    'trade-policy',
    'commodity-regulation',
    'regulation',
    'policy',
    'ai-regulation',
    'sanctions-pressure',
    'economic',
    'supply-chain',
    'live-news',
    'intel',
    'insights',
    'alert-feed',
    'monitors',
  ],
  defaultPanels: [
    'map',
    'policy-analysis',
    'trade-policy',
    'commodity-regulation',
    'regulation',
    'policy',
    'ai-regulation',
    'sanctions-pressure',
    'economic',
    'supply-chain',
    'insights',
    'alert-feed',
  ],
};

export const APPS: AppDefinition[] = [CUSTOMS_APP, OSINT_APP, RESEARCH_APP, POLICY_APP];
export const DEFAULT_APP_ID = CUSTOMS_APP.id;
const APP_STORAGE_KEY = 'rs-active-app';
const APP_QUERY_PARAM = 'app';

export function getApp(appId: string): AppDefinition | undefined {
  return APPS.find((app) => app.id === appId);
}

/** Pure resolution helper (testable): explicit `?app=` > stored > default. */
export function resolveAppId(search: string, stored: string | null | undefined): string {
  const fromQuery = new URLSearchParams(search).get(APP_QUERY_PARAM);
  if (fromQuery && getApp(fromQuery)) return fromQuery;
  if (stored && getApp(stored)) return stored;
  return DEFAULT_APP_ID;
}

function readStoredApp(): string | null {
  try {
    return localStorage.getItem(APP_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const ACTIVE_APP: AppDefinition = (() => {
  if (typeof window === 'undefined') return CUSTOMS_APP;
  const search = window.location.search;
  const appId = resolveAppId(search, readStoredApp());
  if (new URLSearchParams(search).has(APP_QUERY_PARAM)) {
    try {
      localStorage.setItem(APP_STORAGE_KEY, appId);
    } catch {
      // private mode: the app still works, the choice just isn't persisted.
    }
  }
  return getApp(appId) ?? CUSTOMS_APP;
})();

export function isPanelAllowedInApp(panelId: string, appId: string = ACTIVE_APP.id): boolean {
  const app = getApp(appId);
  if (!app || app.allowedPanels === null) return true;
  return app.allowedPanels.includes(panelId);
}

/** Read-only view of an app's default panel configs (for seeding). */
export function appDefaultEnabledSet(appId: string = ACTIVE_APP.id): Set<string> {
  return new Set(getApp(appId)?.defaultPanels ?? []);
}

/** Link that selects an app (used by the header switcher). */
export function switchAppHref(appId: string): string {
  if (typeof window === 'undefined') return `?${APP_QUERY_PARAM}=${appId}`;
  const url = new URL(window.location.href);
  url.searchParams.set(APP_QUERY_PARAM, appId);
  return `${url.pathname}${url.search}`;
}
