export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RiskEvent {
  id: string;
  source: 'GDELT' | 'USGS' | 'OPEN_METEO' | 'UN_COMTRADE' | 'ACLED';
  title: string;
  severity: RiskSeverity;
  coordinates?: [number, number]; // [Longitude, Latitude]
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface IConnector {
  id: string;
  name: string;
  fetchAlerts(params?: any): Promise<RiskEvent[]>;
}
