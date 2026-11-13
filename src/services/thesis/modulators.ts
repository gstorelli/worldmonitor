/**
 * Modulators of a strategic good read from the dated policy register
 * (data/policy-registry.json, schema v3): the single source of the measures in
 * force. Pure helpers, unit-tested in tests/thesis-modulators.test.mts.
 */
import type { SourcedFact, StrategicGood } from '@/config/thesis-model';

/** The register fields the modulator view reads (schema v3). */
export interface RegistryEntryLike {
  id: string;
  title: string;
  reference?: string;
  url?: string;
  role?: string;
  goods?: readonly string[];
  /** 'verificata' | 'in-riesame' | 'da-verificare'. */
  statusCode?: string | null;
  celex?: string | null;
  inForceFrom?: string | null;
  expiresOn?: string | null;
}

export type RegistryLike<T extends RegistryEntryLike = RegistryEntryLike> = readonly T[] | { entries?: readonly T[] };

function entriesOf<T extends RegistryEntryLike>(registry: RegistryLike<T>): readonly T[] {
  if (Array.isArray(registry)) return registry;
  return (registry as { entries?: readonly T[] }).entries ?? [];
}

/**
 * Register entries with role 'modulatore' whose goods include the HS heading,
 * verified ones first (register order kept within each group).
 */
export function registryModulatorsFor<T extends RegistryEntryLike>(registry: RegistryLike<T>, hs: string): T[] {
  return entriesOf(registry)
    .filter((e) => e.role === 'modulatore' && Array.isArray(e.goods) && e.goods.includes(hs))
    .sort((a, b) => Number(b.statusCode === 'verificata') - Number(a.statusCode === 'verificata'));
}

/** True when at least one verified register modulator names the HS heading. */
export function coveredByRegistry(registry: RegistryLike, hs: string): boolean {
  return registryModulatorsFor(registry, hs).some((e) => e.statusCode === 'verificata');
}

/** The hand-written "Misure in vigore: da censire" placeholder of thesis-model.ts. */
export function isCensusPlaceholder(fact: SourcedFact): boolean {
  return fact.status === 'todo' && /da censire/i.test(fact.text.it);
}

export interface HandFactDuplicate {
  hs: string;
  /** Italian text of the hand-written modulator fact. */
  fact: string;
  entryId: string;
  /** How the duplicate was found. */
  match: 'url' | 'reference';
  /** Whether the register entry lists this HS heading among its goods. */
  sameGood: boolean;
}

function normUrl(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/**
 * Hand-written verified modulator facts that duplicate a register modulator
 * (same URL, or source equal to the register reference). Listed only, so that
 * a later decision can consolidate them: nothing is removed here.
 */
export function handFactDuplicates(goods: readonly StrategicGood[], registry: RegistryLike): HandFactDuplicate[] {
  const modulators = entriesOf(registry).filter((e) => e.role === 'modulatore');
  const out: HandFactDuplicate[] = [];
  for (const g of goods) {
    for (const f of g.modulators) {
      if (f.status !== 'verified') continue;
      for (const e of modulators) {
        const byUrl = !!f.url && !!e.url && normUrl(f.url) === normUrl(e.url);
        const byRef = !!f.source && !!e.reference && f.source.trim() === e.reference.trim();
        if (!byUrl && !byRef) continue;
        out.push({ hs: g.hs, fact: f.text.it, entryId: e.id, match: byUrl ? 'url' : 'reference', sameGood: !!e.goods?.includes(g.hs) });
      }
    }
  }
  return out;
}
