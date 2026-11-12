import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMirror } from '../scripts/build-policy-registry-mirror.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(readFileSync(resolve(root, 'data/policy-registry.json'), 'utf8'));
const entries = registry.entries;

const THESIS_HS4 = ['8542', '7403', '7502', '7601', '2709', '2711', '1001', '3105'];
const CHANNELS = ['origin', 'value', 'classification'];
const KINDS = ['origin-specific', 'erga-omnes-duty', 'export-restriction', 'sanctions-priority', 'framework'];
const ROLES = ['modulatore', 'quadro'];
const STATUS_CODES = ['verificata', 'in-riesame', 'da-verificare'];
const V3_FIELDS = ['celex', 'inForceFrom', 'expiresOn', 'origins', 'cn', 'channels', 'kind', 'role', 'statusCode', 'verifiedOn'];
const V2_FIELDS = ['id', 'title', 'jurisdiction', 'topic', 'reference', 'url', 'riskCategories', 'chokepoints', 'summary', 'gap', 'customsImplication', 'status', 'role', 'goods', 'thesisKey'];

function isIsoDateOrNull(v) {
  if (v === null) return true;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isStringArrayOrNull(v, pattern) {
  if (v === null) return true;
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && pattern.test(x)) && new Set(v).size === v.length;
}

describe('data/policy-registry.json schema v3', () => {
  it('declares schema_version 3 and has unique ids', () => {
    assert.equal(registry.schema_version, 3);
    assert.ok(Array.isArray(entries) && entries.length > 0);
    assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  });

  for (const e of entries) {
    describe(e.id, () => {
      it('keeps every v2 field and has every v3 field', () => {
        for (const f of [...V2_FIELDS, ...V3_FIELDS]) assert.ok(f in e, `missing ${f}`);
      });

      it('uses the enums', () => {
        assert.ok(ROLES.includes(e.role), `role ${e.role}`);
        assert.ok(STATUS_CODES.includes(e.statusCode), `statusCode ${e.statusCode}`);
        assert.ok(e.kind === null || KINDS.includes(e.kind), `kind ${e.kind}`);
        assert.ok(
          e.channels === null || (Array.isArray(e.channels) && e.channels.length > 0 && e.channels.every((c) => CHANNELS.includes(c)) && new Set(e.channels).size === e.channels.length),
          `channels ${JSON.stringify(e.channels)}`,
        );
      });

      it('stores ISO dates or null', () => {
        for (const f of ['inForceFrom', 'expiresOn', 'verifiedOn']) assert.ok(isIsoDateOrNull(e[f]), `${f} ${e[f]}`);
        if (e.inForceFrom && e.expiresOn) assert.ok(e.inForceFrom <= e.expiresOn, 'inForceFrom after expiresOn');
      });

      it('stores origins as ISO2, cn as digit codes, celex as string or null', () => {
        assert.ok(isStringArrayOrNull(e.origins, /^[A-Z]{2}$/), `origins ${JSON.stringify(e.origins)}`);
        assert.ok(isStringArrayOrNull(e.cn, /^\d{4,10}$/), `cn ${JSON.stringify(e.cn)}`);
        assert.ok(e.celex === null || (typeof e.celex === 'string' && e.celex.length > 0), `celex ${e.celex}`);
      });

      it('limits goods to the 8 thesis HS4 headings', () => {
        assert.ok(Array.isArray(e.goods));
        for (const g of e.goods) assert.ok(THESIS_HS4.includes(g), `goods ${g} is not a thesis heading (use cn)`);
      });

      it('keeps statusCode consistent with the free-text status', () => {
        if (/riesame/i.test(e.status)) assert.equal(e.statusCode, 'in-riesame');
        if (e.statusCode === 'verificata') assert.match(e.status, /^verificata\b/i);
      });
    });
  }

  it('warns (without failing) on verified entries without verifiedOn', () => {
    const undated = entries.filter((e) => e.statusCode === 'verificata' && e.verifiedOn === null).map((e) => e.id);
    if (undated.length) console.warn(`[policy-registry] verificata without verifiedOn: ${undated.join(', ')}`);
    assert.ok(true);
  });

  it('mirror generator output matches api/policy/_registry-data.js', () => {
    const onDisk = readFileSync(resolve(root, 'api/policy/_registry-data.js'), 'utf8');
    assert.equal(renderMirror(registry), onDisk);
  });
});
