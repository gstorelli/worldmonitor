// Critical nodes of the thesis model for seeders, which cannot import from src/
// (see the railway guard). Mirror of src/config/node-hazards.ts (id, name,
// reference point); tests/thesis-nodes-mirror.test.mts keeps the two aligned.
export const THESIS_NODES = [
  { id: 'suez', name: 'Suez', lat: 30.6, lon: 32.33 },
  { id: 'bab-el-mandeb', name: 'Bab el-Mandeb', lat: 12.6, lon: 43.33 },
  { id: 'hormuz', name: 'Hormuz', lat: 26.57, lon: 56.25 },
  { id: 'malacca', name: 'Malacca', lat: 2.5, lon: 101.4 },
  { id: 'taiwan-strait', name: 'Taiwan Strait', lat: 24.0, lon: 119.5 },
  { id: 'panama', name: 'Panama', lat: 9.08, lon: -79.68 },
  { id: 'gibraltar', name: 'Gibraltar', lat: 35.95, lon: -5.6 },
  { id: 'antofagasta', name: 'Antofagasta', lat: -23.3, lon: -69.0 },
  { id: 'morowali', name: 'Morowali', lat: -2.83, lon: 122.16 },
  { id: 'weda-bay', name: 'Weda Bay', lat: 0.47, lon: 127.94 },
  { id: 'hsinchu', name: 'Hsinchu', lat: 24.78, lon: 121.01 },
  { id: 'tainan', name: 'Tainan', lat: 23.11, lon: 120.27 },
];

/**
 * Bounding box "west,south,east,north" of about `radiusKm` around a point
 * (degrees of latitude ~111 km; longitude scaled by cos(latitude)).
 */
export function bboxAround(lat, lon, radiusKm = 300) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  const r = (x) => Math.round(x * 100) / 100;
  return [r(lon - dLon), r(Math.max(lat - dLat, -90)), r(lon + dLon), r(Math.min(lat + dLat, 90))].join(',');
}
