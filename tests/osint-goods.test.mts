import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMS_PROVENANCE_LABELS,
  customsLayer,
  customsText,
  isoDateIt,
  ITALY_SHARES_LABEL,
  LAYERS_NOTE,
  measureText,
  NO_NODE_SHARE,
  NO_QUOTE,
  PRICE_LABEL,
  SUPPLY_MISSING,
  supplyLayer,
  supplyText,
} from '../src/apps/osint/goods.ts';
import type { OsintEuSupplyProduct } from '../src/apps/osint/model.ts';
import type { CustomsRegistryEntry } from '../src/services/thesis/customs-registry.ts';
import { supplyFromIndicators } from '../src/services/thesis/engine.ts';

const product = (supply: OsintEuSupplyProduct['supply'], hs4 = '8542'): OsintEuSupplyProduct => ({ hs4, year: 2025, extraEuEur: 1e9, supply });
const at = (d: string) => Date.parse(d);
const entry = (over: Partial<CustomsRegistryEntry>): CustomsRegistryEntry => ({
  id: 'test-measure',
  role: 'modulatore',
  statusCode: 'verificata',
  goods: ['9999'],
  celex: null,
  inForceFrom: '2025-01-01',
  expiresOn: null,
  channels: ['origin', 'value'],
  ...over,
});

describe('OSINT goods: S (EU27 extra-EU supply)', () => {
  it('computes S with the engine only where the good has node origins', () => {
    const l = supplyLayer(product({ hhi: 0.4, nodeOrigins: ['TW'], nodeOriginShare: 0.6 }));
    assert.equal(l.s, supplyFromIndicators(0.6, 0.4));
    assert.equal(l.note, null);
    assert.match(supplyText(l), /HHI 0,40 · quota dalle origini dei nodi \(TW\) 60% → S = 0,50 · anno 2025/);
  });

  it('shows the HHI only, and says why, when no production node supplies the good', () => {
    const l = supplyLayer(product({ hhi: 0.21, nodeOrigins: [], nodeOriginShare: 0.3 }, '2709'));
    assert.equal(l.s, null);
    assert.equal(l.nodeOriginShare, null);
    assert.equal(l.note, NO_NODE_SHARE);
    const text = supplyText(l);
    assert.match(text, /^HHI 0,21/);
    assert.ok(text.includes('quota dei nodi: non applicabile (nessun nodo produttivo)'));
    assert.ok(!text.includes('S ='));
  });

  it('does not compute S when an indicator is missing', () => {
    const l = supplyLayer(product({ hhi: null, nodeOrigins: ['CL'], nodeOriginShare: 0.5 }, '7403'));
    assert.equal(l.s, null);
    assert.match(supplyText(l), /S non calcolabile/);
  });

  it('reports missing indicators, never a zero', () => {
    assert.equal(supplyLayer(null).s, null);
    assert.equal(supplyText(supplyLayer(null)), SUPPLY_MISSING);
    assert.equal(supplyText(supplyLayer(product(null))), SUPPLY_MISSING);
  });
});

describe('OSINT goods: C (customs channels as of now)', () => {
  it('uses the dated register when a verified measure is in force', () => {
    const l = customsLayer({ entries: [entry({ celex: '32025R0001', expiresOn: '2030-06-30' })] }, '9999', at('2026-11-13'));
    assert.equal(l.provenance, 'registry');
    assert.equal(l.label, 'dal registro datato');
    assert.deepEqual(l.channels, ['origin', 'value']);
    assert.equal(l.c, 2 / 3);
    assert.equal(customsText(l), '2 canali su 3 (origine, valore) → C = 0,67');
    assert.equal(l.measures.length, 1);
    assert.equal(measureText(l.measures[0]!), 'test-measure (verificata, in vigore dal 01/01/2025, scade il 30/06/2030, CELEX 32025R0001)');
  });

  it('labels the undated fallback as provisional (live mode)', () => {
    // 8542 has a hand-written fallback in GOOD_CHANNELS and no dated register entry here.
    const l = customsLayer({ entries: [entry({ goods: ['8542'], inForceFrom: null })] }, '8542', at('2026-11-13'));
    assert.equal(l.provenance, 'fallback');
    assert.equal(l.label, 'valore provvisorio, senza data di entrata in vigore');
    assert.ok(l.channels && l.channels.length > 0);
    assert.equal(l.c, l.channels!.length / 3);
    assert.deepEqual(l.measures, []);
  });

  it('is not computable when no measure is listed', () => {
    for (const reg of [null, { entries: [] }, { entries: [entry({ statusCode: 'in-riesame' })] }, { entries: [entry({ expiresOn: '2026-01-01' })] }]) {
      const l = customsLayer(reg, '9999', at('2026-11-13'));
      assert.equal(l.provenance, 'none');
      assert.equal(l.channels, null);
      assert.equal(l.c, null);
      assert.equal(l.label, 'misure non elencate: C non calcolabile');
      assert.equal(customsText(l), CUSTOMS_PROVENANCE_LABELS.none);
    }
  });
});

describe('OSINT goods: labels', () => {
  it('states the basis of the Italy shares and of the prices', () => {
    assert.equal(ITALY_SHARES_LABEL, 'Italia, paese di provenienza (intra-UE incluso)');
    assert.equal(PRICE_LABEL, 'indicatore indiretto (quotazione di mercato)');
    assert.equal(NO_QUOTE, 'nessuna quotazione disponibile');
  });

  it('never presents a combined score', () => {
    assert.match(LAYERS_NOTE, /non sono combinati in un punteggio/);
    for (const s of [LAYERS_NOTE, ...Object.values(CUSTOMS_PROVENANCE_LABELS)]) assert.ok(!/\b(R0|F1|F2)\b/.test(s));
  });

  it('formats ISO dates without time zones', () => {
    assert.equal(isoDateIt('2026-11-19'), '19/11/2026');
    assert.equal(isoDateIt('n.d.'), 'n.d.');
  });
});
