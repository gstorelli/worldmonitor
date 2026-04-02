import type { IConnector, RiskEvent } from '@/types/connectors';

export class AcledConnector implements IConnector {
  id = 'acled';
  name = 'ACLED Conflict Events';

  async fetchAlerts(_params?: any): Promise<RiskEvent[]> {
    try {
      const res = await fetch('/api/customs/acled');
      if (!res.ok) throw new Error('Failed to fetch ACLED');
      const data = await res.json();
      return data || [];
    } catch (err) {
      console.error('[AcledConnector]', err);
      return [];
    }
  }
}
