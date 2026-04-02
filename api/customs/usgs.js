import { readJsonFromUpstash, setCachedData } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const cacheKey = 'risk_sentinel:usgs:v1';
  
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
        id: `usgs-${Date.now()}`,
        source: 'USGS',
        title: 'M 6.1 Earthquake - Near Key Logistics Hub',
        severity: 'critical',
        coordinates: [-122.4194, 37.7749], // San Francisco
        timestamp: new Date().toISOString(),
        metadata: { magnitude: 6.1, depthLimit: 10 }
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
