// Rate Limiting Enforcer (1 req/5s)
let lastGdeltFetch = 0;
const GDELT_API_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
// Keywords tuned for Supply Chain and Customs
const CUSTOMS_KEYWORDS = '(customs OR "supply chain" OR port OR maritime OR logistics OR tariff OR sanction OR blockade OR cargo OR freight)';
export async function fetchGdeltEvents() {
    const now = Date.now();
    const timeSinceLast = now - lastGdeltFetch;
    if (timeSinceLast < 5000) {
        const waitTime = 5000 - timeSinceLast;
        await new Promise(r => setTimeout(r, waitTime));
    }
    lastGdeltFetch = Date.now();
    const queryParams = new URLSearchParams({
        query: CUSTOMS_KEYWORDS,
        mode: 'artlist',
        format: 'json',
        maxrecords: '100',
        timespan: '1d'
    });
    const url = `${GDELT_API_URL}?${queryParams.toString()}`;
    try {
        // Note: Node.js 18+ has built in fetch
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`GDELT API error: ${response.status}`);
        }
        const data = await response.json();
        if (!data || !data.articles)
            return [];
        return data.articles.map((art) => ({
            id: Buffer.from(art.url).toString('base64'),
            title: art.title,
            description: art.seendate ? `Published on ${art.seendate}. Source: ${art.domain}.` : '',
            sourceUrl: art.url
        }));
    }
    catch (e) {
        console.error('Failed to fetch GDELT events:', e);
        return [];
    }
}
