import { readJsonFromUpstash, setCachedData } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const cacheKey = 'risk_sentinel:gdelt:v1';
  
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

    // Mock payload since we are bypassing proto for now
    const mockEvents = [
      {
        id: `gdelt-${Date.now()}`,
        source: 'GDELT',
        title: 'Geopolitical Tension detected in East Asia Trade Route',
        severity: 'high',
        coordinates: [120.9842, 23.6978], // Taiwan Strait
        timestamp: new Date().toISOString(),
        metadata: { tradeImpact: 'high', articlesCount: 15 }
      }
    ];

    await setCachedData(cacheKey, mockEvents, 300); // cache for 5 minutes

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
