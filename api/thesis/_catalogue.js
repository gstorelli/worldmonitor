// Earthquake catalogue normalisation for /api/thesis/triggers.
// Kept free of runtime-specific imports so it can be unit tested.

export const EMSC_URL = 'https://www.seismicportal.eu/fdsnws/event/1/query';
export const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

export function isoStart(nowMs, days) {
  return new Date(nowMs - days * 86_400_000).toISOString().slice(0, 19);
}

export function emscQueryUrl(nowMs, days, minMag) {
  const q = new URLSearchParams({ format: 'json', minmag: String(minMag), starttime: isoStart(nowMs, days), orderby: 'time', limit: '3000' });
  return `${EMSC_URL}?${q}`;
}

export function usgsQueryUrl(nowMs, days, minMag) {
  const q = new URLSearchParams({ format: 'geojson', minmagnitude: String(minMag), starttime: isoStart(nowMs, days), orderby: 'time', limit: '3000' });
  return `${USGS_URL}?${q}`;
}

function num(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** EMSC FDSN JSON (GeoJSON FeatureCollection, properties lat/lon/depth/mag/magtype/time/flynn_region/unid). */
export function parseEmsc(json) {
  const out = [];
  for (const f of json?.features || []) {
    const p = f?.properties || {};
    const coords = f?.geometry?.coordinates || [];
    const lat = num(p.lat) ?? num(coords[1]);
    const lon = num(p.lon) ?? num(coords[0]);
    const mag = num(p.mag);
    const t = Date.parse(p.time || '');
    if (lat === null || lon === null || mag === null || !Number.isFinite(t)) continue;
    const depth = num(p.depth) ?? (num(coords[2]) !== null ? Math.abs(num(coords[2])) : null);
    const id = String(p.unid || f.id || `${t}-${lat}-${lon}`);
    out.push({
      id: `emsc-${id}`,
      time: t,
      lat,
      lon,
      depthKm: depth,
      mag,
      magType: String(p.magtype || ''),
      place: String(p.flynn_region || '').trim(),
      url: p.unid ? `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(p.unid)}` : undefined,
      source: 'EMSC',
    });
  }
  return out;
}

/** USGS FDSN GeoJSON (properties mag/magType/place/time/url; geometry lon, lat, depth). */
export function parseUsgs(json) {
  const out = [];
  for (const f of json?.features || []) {
    const p = f?.properties || {};
    const c = f?.geometry?.coordinates || [];
    const lon = num(c[0]);
    const lat = num(c[1]);
    const mag = num(p.mag);
    const t = num(p.time);
    if (lat === null || lon === null || mag === null || t === null) continue;
    out.push({
      id: `usgs-${f.id}`,
      time: t,
      lat,
      lon,
      depthKm: num(c[2]),
      mag,
      magType: String(p.magType || ''),
      place: String(p.place || '').trim(),
      url: p.url || undefined,
      source: 'USGS',
    });
  }
  return out;
}
