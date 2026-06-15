import { toIso2 } from '../utils/country-codes';

export const FREE_TIER_FOLLOW_LIMIT = 999999;
export const FOLLOWED_COUNTRIES_STORAGE_KEY = 'wm-followed-countries-v1';
export const WM_FOLLOWED_COUNTRIES_CHANGED = 'wm-followed-countries-changed';
export const WM_FOLLOWED_COUNTRIES_CAP_DROP = 'wm-followed-countries-cap-drop';

export type FollowMutationResult =
  | { ok: true }
  | { ok: false; reason: 'DISABLED' }
  | { ok: false; reason: 'INVALID_INPUT' }
  | { ok: false; reason: 'FREE_CAP'; currentCount?: number; limit?: number }
  | { ok: false; reason: 'ENTITLEMENT_LOADING' }
  | { ok: false; reason: 'HANDOFF_PENDING' }
  | { ok: false; reason: 'STORAGE_FULL' };

export type ServiceEntitlementState = 'pro' | 'free' | 'loading';

export interface ConvexClientLike {}

export function _setDepsForTests(_deps: any): void {}
export function _resetStateForTests(): void {}
export function _clearFailedHandoffForTests(): void {}
export function _setHandoffBackoffForTests(_schedule: number[] | null): void {}
export function _installCrossTabStorageListenerForTests(): void {}
export function _emitAuthStateForTests(_nextUser: any): Promise<void> {
  return Promise.resolve();
}
export function _triggerVisibilityRetryForTests(): Promise<void> {
  return Promise.resolve();
}
export function _getInternalStateForTests(): any {
  return { handoffState: 'complete', handoffRetryAttempt: 0 };
}
export function _pushSubscriptionSnapshotForTests(_snapshot: any): void {}

export function isFollowFeatureEnabled(): boolean {
  return true;
}

export function serviceEntitlementState(): ServiceEntitlementState {
  return 'pro';
}

export function installFollowedCountriesAuthListener(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (ev) => {
      if (ev.key === FOLLOWED_COUNTRIES_STORAGE_KEY) {
        dispatchChanged();
      }
    });
  }
}

function dispatchChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(WM_FOLLOWED_COUNTRIES_CHANGED));
  } catch {}
}

export function getFollowed(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FOLLOWED_COUNTRIES_STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.countries)) {
      return parsed.countries.filter((c: any) => typeof c === 'string').map((c: string) => c.toUpperCase());
    }
  } catch {}
  return [];
}

export function isFollowed(code: string): boolean {
  const norm = toIso2(code);
  if (!norm) return false;
  return getFollowed().includes(norm.toUpperCase());
}

export async function addCountry(input: string): Promise<FollowMutationResult> {
  const norm = toIso2(input);
  if (!norm) return { ok: false, reason: 'INVALID_INPUT' };
  
  const current = getFollowed();
  const code = norm.toUpperCase();
  if (current.includes(code)) return { ok: true };
  
  const next = [...current, code];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FOLLOWED_COUNTRIES_STORAGE_KEY, JSON.stringify({ countries: next }));
      dispatchChanged();
      return { ok: true };
    }
  } catch {}
  return { ok: false, reason: 'STORAGE_FULL' };
}

export async function removeCountry(input: string): Promise<FollowMutationResult> {
  const norm = toIso2(input);
  if (!norm) return { ok: false, reason: 'INVALID_INPUT' };
  
  const current = getFollowed();
  const code = norm.toUpperCase();
  if (!current.includes(code)) return { ok: true };
  
  const next = current.filter(c => c !== code);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FOLLOWED_COUNTRIES_STORAGE_KEY, JSON.stringify({ countries: next }));
      dispatchChanged();
      return { ok: true };
    }
  } catch {}
  return { ok: false, reason: 'STORAGE_FULL' };
}

export function subscribe(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(WM_FOLLOWED_COUNTRIES_CHANGED, handler);
  return () => {
    window.removeEventListener(WM_FOLLOWED_COUNTRIES_CHANGED, handler);
  };
}
