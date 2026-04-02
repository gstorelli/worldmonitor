import type { IConnector, RiskEvent } from '@/types/connectors';

export class UsgsConnector implements IConnector {
  id = 'usgs';
  name = 'USGS Earthquakes';

  async fetchAlerts(_params?: any): Promise<RiskEvent[]> {
    try {
      const res = await fetch('/api/customs/usgs');
      if (!res.ok) throw new Error('Failed to fetch USGS');
      const data = await res.json();
      return data || [];
    } catch (err) {
      console.error('[UsgsConnector]', err);
      return [];
    }
  }
}
