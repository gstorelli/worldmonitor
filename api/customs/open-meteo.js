import { readJsonFromUpstash, setCachedData } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const cacheKey = 'risk_sentinel:openmeteo:v1';
  
  try {
    const cached = await readJsonFromUpstash(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=300',
        },
      });
    }

    const mockEvents = [
      {
        id: `meteo-${Date.now()}`,
        source: 'OPEN_METEO',
        title: 'Extreme Weather Alert: Typhoon trajectory crossing major shipping lane',
        severity: 'high',
        coordinates: [114.1694, 22.3193], // Hong Kong
        timestamp: new Date().toISOString(),
        metadata: { windSpeed: 120, condition: 'Typhoon' }
      }
    ];

    await setCachedData(cacheKey, mockEvents, 300);

    return new Response(JSON.stringify(mockEvents), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
