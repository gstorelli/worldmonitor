/**
 * Risk Sentinel — intelligence digest endpoint (fork-native notifications).
 *
 * GET /api/notify/digest?topics=chokepoints,commodities&limit=5
 *   → { digest: { sections: [{ topic, title, items: [{ title, summary,
 *        url, severity, score, source }] }], fetchedAt }
 *
 * Aggregates the dedicated n8n keys (risk_sentinel:n8n:*) plus the EU acts
 * from CELLAR (policy:eu-acts:v1) and the legacy policy monitor
 * (policy:monitor:v1) into a delivery-ready digest. The n8n workflow
 * "07-intelligence-notifications" consumes this endpoint to compose
 * Telegram/email messages according to notify:config:v1.
 *
 * Policy items from policy:eu-acts:v1 carry extra fields: celex,
 * documentDate, goods (thesis HS headings) and match ('cn' when the title
 * cites a CN code of a heading, else 'keyword': a title keyword, to verify).
 * Optional `actsDays=1..30` sets their window (see euActsWindow).
 */

import { getPublicCorsHeaders } from '../_cors.js';

// Fork (13/10/2026): ACLED is excluded by licence and its n8n key is retired,
// so the `conflicts` topic (ACLED only) is gone and `chokepoints` reads the
// seismic feed only. Conflict events come from UCDP, which has its own panel
// and is not part of this digest. An unknown topic in a request is ignored.
const EU_ACTS_KEY = 'policy:eu-acts:v1';
const NOTIFY_CONFIG_KEY = 'notify:config:v1';

// The 8 HS headings of the thesis (mirror of GOOD_KEYWORDS in
// scripts/_policy-eu-acts.mjs; edge files cannot import scripts/).
export const THESIS_HEADINGS = new Set(['8542', '7403', '7502', '7601', '2709', '2711', '1001', '3105']);
const MAX_ACTS_DAYS = 30; // = ACTS_WINDOW_DAYS of the seeder: older acts are not in the key

const TOPIC_SOURCES = {
  chokepoints: ['risk_sentinel:n8n:usgs'],
  commodities: ['risk_sentinel:n8n:commodities', 'risk_sentinel:n8n:gdelt'],
  // UN Comtrade concentration materializer: single-supplier dependency per
  // HS4 (n8n workflow 10). Kept as its own topic so the OSINT workspace and
  // the notification workflow can surface trade-dependency signals next to —
  // not buried under — the price feeds.
  trade: ['risk_sentinel:n8n:comtrade'],
  climate: ['risk_sentinel:n8n:openmeteo'],
  seismic: ['risk_sentinel:n8n:usgs'],
  // CELLAR acts first (scripts/seed-policy-eu-acts.mjs). policy:monitor:v1 is
  // LEGACY: written by n8n workflow 06, retired on 12-13/11/2026 (EUR-Lex
  // search answers automated requests with a bot challenge). Still read so a
  // stale key keeps working until the workflow is deactivated.
  policy: [EU_ACTS_KEY, 'policy:monitor:v1'],
};

const TOPIC_LABELS = {
  chokepoints: 'Chokepoints & Trade Routes',
  commodities: 'Commodities & Customs',
  trade: 'Trade Concentration (HS4)',
  climate: 'Climate Anomalies',
  seismic: 'Seismic Activity',
  policy: 'Policy Monitor (EU)',
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

async function redisGet(url, token, key) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
    signal: AbortSignal.timeout(3_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const rawValue = data?.result ?? null;
  if (rawValue === null) return null;
  if (typeof rawValue !== 'string') return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function severityRank(item) {
  const sev = String(item.severity || item.riskLevel || item.alertLevel || '').toLowerCase();
  if (sev.includes('critical') || sev.includes('extreme')) return 4;
  if (sev.includes('high') || sev.includes('elevated')) return 3;
  if (sev.includes('moderate')) return 2;
  if (sev.includes('low') || sev.includes('normal')) return 1;
  return 0;
}

function scoreOf(item) {
  const n = Number(item.tradeImpactScore ?? item.severityScore ?? item.riskScore ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDigestItem(source, item) {
  const severity = String(item.severity || item.riskLevel || item.alertLevel || 'moderate');
  const url = item.url || item.sourceUrl || '';
  return {
    title: String(item.title || item.place || item.zone || item.symbol || item.name || 'Signal'),
    summary: String(item.summary || item.matchedRoute || item.nearChokepoint || item.country || item.metadata?.description || ''),
    url,
    severity,
    score: scoreOf(item),
    source,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Stateless de-duplication of EU acts: the digest keeps no "already sent"
 * list, so an act is delivered when its documentDate (the date of the act,
 * day granularity) falls in a window of complete UTC days that consecutive
 * sends do not overlap. Workflow 07 ticks hourly and sends daily/weekly
 * digests at 07 UTC (weekly on Monday), so:
 *   - weekly           → the 7 days before today;
 *   - daily            → yesterday;
 *   - hourly/realtime  → yesterday, only in the 07 UTC tick (otherwise the
 *                        same act would repeat on every tick of the day).
 * `actsDays` (query) forces the last N complete days with no hour gate, for
 * manual calls. Limitation: an act that reaches CELLAR after its window has
 * closed (publication after the document date) is never delivered; only a
 * stateful "sent" set would avoid that.
 * Returns { from, to } (from inclusive, to exclusive) or null for no acts.
 */
export function euActsWindow(now, frequency, actsDays) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let days = actsDays;
  if (days == null) {
    if (frequency === 'weekly') days = 7;
    else if (frequency === 'daily') days = 1;
    else if (now.getUTCHours() === 7) days = 1;
    else return null;
  }
  return { from: isoDay(today - days * DAY_MS), to: isoDay(today) };
}

/** CELLAR acts touching a thesis heading in the window, CN-matched first. */
export function euActsItems(raw, window) {
  const acts = Array.isArray(raw?.acts) ? raw.acts : [];
  const items = [];
  for (const act of acts) {
    if (!act || typeof act !== 'object') continue;
    const date = String(act.documentDate || act.date || '');
    if (!(date >= window.from && date < window.to)) continue;
    const matches = (Array.isArray(act.goodMatches) ? act.goodMatches : [])
      .filter((g) => g && THESIS_HEADINGS.has(String(g.hs)));
    if (matches.length === 0) continue;
    const cn = matches.filter((g) => g.match === 'cn').map((g) => String(g.hs));
    const kw = matches.filter((g) => g.match !== 'cn').map((g) => String(g.hs));
    const tags = [cn.length ? `NC ${cn.join(', ')}` : '', kw.length ? `parola chiave ${kw.join(', ')}` : '']
      .filter(Boolean).join(' · ');
    items.push({
      title: `[${tags}] ${String(act.title || act.celex || 'Atto UE')}`,
      summary: `CELEX ${act.celex || 'n.d.'}, atto del ${date}${kw.length && !cn.length ? ' (corrispondenza per parola chiave nel titolo: da verificare)' : ''}`,
      url: String(act.url || ''),
      severity: 'moderate', // the digest default for unlabelled items: no risk claim
      score: 0,
      source: 'eu-acts',
      celex: act.celex ?? null,
      documentDate: date,
      goods: matches.map((g) => String(g.hs)),
      match: cn.length ? 'cn' : 'keyword',
    });
  }
  // CN-matched acts first, then newest first.
  return items.sort((a, b) => (a.match === b.match ? 0 : a.match === 'cn' ? -1 : 1)
    || (a.documentDate < b.documentDate ? 1 : a.documentDate > b.documentDate ? -1 : 0));
}

function sectionFor(topic, items) {
  return { topic, title: TOPIC_LABELS[topic] || topic, items };
}

export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, OPTIONS');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const restUrl = process.env.UPSTASH_REDIS_REST_URL || '';
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!restUrl || !restToken) {
    return json({ error: 'Redis not configured' }, 500);
  }

  const url = new URL(request.url);
  const requestedTopics = (url.searchParams.get('topics') || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && Object.prototype.hasOwnProperty.call(TOPIC_SOURCES, t));
  const topics = requestedTopics.length > 0 ? requestedTopics : Object.keys(TOPIC_SOURCES);

  const rawLimit = Number(url.searchParams.get('limit') || DEFAULT_LIMIT);
  const limit = Math.min(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, MAX_LIMIT);
  const rawActsDays = Number.parseInt(url.searchParams.get('actsDays') || '', 10);
  const actsDays = Number.isFinite(rawActsDays) ? Math.min(Math.max(rawActsDays, 1), MAX_ACTS_DAYS) : null;

  const sections = [];
  for (const topic of topics) {
    const keys = TOPIC_SOURCES[topic];
    const items = [];
    for (const key of keys) {
      const raw = await redisGet(restUrl, restToken, key).catch(() => null);
      if (raw == null) continue;
      if (key === EU_ACTS_KEY) {
        // Only the frequency is read from the config; nothing of it is returned.
        const frequency = actsDays == null
          ? (await redisGet(restUrl, restToken, NOTIFY_CONFIG_KEY).catch(() => null))?.frequency || 'hourly'
          : null;
        const window = euActsWindow(new Date(), frequency, actsDays);
        if (window) items.push(...euActsItems(raw, window).slice(0, limit * 2));
        continue;
      }
      const list = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
      for (const item of list.slice(0, limit * 2)) {
        if (item && typeof item === 'object') items.push(toDigestItem(key.split(':').pop(), item));
      }
    }
    items.sort((a, b) => severityRank(b) - severityRank(a) || b.score - a.score);
    sections.push(sectionFor(topic, items.slice(0, limit)));
  }

  return json({
    digest: { sections: sections.filter((s) => s.items.length > 0) },
    fetchedAt: new Date().toISOString(),
  });
}
