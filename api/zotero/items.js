import { getPublicCorsHeaders } from '../_cors.js';
import { getRequestUser } from '../_users.js';

export const config = { runtime: 'edge' };

const ZOTERO_TYPES = {
  journal: 'journalArticle',
  conference: 'conferencePaper',
  report: 'report',
  institutional: 'report',
  preprint: 'preprint',
  software: 'computerProgram',
  webpage: 'webpage',
  book: 'book',
};

/** Split "Anderson, D.; Belcineanu, A." into Zotero creator objects. */
export function buildCreators(authors) {
  return String(authors ?? '')
    .split(';')
    .map((author) => author.trim())
    .filter(Boolean)
    .map((author) => {
      const [family, given] = author.split(',').map((part) => part?.trim());
      if (family && given) return { creatorType: 'author', firstName: given, lastName: family };
      if (family) return { creatorType: 'author', name: family };
      return { creatorType: 'author', name: author };
    });
}

/** Map a bibliography entry into a Zotero item payload. Pure + tested. */
export function buildZoteroItem(input) {
  if (!input || typeof input.title !== 'string' || !input.title.trim()) {
    throw new Error('title is required');
  }
  const itemType = ZOTERO_TYPES[input.type] ?? 'journalArticle';
  const item = {
    itemType,
    title: input.title.trim(),
    creators: buildCreators(input.authors),
  };
  const year = Number(input.year);
  if (Number.isInteger(year) && year > 0) item.date = String(year);
  if (input.venue) item.publicationTitle = String(input.venue);
  if (input.doi) item.DOI = String(input.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (input.url) item.url = String(input.url);
  if (input.abstractNote) item.abstractNote = String(input.abstractNote).slice(0, 4000);
  return item;
}

/**
 * POST /api/zotero/items — add an entry to the configured Zotero library.
 *
 * Requires an authenticated session (it writes to the operator's library) and
 * `ZOTERO_USER_ID` + `ZOTERO_API_KEY` with write access on the server.
 * Group libraries can be targeted with ZOTERO_LIBRARY_TYPE=group and
 * ZOTERO_LIBRARY_ID.
 */
export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('POST, OPTIONS');
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let user = null;
  try {
    user = await getRequestUser(request);
  } catch {
    return json({ error: 'User store unavailable' }, 503);
  }
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const apiKey = process.env.ZOTERO_API_KEY || '';
  const libraryType = (process.env.ZOTERO_LIBRARY_TYPE || 'user').toLowerCase() === 'group' ? 'groups' : 'users';
  const libraryId = process.env.ZOTERO_LIBRARY_ID || process.env.ZOTERO_USER_ID || '';
  if (!apiKey || !libraryId) {
    return json({ error: 'Zotero is not configured (ZOTERO_USER_ID / ZOTERO_API_KEY)' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  let item;
  try {
    item = buildZoteroItem(body ?? {});
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'invalid item' }, 400);
  }

  try {
    const res = await fetch(`https://api.zotero.org/${libraryType}/${encodeURIComponent(libraryId)}/items`, {
      method: 'POST',
      headers: {
        'Zotero-API-Key': apiKey,
        'Zotero-API-Version': '3',
        'Content-Type': 'application/json',
        'User-Agent': 'RiskSentinelResearch/1.0',
      },
      body: JSON.stringify([item]),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (res.status === 403) {
      return json({ error: 'Zotero rejected the write — the API key needs write access' }, 403);
    }
    if (!res.ok) {
      return json({ error: `Zotero HTTP ${res.status}`, detail: text.slice(0, 300) }, 502);
    }
    const created = JSON.parse(text);
    const first = created?.successful?.['0'] ?? Object.values(created?.successful ?? {})[0];
    return json({
      ok: true,
      key: first?.key ?? null,
      libraryUrl: first?.key ? `https://www.zotero.org/${libraryType === 'groups' ? 'groups' : 'my'}/${libraryId}/items/${first.key}` : null,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Zotero unreachable' }, 502);
  }
}
