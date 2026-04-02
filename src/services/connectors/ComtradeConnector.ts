import type { IConnector, RiskEvent } from '@/types/connectors';

export class ComtradeConnector implements IConnector {
  id = 'comtrade';
  name = 'UN Comtrade Supply Chain';

  async fetchAlerts(params?: any): Promise<RiskEvent[]> {
    try {
      const res = await fetch('/api/customs/comtrade');
      if (!res.ok) throw new Error('Failed to fetch UN Comtrade');
      const data = await res.json();
      return data || [];
    } catch (err) {
      console.error('[ComtradeConnector]', err);
      return [];
    }
  }
}
