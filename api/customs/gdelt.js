import { readJsonFromUpstash } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // n8n will push directly to this Redis key
  const cacheKey = 'risk_sentinel:n8n:gdelt';
  
  try {
    const cached = await readJsonFromUpstash(cacheKey);
    const mockData = [{
      id: `gdelt-dummy-${Date.now()}`,
      source: 'GDELT',
      title: '[N8N SYNC PENDING] Interruzione Logistica in Fase di Rilevamento',
      severity: 'medium',
      coordinates: [12.4964, 41.9028], // Rome dummy
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
