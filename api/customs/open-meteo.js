import { readJsonFromUpstash } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const cacheKey = 'risk_sentinel:n8n:openmeteo';
  
  try {
    const cached = await readJsonFromUpstash(cacheKey);
    const mockData = [{
      id: `meteo-dummy-${Date.now()}`,
      source: 'OPEN_METEO',
      title: '[N8N SYNC PENDING] Allerta Meteo Simulativa sul Mediterraneo',
      severity: 'medium',
      coordinates: [14.2681, 40.8518], // Naples
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
