/**
 * Seismic and volcanic hazard at the critical nodes of the thesis model.
 *
 * Static research data, computed offline by `research/hazard-stats/` from:
 *  - ISC-GEM Global Instrumental Earthquake Catalogue v12.1 (International
 *    Seismological Centre, 2025, doi:10.31905/D808B825; CC-BY-SA 3.0),
 *    main catalogue only, 1922-2021, moment magnitude Mw;
 *  - Smithsonian Global Volcanism Program, Volcanoes of the World (Holocene
 *    volcanoes v5.4.0; confirmed eruptions list of 2026-04-24), eruptions
 *    from 1922 to April 2026;
 *  - plate boundaries from Bird (2003), doi:10.1029/2001GC000252.
 *
 * Every count is within 300 km of the node reference point (a working
 * hypothesis, to be replaced by geologically defined zones). Aftershocks are
 * included. Taiwan Strait, Hsinchu and Tainan overlap and must not be summed.
 * EM-DAT impacts are deliberately NOT shipped here: its licence forbids
 * redistributing records.
 */

export type NodeKind = 'strait' | 'production';
export type NodeGood = 'copper' | 'nickel' | 'chips';

export interface NodeHazard {
  id: string;
  name: string;
  kind: NodeKind;
  good: NodeGood | null;
  lat: number;
  lon: number;
  /** Earthquakes Mw >= 6.0, 1922-2021. */
  m6: number;
  /** Earthquakes Mw >= 7.0, 1922-2021. */
  m7: number;
  mwMax: number;
  mwMaxDate: string;
  /** Confirmed eruptions since 1922. */
  eruptions: number;
  /** Distinct volcanoes with eruptions since 1922. */
  eruptingVolcanoes: number;
  veiMax: number | null;
  /** Distance to the nearest plate boundary (Bird, 2003). */
  plateBoundaryKm: number;
}

export const NODE_HAZARD_RADIUS_KM = 300;
export const NODE_HAZARD_PERIOD = '1922-2021';

export const NODE_HAZARDS: readonly NodeHazard[] = [
  { id: 'suez', name: 'Suez', kind: 'strait', good: null, lat: 30.6, lon: 32.33, m6: 1, m7: 0, mwMax: 6.10, mwMaxDate: '1993-08-03', eruptions: 0, eruptingVolcanoes: 0, veiMax: null, plateBoundaryKm: 260 },
  { id: 'bab-el-mandeb', name: 'Bab el-Mandeb', kind: 'strait', good: null, lat: 12.6, lon: 43.33, m6: 16, m7: 0, mwMax: 6.47, mwMaxDate: '1989-08-20', eruptions: 7, eruptingVolcanoes: 5, veiMax: 4, plateBoundaryKm: 74 },
  { id: 'hormuz', name: 'Hormuz', kind: 'strait', good: null, lat: 26.57, lon: 56.25, m6: 18, m7: 0, mwMax: 6.70, mwMaxDate: '1977-03-21', eruptions: 0, eruptingVolcanoes: 0, veiMax: null, plateBoundaryKm: 72 },
  { id: 'malacca', name: 'Malacca', kind: 'strait', good: null, lat: 2.5, lon: 101.4, m6: 6, m7: 0, mwMax: 6.58, mwMaxDate: '1926-06-28', eruptions: 2, eruptingVolcanoes: 1, veiMax: 2, plateBoundaryKm: 514 },
  { id: 'taiwan-strait', name: 'Taiwan Strait', kind: 'strait', good: null, lat: 24.0, lon: 119.5, m6: 174, m7: 19, mwMax: 7.81, mwMaxDate: '1951-11-24', eruptions: 0, eruptingVolcanoes: 0, veiMax: null, plateBoundaryKm: 106 },
  { id: 'panama', name: 'Panama', kind: 'strait', good: null, lat: 9.08, lon: -79.68, m6: 18, m7: 2, mwMax: 7.26, mwMaxDate: '1976-07-11', eruptions: 0, eruptingVolcanoes: 0, veiMax: null, plateBoundaryKm: 144 },
  { id: 'gibraltar', name: 'Gibraltar', kind: 'strait', good: null, lat: 35.95, lon: -5.6, m6: 5, m7: 1, mwMax: 7.80, mwMaxDate: '1954-03-29', eruptions: 0, eruptingVolcanoes: 0, veiMax: null, plateBoundaryKm: 136 },
  { id: 'antofagasta', name: 'Antofagasta', kind: 'production', good: 'copper', lat: -23.3, lon: -69.0, m6: 100, m7: 14, mwMax: 8.20, mwMaxDate: '1950-12-09', eruptions: 25, eruptingVolcanoes: 2, veiMax: 4, plateBoundaryKm: 200 },
  { id: 'morowali', name: 'Morowali', kind: 'production', good: 'nickel', lat: -2.83, lon: 122.16, m6: 40, m7: 2, mwMax: 7.53, mwMaxDate: '2000-05-04', eruptions: 0, eruptingVolcanoes: 0, veiMax: null, plateBoundaryKm: 54 },
  { id: 'weda-bay', name: 'Weda Bay', kind: 'production', good: 'nickel', lat: 0.47, lon: 127.94, m6: 178, m7: 17, mwMax: 7.70, mwMaxDate: '1932-05-14', eruptions: 33, eruptingVolcanoes: 5, veiMax: 3, plateBoundaryKm: 154 },
  { id: 'hsinchu', name: 'Hsinchu', kind: 'production', good: 'chips', lat: 24.78, lon: 121.01, m6: 215, m7: 18, mwMax: 7.81, mwMaxDate: '1951-11-24', eruptions: 1, eruptingVolcanoes: 1, veiMax: 4, plateBoundaryKm: 14 },
  { id: 'tainan', name: 'Tainan', kind: 'production', good: 'chips', lat: 23.11, lon: 120.27, m6: 234, m7: 21, mwMax: 7.81, mwMaxDate: '1951-11-24', eruptions: 0, eruptingVolcanoes: 0, veiMax: null, plateBoundaryKm: 13 },
];
