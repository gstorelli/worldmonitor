import type { IConnector, RiskEvent } from '@/types/connectors';

export class GdeltConnector implements IConnector {
  id = 'gdelt';
  name = 'GDELT Global Events';

  async fetchAlerts(_params?: any): Promise<RiskEvent[]> {
    try {
      const res = await fetch('/api/customs/gdelt');
      if (!res.ok) throw new Error('Failed to fetch GDELT');
      const data = await res.json();
      return data || [];
    } catch (err) {
      console.error('[GdeltConnector]', err);
      return [];
    }
  }
}
