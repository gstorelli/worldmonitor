import { readJsonFromUpstash } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const cacheKey = 'risk_sentinel:n8n:usgs';
  
  try {
    const cached = await readJsonFromUpstash(cacheKey);
    const mockData = [{
      id: `usgs-dummy-${Date.now()}`,
      source: 'USGS',
      title: '[N8N SYNC PENDING] Scossa Sismica M 4.0 Simulativa',
      severity: 'low',
      coordinates: [-122.4194, 37.7749],
      timestamp: new Date().toISOString(),
      metadata: { note: 'Dati simulati. Flusso n8n non ancora inizializzato.' }
    }];

    return new Response(JSON.stringify(cached || mockData), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
