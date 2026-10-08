import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AcledAccessError,
  fetchAcledEvents,
  fetchAcledToken,
  haversineKm,
  processEvents,
  TRADE_CHOKEPOINTS,
} from '../scripts/seed-acled-events.mjs';

function acledRow(overrides = {}) {
  return {
    event_id_cnty: 'TEST001',
    event_date: '2026-10-01',
    event_type: 'Battles',
    sub_event_type: 'Armed clash',
    country: 'Yemen',
    admin1: 'Taizz',
    latitude: '13.58',
    longitude: '44.02',
    fatalities: '0',
    actor1: 'Military Forces',
    actor2: '',
    source: 'ACLED',
    ...overrides,
  };
}

describe('haversineKm', () => {
  it('is zero for identical points and ~111 km per degree of latitude', () => {
    assert.equal(haversineKm(10, 20, 10, 20), 0);
    assert.ok(Math.abs(haversineKm(0, 0, 1, 0) - 111.19) < 0.5);
  });
});

describe('processEvents', () => {
  it('drops rows without usable coordinates', () => {
    const alerts = processEvents([
      acledRow({ event_id_cnty: 'ok' }),
      acledRow({ event_id_cnty: 'no-lat', latitude: '' }),
      acledRow({ event_id_cnty: 'bad-lat', latitude: '999' }),
      acledRow({ event_id_cnty: 'no-lon', longitude: 'nope' }),
    ]);
    assert.deepEqual(alerts.map((a) => a.id), ['acled-ok']);
  });

  it('scores an event near Bab el-Mandeb as critical with the chokepoint named', () => {
    const [alert] = processEvents([acledRow({ fatalities: '60' })]);
    assert.equal(alert.nearChokepoint, 'Red Sea / Bab el-Mandeb');
    assert.equal(alert.severityScore, 100);
    assert.equal(alert.severity, 'critical');
    assert.deepEqual(alert.coordinates, [44.02, 13.58]);
    assert.deepEqual(alert.location, { latitude: 13.58, longitude: 44.02 });
    assert.match(alert.summary, /60 fatalities/);
    assert.match(alert.summary, /Red Sea/);
    assert.equal(alert.title, 'Battles — Yemen');
  });

  it('applies the fatality thresholds and sorts by impact', () => {
    const alerts = processEvents([
      acledRow({ event_id_cnty: 'low', fatalities: '0', latitude: '48.0', longitude: '40.0' }),
      acledRow({ event_id_cnty: 'mid', fatalities: '10', latitude: '48.5', longitude: '40.5' }),
      acledRow({ event_id_cnty: 'high', fatalities: '50', latitude: '49.0', longitude: '41.0' }),
    ]);
    assert.deepEqual(alerts.map((a) => a.id), ['acled-high', 'acled-mid', 'acled-low']);
    assert.deepEqual(alerts.map((a) => a.severityScore), [100, 75, 20]);
    assert.deepEqual(alerts.map((a) => a.severity), ['critical', 'high', 'low']);
  });
  it('caps the published set', () => {
    const rows = Array.from({ length: 10 }, (_, i) => acledRow({ event_id_cnty: `e${i}` }));
    assert.equal(processEvents(rows, TRADE_CHOKEPOINTS, 4).length, 4);
  });
});

describe('fetchAcledToken', () => {
  it('posts the password grant and returns the access token', async () => {
    let seen;
    const token = await fetchAcledToken({
      baseUrl: 'https://acleddata.com',
      email: 'a@b.c',
      password: 'secret',
      fetchImpl: async (url, opts) => {
        seen = { url, method: opts.method, body: String(opts.body), contentType: opts.headers['Content-Type'] };
        return new Response(JSON.stringify({ access_token: 'tok-123' }), { status: 200 });
      },
    });
    assert.equal(token, 'tok-123');
    assert.equal(seen.url, 'https://acleddata.com/oauth/token');
    assert.equal(seen.method, 'POST');
    assert.equal(seen.contentType, 'application/x-www-form-urlencoded');
    assert.match(seen.body, /grant_type=password/);
    assert.match(seen.body, /client_id=acled/);
    assert.match(seen.body, /username=a%40b.c/);
  });

  it('fails loudly on invalid credentials', async () => {
    await assert.rejects(
      fetchAcledToken({
        baseUrl: 'https://acleddata.com',
        email: 'a@b.c',
        password: 'wrong',
        fetchImpl: async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      }),
      /HTTP 400\) — invalid_grant/,
    );
  });
});

describe('fetchAcledEvents', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');

  it('requests the 30-day window with the workflow event types', async () => {
    let requested;
    const data = await fetchAcledEvents({
      baseUrl: 'https://acleddata.com',
      token: 'tok',
      now,
      fetchImpl: async (url) => {
        requested = new URL(url);
        return new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200 });
      },
    });
    assert.deepEqual(data, [{ id: 1 }]);
    assert.equal(requested.pathname, '/api/acled/read');
    assert.equal(requested.searchParams.get('event_date'), '2026-09-08|2026-10-08');
    assert.equal(requested.searchParams.get('event_date_where'), 'BETWEEN');
    assert.match(requested.searchParams.get('event_type'), /Battles/);
  });

  it('turns "Access denied" into actionable entitlement guidance', async () => {
    await assert.rejects(
      fetchAcledEvents({
        baseUrl: 'https://acleddata.com',
        token: 'tok',
        now,
        fetchImpl: async () => new Response(JSON.stringify({ message: 'Access denied' }), { status: 403 }),
      }),
      (err) => {
        assert.ok(err instanceof AcledAccessError);
        assert.match(err.message, /Research\/Partner tier/);
        assert.match(err.message, /access@acleddata\.com/);
        return true;
      },
    );
  });
});
