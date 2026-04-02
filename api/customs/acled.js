import { readJsonFromUpstash } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const cacheKey = 'risk_sentinel:n8n:acled';
  
  try {
    const cached = await readJsonFromUpstash(cacheKey);
    const mockData = [{
      id: `acled-dummy-${Date.now()}`,
      source: 'ACLED',
      title: '[N8N SYNC PENDING] Schermaglia di Confine Simulativa',
      severity: 'elevated',
      coordinates: [35.2136, 31.7683], 
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
