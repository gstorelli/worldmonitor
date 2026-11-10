/**
 * Policy workspace model: strategic goods × measures. Pure, unit-tested in
 * tests/policy-model.test.mts.
 */

import type { StrategicGood } from '@/config/thesis-model';

export interface PolicyEntryLike {
  id: string;
  title: string;
  topic?: string;
  status?: string;
  url?: string;
  role?: string;
  goods?: string[];
}

export interface EuActLike {
  celex: string;
  date: string;
  title: string;
  url: string;
  goods: string[];
  measures: string[];
}

export interface GoodMeasuresRow {
  good: StrategicGood;
  measures: PolicyEntryLike[];
  acts: EuActLike[];
}

/** Verified or under review (as opposed to "da verificare"). */
export function isVerifiedStatus(status: string | undefined): boolean {
  return /^(verificata|in riesame)/i.test(status ?? '');
}

/**
 * One row per strategic good: registry measures for its HS heading (verified
 * first) and the recent EU acts whose title names it (newest first).
 */
export function buildGoodsMeasures(
  goods: readonly StrategicGood[],
  entries: readonly PolicyEntryLike[],
  acts: readonly EuActLike[],
): GoodMeasuresRow[] {
  return goods.map((good) => ({
    good,
    measures: entries
      .filter((e) => Array.isArray(e.goods) && e.goods.includes(good.hs))
      .sort((a, b) => Number(isVerifiedStatus(b.status)) - Number(isVerifiedStatus(a.status))),
    acts: acts.filter((a) => a.goods.includes(good.hs)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  }));
}

/** Short label of a registry title: the part before " — ". */
export function shortTitle(title: string): string {
  return title.split(' — ')[0] ?? title;
}
