import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.example';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
process.env.WM_SESSION_SECRET = 'test-session-secret';
process.env.AUTH_REQUIRED = 'true';

const store = new Map();
globalThis.fetch = async (_url, opts) => {
  const command = JSON.parse(opts.body || '[]');
  const [verb, key, value] = command;
  if (verb === 'GET') {
    return new Response(JSON.stringify({ result: store.has(key) ? store.get(key) : null }), { status: 200 });
  }
  if (verb === 'SET') {
    store.set(key, value);
    return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: 'unsupported' }), { status: 400 });
};

const { normalizeCrossrefWork } = await import(pathToFileURL(resolve(root, 'api/research/doi.js')).href);
const { normalizeOpenAlexWork } = await import(pathToFileURL(resolve(root, 'api/research/papers.js')).href);
const { buildCreators, buildZoteroItem } = await import(pathToFileURL(resolve(root, 'api/zotero/items.js')).href);
const { default: researchHandler } = await import(pathToFileURL(resolve(root, 'api/prefs/research.js')).href);
const users = await import(pathToFileURL(resolve(root, 'api/_users.js')).href);
const { default: loginHandler } = await import(pathToFileURL(resolve(root, 'api/auth/login.js')).href);

const BASE = 'https://risksentinel.example';

describe('research metadata normalizers', () => {
  it('normalizes a Crossref work', () => {
    const work = normalizeCrossrefWork({
      DOI: '10.1/x',
      title: ['Customs Risk'],
      author: [{ family: 'Doe', given: 'J.' }, { family: 'Roe', given: 'A.' }],
      issued: { 'date-parts': [[2024, 1, 1]] },
      'container-title': ['Journal of Trade'],
      URL: 'https://doi.org/10.1/x',
      type: 'journal-article',
    });
    assert.equal(work.found, true);
    assert.equal(work.authors, 'Doe, J.; Roe, A.');
    assert.equal(work.year, 2024);
    assert.equal(work.venue, 'Journal of Trade');
    assert.equal(normalizeCrossrefWork(null).found, false);
  });

  it('normalizes an OpenAlex work and rebuilds the abstract', () => {
    const item = normalizeOpenAlexWork({
      id: 'https://openalex.org/W1',
      title: 'Port disruption early warning',
      publication_year: 2025,
      publication_date: '2025-03-01',
      doi: 'https://doi.org/10.2/y',
      cited_by_count: 3,
      authorships: [{ author: { display_name: 'Jane Doe' } }],
      primary_location: { source: { display_name: 'Maritime Journal' }, landing_page_url: 'https://x/1' },
      abstract_inverted_index: { Port: [0], disruption: [1], early: [2], warning: [3] },
    });
    assert.equal(item.title, 'Port disruption early warning');
    assert.equal(item.abstract, 'Port disruption early warning');
    assert.equal(item.doi, '10.2/y');
    assert.equal(normalizeOpenAlexWork(null), null);
  });
});

describe('zotero item builder', () => {
  it('maps bibliography entries to Zotero payloads', () => {
    const item = buildZoteroItem({
      title: 'Customs Risk',
      authors: 'Doe, J.; Roe, A.',
      year: 2024,
      type: 'journal',
      venue: 'Journal of Trade',
      doi: 'https://doi.org/10.1/x',
      url: 'https://x',
    });
    assert.equal(item.itemType, 'journalArticle');
    assert.deepEqual(item.creators[0], { creatorType: 'author', firstName: 'J.', lastName: 'Doe' });
    assert.equal(item.DOI, '10.1/x');
    assert.equal(item.date, '2024');
    assert.equal(buildCreators('European Commission')[0].name, 'European Commission');
  });

  it('rejects entries without a title', () => {
    assert.throws(() => buildZoteroItem({ authors: 'X' }), /title is required/);
  });
});

describe('api/prefs/research', () => {
  async function cookie() {
    await users.createUser({ username: 'researcher', password: 'researcher-pass', role: 'user' });
    const res = await loginHandler(new Request(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'researcher', password: 'researcher-pass' }),
    }));
    const match = /rs_session=([^;]*)/.exec(res.headers.get('set-cookie') || '');
    return match ? `rs_session=${match[1]}` : '';
  }

  it('returns null without a session and rejects anonymous writes', async () => {
    const anon = await researchHandler(new Request(`${BASE}/api/prefs/research`));
    assert.equal((await anon.json()).research, null);
    const write = await researchHandler(new Request(`${BASE}/api/prefs/research`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ research: {} }),
    }));
    assert.equal(write.status, 401);
  });

  it('validates and round-trips the research state', async () => {
    const session = await cookie();
    const invalid = await researchHandler(new Request(`${BASE}/api/prefs/research`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: session },
      body: JSON.stringify({ research: { notes: { '1': 'ok', bad: 'x' } } }),
    }));
    assert.equal(invalid.status, 400);

    const payload = {
      notes: { '1': 'nota' },
      reading: { '1': { state: 'reviewed', priority: 'high', tags: ['customs'] } },
      overrides: { '1': { doi: '10.1/x', year: 2024 } },
      imported: [{ ref: 1000, title: 'Importata', authors: '', year: 0, type: 'preprint', venue: '', doi: null, url: '', themeArea: '', summary: '', limitation: '', contribution: '', dimensions: [], verified: false }],
    };
    const put = await researchHandler(new Request(`${BASE}/api/prefs/research`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: session },
      body: JSON.stringify({ research: payload }),
    }));
    assert.equal(put.status, 200);

    const get = await researchHandler(new Request(`${BASE}/api/prefs/research`, { headers: { Cookie: session } }));
    const body = await get.json();
    assert.equal(body.research.notes['1'], 'nota');
    assert.equal(body.research.reading['1'].state, 'reviewed');
    assert.equal(body.research.imported.length, 1);
  });
});
