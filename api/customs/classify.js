import { readJsonFromUpstash, setCachedData } from '../_upstash-json.js';
import crypto from 'node:crypto';

export const config = {
  runtime: 'edge',
};

// Extremely lightweight context for the generic Edge runtime (No TS imports)
const SYSTEM_PROMPT = `You are a Guardia di Finanza / Italian Customs Intelligence Analyst.
Your job is to read global news events and determine if they present a direct physical, diplomatic, or logistical risk to:
1. High-tech dual-use goods (Microchips, processors).
2. Rare-earth metals and Lithium.
3. European Energy imports (Oil, LNG) or Agrifood (Wheat, Fertilizer).
4. Major customs chokepoints (Suez Canal, Mediterranean Basin, Rotterdam, Bosphorus).

Respond ONLY with a raw JSON object and nothing else. Do not use markdown blocks.
Format:
{
  "isCustomsRelevant": boolean,
  "confidence": number, // 0 to 100
  "reasoning": "string"
}`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'LLM Key not configured' }), { status: 401 });
  }

  try {
    const { title, source, description } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: 'Missing event title' }), { status: 400 });
    }

    const payloadString = `${title}|${source}|${description || ''}`;
    
    // Fallback hashing for Edge Runtime if node:crypto fails
    let hash;
    try {
      hash = crypto.createHash('sha256').update(payloadString).digest('hex');
    } catch {
      // Very crude string hash for browser-like environments
      let h = 0;
      for (let i = 0; i < payloadString.length; i++) h = Math.imul(31, h) + payloadString.charCodeAt(i) | 0;
      hash = h.toString();
    }
    
    const cacheKey = `risk_sentinel:classify:${hash}`;
    
    // Check Upstash Redis first
    const cached = await readJsonFromUpstash(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=86400', // cache for 24 hours
        },
      });
    }

    // Prepare LLM Call
    const userPrompt = `Classify this event:\nSource: ${source}\nTitle: ${title}\nDescription: ${description || 'N/A'}`;
    
    let apiUrl = 'https://api.openai.com/v1/chat/completions';
    let model = 'gpt-3.5-turbo';
    
    if (process.env.GROQ_API_KEY) {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
      model = 'llama3-8b-8192';
    }

    const llmResp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!llmResp.ok) {
      throw new Error(`LLM Error: ${llmResp.status}`);
    }

    const llmData = await llmResp.json();
    const content = llmData.choices[0].message.content;
    const classification = JSON.parse(content);

    // Cache the successful outcome
    await setCachedData(cacheKey, classification, 86400);

    return new Response(JSON.stringify(classification), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400',
      },
    });
  } catch (err) {
    console.error('[SemanticClassifier]', err);
    return new Response(JSON.stringify({ 
      isCustomsRelevant: true, // Fail-open baseline
      confidence: 50,
      reasoning: 'LLM Classification failed, defaulting to baseline.',
      error: err.message
    }), { status: 500 });
  }
}
