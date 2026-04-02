import { readJsonFromUpstash, setCachedData } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const apiKey = process.env.ACLED_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ACLED_API_KEY not configured' }), { status: 401 });
  }

  const cacheKey = 'risk_sentinel:acled:v1';
  
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
        id: `acled-${Date.now()}`,
        source: 'ACLED',
        title: 'Border Skirmish near Strategic Land Crossing',
        severity: 'high',
        coordinates: [35.2136, 31.7683], // Jerusalem area
        timestamp: new Date().toISOString(),
        metadata: { fatalities: 0, actor1: 'State Forces', type: 'Battles' }
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
