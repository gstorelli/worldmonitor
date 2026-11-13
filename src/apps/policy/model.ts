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
  /** Schema v3 (dated register): null when not written in the entry's own text. */
  statusCode?: string | null;
  celex?: string | null;
  inForceFrom?: string | null;
  expiresOn?: string | null;
  origins?: string[] | null;
  cn?: string[] | null;
  channels?: string[] | null;
  kind?: string | null;
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

/** Verified means only statusCode === 'verificata' ("in riesame" is not verified). */
export function isVerified(entry: Pick<PolicyEntryLike, 'statusCode'>): boolean {
  return entry.statusCode === 'verificata';
}

export type StatusTone = 'ok' | 'review' | 'wip';

/** Status chip of a register entry: verificata / in riesame / da verificare. */
export function statusChip(entry: Pick<PolicyEntryLike, 'statusCode'>): { label: string; tone: StatusTone } {
  if (entry.statusCode === 'verificata') return { label: 'verificata', tone: 'ok' };
  if (entry.statusCode === 'in-riesame') return { label: 'in riesame', tone: 'review' };
  return { label: 'da verificare', tone: 'wip' };
}

export const UNVERIFIED_LABEL = 'da verificare';

/** Display value of a register field: null, empty string or empty list → "da verificare". */
export function fieldOrUnverified(value: string | readonly string[] | null | undefined, labels?: Record<string, string>): string {
  if (value == null) return UNVERIFIED_LABEL;
  if (typeof value === 'string') return value.trim() ? value : UNVERIFIED_LABEL;
  if (!value.length) return UNVERIFIED_LABEL;
  return value.map((v) => labels?.[v] ?? v).join(', ');
}

export const CHANNEL_LABELS: Record<string, string> = {
  origin: 'origine',
  value: 'valore',
  classification: 'classificazione',
};

const DAY_MS = 86_400_000;

function isoDayUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Whole days from the calendar day of `now` (UTC) to an ISO date; null if not a date. */
export function daysUntil(iso: string | null | undefined, now: Date): number | null {
  const day = iso ? isoDayUtc(iso) : null;
  if (day === null) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((day - today) / DAY_MS);
}

export const EXPIRING_WINDOW_DAYS = 30;

/** "In scadenza": expiresOn falls between today and `windowDays` days from `now` (inclusive). */
export function expiringSoon(entry: Pick<PolicyEntryLike, 'expiresOn'>, now: Date, windowDays = EXPIRING_WINDOW_DAYS): boolean {
  const days = daysUntil(entry.expiresOn, now);
  return days !== null && days >= 0 && days <= windowDays;
}

/**
 * Register sections: measures (modulators first, then other non-framework
 * entries, original order kept within each group) and the "quadro" entries.
 */
export function groupByRole<T extends Pick<PolicyEntryLike, 'role'>>(entries: readonly T[]): { measures: T[]; framework: T[] } {
  const framework = entries.filter((e) => e.role === 'quadro');
  const rest = entries.filter((e) => e.role !== 'quadro');
  return {
    measures: [...rest.filter((e) => e.role === 'modulatore'), ...rest.filter((e) => e.role !== 'modulatore')],
    framework,
  };
}

/**
 * One row per strategic good: the modulator measures of the register for its
 * HS heading (verified first) and the recent EU acts whose title names it
 * (newest first). No score is computed.
 */
export function buildGoodsMeasures(
  goods: readonly StrategicGood[],
  entries: readonly PolicyEntryLike[],
  acts: readonly EuActLike[],
): GoodMeasuresRow[] {
  return goods.map((good) => ({
    good,
    measures: entries
      .filter((e) => e.role === 'modulatore' && Array.isArray(e.goods) && e.goods.includes(good.hs))
      .sort((a, b) => Number(isVerified(b)) - Number(isVerified(a))),
    acts: acts.filter((a) => a.goods.includes(good.hs)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  }));
}

/** Short label of a registry title: the part before " — ". */
export function shortTitle(title: string): string {
  return title.split(' — ')[0] ?? title;
}
