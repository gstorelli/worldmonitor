import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDigestSignals } from '../src/services/customs-events.ts';

function stubDigest(sections: unknown[]): void {
  globalThis.fetch = (async () => new Response(JSON.stringify({ digest: { sections } }), { status: 200 })) as typeof fetch;
}

describe('fetchDigestSignals', () => {
  it('keeps the source severity and source, normalising Open-Meteo enum names', async () => {
    stubDigest([
      { topic: 'climate', items: [{ title: 'Suez / Red Sea', severity: 'ANOMALY_SEVERITY_NORMAL', source: 'openmeteo', score: 0 }] },
      { topic: 'seismic', items: [{ title: 'M5.1', severity: 'moderate', source: 'usgs', url: 'https://earthquake.usgs.gov/x' }] },
    ]);
    const [climate, quake] = await fetchDigestSignals();
    assert.equal(climate?.sourceSeverity, 'normal');
    assert.equal(climate?.severity, 'low');
    assert.equal(climate?.source, 'openmeteo');
    assert.equal(quake?.url, 'https://earthquake.usgs.gov/x');
  });

  it('drops non-http links', async () => {
    stubDigest([{ topic: 'x', items: [{ title: 't', url: 'javascript:alert(1)' }] }]);
    const [item] = await fetchDigestSignals();
    assert.equal(item?.url, undefined);
  });
});
