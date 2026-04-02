import { readJsonFromUpstash, setCachedData } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const apiKey = process.env.COMTRADE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'COMTRADE_API_KEY not configured' }), { status: 401 });
  }

  const cacheKey = 'risk_sentinel:comtrade:v1';
  
  try {
    const cached = await readJsonFromUpstash(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=3600',
        },
      });
    }

    const mockEvents = [
      {
        id: `comtrade-${Date.now()}`,
        source: 'UN_COMTRADE',
        title: 'Anomalous drop in Semiconductor Exports (HS 8541)',
        severity: 'medium',
        timestamp: new Date().toISOString(),
        metadata: { commodityCode: '8541', variancePercentage: -15.4 }
      }
    ];

    await setCachedData(cacheKey, mockEvents, 3600);

    return new Response(JSON.stringify(mockEvents), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=3600',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
