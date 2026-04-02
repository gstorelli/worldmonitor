import type { IConnector, RiskEvent } from '@/types/connectors';

export class OpenMeteoConnector implements IConnector {
  id = 'open_meteo';
  name = 'Open-Meteo Extreme Weather';

  async fetchAlerts(params?: any): Promise<RiskEvent[]> {
    try {
      const res = await fetch('/api/customs/open-meteo');
      if (!res.ok) throw new Error('Failed to fetch Open-Meteo');
      const data = await res.json();
      return data || [];
    } catch (err) {
      console.error('[OpenMeteoConnector]', err);
      return [];
    }
  }
}
