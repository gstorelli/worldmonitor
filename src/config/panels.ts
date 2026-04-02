import type { PanelConfig, MapLayers, DataSourceId } from '@/types';
import { SITE_VARIANT } from './variant';
// boundary-ignore: isDesktopRuntime is a pure env probe with no service dependencies
import { isDesktopRuntime } from '@/services/runtime';
// boundary-ignore: getSecretState is a pure env/keychain probe with no service dependencies
// import { getSecretState } from '@/services/runtime-config';

const _desktop = isDesktopRuntime();

export const FULL_PANELS: Record<string, PanelConfig> = {
  'gdelt-intel': { name: 'Global Tension', enabled: true, priority: 1 },
  commodities: { name: 'Commodity Stress', enabled: true, priority: 1 },
  'supply-chain': { name: 'Supply Chain Anomalies', enabled: true, priority: 1 },
  'trade-policy': { name: 'Trade Restrictions', enabled: true, priority: 1 },
  'sanctions-pressure': { name: 'Sanctions Alerts', enabled: true, priority: 1 },
};

export const FULL_MAP_LAYERS: MapLayers = {
  iranAttacks: !_desktop,
  gpsJamming: false,
  satellites: false,
  conflicts: true,
  bases: !_desktop,
  cables: false,
  pipelines: false,
  hotspots: true,
  ais: true,
  nuclear: true,
  irradiators: false,
  radiationWatch: false,
  sanctions: true,
  weather: true,
  economic: true,
  waterways: true,
  outages: true,
  cyberThreats: false,
  datacenters: false,
  protests: false,
  flights: false,
  military: true,
  natural: true,
  spaceports: false,
  minerals: false,
  fires: false,
  diseaseOutbreaks: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  tradeRoutes: true,
  ciiChoropleth: false,
  dayNight: false,
  miningSites: false,
  processingPlants: false,
  commodityPorts: true,
  webcams: false,
  weatherRadar: false,
};

export const FULL_MOBILE_MAP_LAYERS = FULL_MAP_LAYERS;

export const ALL_PANELS: Record<string, PanelConfig> = { ...FULL_PANELS };
export const VARIANT_DEFAULTS: Record<string, string[]> = { full: Object.keys(FULL_PANELS) };
export const VARIANT_PANEL_OVERRIDES: Partial<Record<string, Partial<Record<string, Partial<PanelConfig>>>>> = {};

export function getEffectivePanelConfig(key: string, _variant: string): PanelConfig {
  return ALL_PANELS[key] || { name: key, enabled: false, priority: 2 };
}

export function isPanelEntitled(key: string, config: PanelConfig): boolean {
  if (!config.premium) return true;
  if (config.premium === 'locked') return isDesktopRuntime();
  return true;
}

export const DEFAULT_PANELS: Record<string, PanelConfig> = Object.fromEntries(
  (VARIANT_DEFAULTS[SITE_VARIANT] ?? VARIANT_DEFAULTS['full'] ?? []).map(key =>
    [key, getEffectivePanelConfig(key, SITE_VARIANT)]
  )
);

export const DEFAULT_MAP_LAYERS = FULL_MAP_LAYERS;
export const MOBILE_DEFAULT_MAP_LAYERS = FULL_MOBILE_MAP_LAYERS;

export const LAYER_TO_SOURCE: Partial<Record<keyof MapLayers, DataSourceId[]>> = {
  military: ['opensky', 'wingbits'],
  ais: ['ais'],
  natural: ['usgs'],
  weather: ['weather'],
  outages: ['outages'],
  cyberThreats: ['cyber_threats'],
  protests: ['acled', 'gdelt_doc'],
  ucdpEvents: ['ucdp_events'],
  displacement: ['unhcr'],
  climate: ['climate'],
  sanctions: ['sanctions_pressure'],
  radiationWatch: ['radiation'],
};

export const PANEL_CATEGORY_MAP: Record<string, { labelKey: string; panelKeys: string[]; variants?: string[] }> = {
  core: { labelKey: 'header.panelCatCore', panelKeys: ['map', 'live-news', 'insights', 'strategic-posture'] },
  customs: { labelKey: 'Customs & Trade', panelKeys: ['alert-feed', 'trade-policy', 'supply-chain', 'sanctions-pressure', 'commodities', 'economic-correlation'] },
  intelligence: { labelKey: 'Intelligence', panelKeys: ['cii', 'strategic-risk', 'intel', 'gdelt-intel', 'cascade', 'military-correlation'] },
};

export const MONITOR_COLORS = ['#44ff88', '#ff8844', '#4488ff', '#ff44ff', '#ffff44', '#ff4444', '#44ffff', '#88ff44', '#ff88ff', '#88ffff'];
export const STORAGE_KEYS = { panels: 'worldmonitor-panels', monitors: 'worldmonitor-monitors', mapLayers: 'worldmonitor-layers', disabledFeeds: 'worldmonitor-disabled-feeds' } as const;
