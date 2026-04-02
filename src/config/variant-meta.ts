export interface VariantMeta {
  title: string;
  description: string;
  keywords: string;
  url: string;
  siteName: string;
  shortName: string;
  subject: string;
  classification: string;
  categories: string[];
  features: string[];
}

export const VARIANT_META: { full: VariantMeta; [k: string]: VariantMeta } = {
  full: {
    title: 'World Monitor - Real-Time Global Intelligence Dashboard',
    description: 'Real-time global intelligence dashboard with live news, markets, military tracking, infrastructure monitoring, and geopolitical data. OSINT in one view.',
    keywords: 'global intelligence, geopolitical dashboard, world news, market data, military bases, nuclear facilities, undersea cables, conflict zones, real-time monitoring, situation awareness, OSINT, flight tracking, AIS ships, earthquake monitor, protest tracker, power outages, oil prices, government spending, polymarket predictions',
    url: 'https://www.worldmonitor.app/',
    siteName: 'World Monitor',
    shortName: 'World Monitor',
    subject: 'Real-Time Global Intelligence and Situation Awareness',
    classification: 'Intelligence Dashboard, OSINT Tool, News Aggregator',
    categories: ['news', 'productivity'],
    features: [
      'Real-time news aggregation',
      'Stock market tracking',
      'Military flight monitoring',
      'Ship AIS tracking',
      'Earthquake alerts',
      'Protest tracking',
      'Power outage monitoring',
      'Oil price analytics',
      'Government spending data',
      'Prediction markets',
      'Infrastructure monitoring',
      'Geopolitical intelligence',
    ],
  }
};
