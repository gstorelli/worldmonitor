// EU and Italian trade data for the 8 strategic goods of the thesis (thesis
// issue #91). Pure helpers, tested in tests/eu-trade.test.mjs; the seeder is
// scripts/seed-eu-trade.mjs.
//
//  - Imports: Eurostat Comext DS-045409 (European source preferred by the
//    thesis), Italy and EU27 as reporters, value in euro, by partner.
//  - Duties: WTO Timeseries, EU (918) MFN simple average ad valorem duty per
//    HS 6-digit subheading (HS_A_0010) and lowest preferential duty (HS_P_0070).

export const EU_TRADE_KEY = 'trade:eu-goods:v1';
export const THESIS_HS4 = ['8542', '7403', '7502', '7601', '2709', '2711', '1001', '3105'];
export const COMEXT_BASE = 'https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/DS-045409';
export const WTO_BASE = 'https://api.wto.org/timeseries/v1/data';

export const EU27 = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);

export function comextUrl(reporter, hs4, year) {
  const q = new URLSearchParams({ format: 'JSON', lang: 'en', reporter, product: hs4, flow: '1', indicators: 'VALUE_IN_EUROS', freq: 'A', time: String(year) });
  return `${COMEXT_BASE}?${q}`;
}

/** Partner code → value from a Comext JSON-stat answer with one value per partner. */
export function comextValuesByPartner(json) {
  const cat = json?.dimension?.partner?.category;
  if (!cat?.index || !json?.value) return {};
  const ids = json.id ?? [];
  const sizes = json.size ?? [];
  const pi = ids.indexOf('partner');
  if (pi < 0) return {};
  let stride = 1;
  for (const s of sizes.slice(pi + 1)) stride *= s;
  const byIndex = Object.fromEntries(Object.entries(cat.index).map(([code, i]) => [i, code]));
  const out = {};
  for (const [k, v] of Object.entries(json.value)) {
    const code = byIndex[Math.floor(Number(k) / stride) % sizes[pi]];
    if (code && typeof v === 'number') out[code] = v;
  }
  return out;
}

/**
 * Import summary for one reporter. Italy: shares of total imports (all
 * partners, intra-EU included). EU27: shares of extra-EU imports, partners
 * outside the Union only.
 */
export function summariseImports(reporter, year, values, labels = {}) {
  const isEu = reporter === 'EU27_2020';
  const extraEu = values.EXT_EU27_2020 ?? null;
  const total = isEu ? extraEu : values.WORLD ?? null;
  const partners = Object.entries(values)
    .filter(([code]) => /^[A-Z]{2}$/.test(code) && !(isEu && EU27.has(code)))
    .sort((a, b) => b[1] - a[1]);
  return {
    reporter,
    year,
    totalEur: total,
    extraEuEur: extraEu,
    basis: isEu ? 'extra-EU imports' : 'total imports',
    top: partners.slice(0, 3).map(([code, value]) => ({
      code,
      label: labels[code] ?? code,
      valueEur: value,
      share: total ? value / total : null,
    })),
  };
}

export function wtoUrl(indicator, hs4, years) {
  const q = new URLSearchParams({ i: indicator, r: '918', pc: hs4, ps: years.join(','), fmt: 'json', mode: 'full', spc: 'true' });
  return `${WTO_BASE}?${q}`;
}

/**
 * Latest-year duty per HS6 subheading. MFN: one value per subheading. The
 * preferential indicator comes per partner/scheme: keep the lowest.
 */
export function dutiesBySubheading(mfnRows, prefRows) {
  const latest = (rows) => {
    const byCode = new Map();
    for (const r of rows ?? []) {
      const code = String(r?.ProductOrSectorCode ?? '');
      if (!/^\d{6}$/.test(code)) continue;
      const year = Number(r.Year);
      const value = typeof r.Value === 'number' ? r.Value : null;
      const cur = byCode.get(code);
      if (!cur || year > cur.year) byCode.set(code, { year, values: [value], label: String(r.ProductOrSector ?? '') });
      else if (year === cur.year) cur.values.push(value);
    }
    return byCode;
  };
  const mfn = latest(mfnRows);
  const pref = latest(prefRows);
  return [...mfn.entries()]
    .map(([code, m]) => {
      const p = pref.get(code);
      const prefValues = (p?.values ?? []).filter((v) => typeof v === 'number');
      return {
        hs6: code,
        label: m.label,
        year: m.year,
        mfn: m.values.find((v) => typeof v === 'number') ?? null,
        prefMin: prefValues.length ? Math.min(...prefValues) : null,
      };
    })
    .sort((a, b) => a.hs6.localeCompare(b.hs6));
}
