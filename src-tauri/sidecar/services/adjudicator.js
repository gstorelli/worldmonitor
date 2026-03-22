import { logAiDecision } from '../database/sqlite.js';
const PRIMARY_MODEL = 'anthropic/claude-3.5-haiku';
const FALLBACK_MODEL = 'meta-llama/llama-3-8b-instruct';
const SYSTEM_PROMPT = `You are 'Risk Sentinel', an AI specialized in global supply chain and customs risk intelligence. 
Analyze the following geopolitical or economic event and determine its relevance to customs operations, border controls, supply chain disruptions, or international trade flows.

Respond strictly in valid JSON format with no markdown formatting:
{
  "customs_relevance_score": [Float between 0.0 and 1.0],
  "reasoning": "[Brief 2-sentence explanation of the supply chain impact]"
}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function fetchFromOpenRouter(model, userPrompt) {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey)
        throw new Error('OPENROUTER_API_KEY not set.');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ]
        })
    });
    if (!res.ok) {
        throw new Error(`OpenRouter API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
}
/**
 * Validates the score for events with baseline > 50, reducing False Positives
 * like "No threat to Suez Canal".
 */
export async function adjudicateEvent(eventId, eventTitle, eventDesc) {
    const userPrompt = `Event Title: ${eventTitle}\nEvent Description: ${eventDesc}`;
    let resultJSON = null;
    let usedModel = PRIMARY_MODEL;
    let rawResponse = '';
    let tokenUsage = 0;
    try {
        // Attempt with Primary Model
        const primaryRes = await fetchFromOpenRouter(PRIMARY_MODEL, userPrompt);
        rawResponse = primaryRes.choices[0].message.content;
        tokenUsage = primaryRes.usage?.total_tokens || 0;
        resultJSON = JSON.parse(rawResponse);
    }
    catch (primaryError) {
        console.warn(`Primary model ${PRIMARY_MODEL} failed, applying exponential backoff...`, primaryError);
        await sleep(2000); // Wait 2s
        try {
            // Fallback Strategy
            usedModel = FALLBACK_MODEL;
            const fallbackRes = await fetchFromOpenRouter(FALLBACK_MODEL, userPrompt);
            rawResponse = fallbackRes.choices[0].message.content;
            tokenUsage = fallbackRes.usage?.total_tokens || 0;
            resultJSON = JSON.parse(rawResponse);
        }
        catch (fallbackError) {
            console.error('Fallback model also failed. Returning null.', fallbackError);
            return null;
        }
    }
    // Ensure JSON shape
    if (resultJSON && typeof resultJSON.customs_relevance_score === 'number' && typeof resultJSON.reasoning === 'string') {
        // Log for AI Act Compliance
        const decisionId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        logAiDecision(decisionId, eventId, SYSTEM_PROMPT, userPrompt, rawResponse, tokenUsage);
        return {
            customs_relevance_score: resultJSON.customs_relevance_score,
            reasoning: resultJSON.reasoning
        };
    }
    return null;
}
