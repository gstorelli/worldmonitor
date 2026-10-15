import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGdacs, gdacsUrl } from '../scripts/seed-natural-events.mjs';

function feature(type, id, alertlevel) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [127.89, 1.69] },
    properties: { eventtype: type, eventid: id, alertlevel, name: `${type} ${id}`, fromdate: '2026-05-08T09:10:00', url: {} },
  };
}

describe('GDACS fetch', () => {
  it('asks the MAP endpoint once per event type', () => {
    assert.match(gdacsUrl('VO'), /geteventlist\/MAP\?eventtype=VO$/);
  });

  it('merges the types, keeps orange and red alerts, maps volcanoes', async () => {
    const seen = [];
    const fetchFn = async (url) => {
      seen.push(new URL(url).searchParams.get('eventtype'));
      const type = new URL(url).searchParams.get('eventtype');
      const features = type === 'VO' ? [feature('VO', 1, 'Orange'), feature('VO', 2, 'Green')] : type === 'FL' ? [feature('FL', 3, 'Red')] : [];
      return new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200 });
    };
    const events = await fetchGdacs(fetchFn);
    assert.deepEqual(seen.sort(), ['DR', 'EQ', 'FL', 'TC', 'VO', 'WF']);
    assert.deepEqual(events.map((e) => [e.id, e.category]).sort(), [['gdacs-FL-3', 'floods'], ['gdacs-VO-1', 'volcanoes']]);
  });

  it('reads a 404 as no current events of that type', async () => {
    const fetchFn = async (url) => {
      const type = new URL(url).searchParams.get('eventtype');
      if (type === 'VO') return new Response('{"status":404}', { status: 404 });
      return new Response(JSON.stringify({ features: type === 'FL' ? [feature('FL', 3, 'Red')] : [] }), { status: 200 });
    };
    const events = await fetchGdacs(fetchFn);
    assert.deepEqual(events.map((e) => e.id), ['gdacs-FL-3']);
  });

  it('fails only when every type fails', async () => {
    const fetchFn = async () => new Response('{"message":"Eventtype is required."}', { status: 400 });
    await assert.rejects(fetchGdacs(fetchFn), /all types failed/);
  });
});
