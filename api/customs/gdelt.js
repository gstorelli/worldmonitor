import { readJsonFromUpstash } from '../_upstash-json.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(_req) {
  // n8n will push directly to this Redis key
  const cacheKey = 'risk_sentinel:n8n:gdelt';
  
  try {
    const cached = await readJsonFromUpstash(cacheKey);

    return new Response(JSON.stringify(Array.isArray(cached) ? cached : []), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
