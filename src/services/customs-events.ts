import { toApiUrl } from './runtime';

export interface CustomsEvent {
  id: string;
  title: string;
  description: string;
  explainability?: string;
  score: number;
  lat: number;
  lon: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: number;
}

export async function fetchCustomsEvents(): Promise<CustomsEvent[]> {
  try {
    const url = toApiUrl('/api/customs-events');
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[CustomsEvents] HTTP ${response.status}`);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('[CustomsEvents] Fetch error:', error);
    return [];
  }
}
