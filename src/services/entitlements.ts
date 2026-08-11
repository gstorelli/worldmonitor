export interface EntitlementState {
  planKey: string;
  features: {
    tier: number;
    apiAccess: boolean;
    apiRateLimit: number;
    maxDashboards: number;
    prioritySupport: boolean;
    exportFormats: string[];
    mcpAccess?: boolean;
  };
  validUntil: number;
}

export async function initEntitlementSubscription(_userId?: string): Promise<void> {}
export function destroyEntitlementSubscription(): void {}
export function resetEntitlementState(): void {}
export function onEntitlementChange(cb: (state: EntitlementState | null) => void): () => void {
  cb(getEntitlementState());
  return () => {};
}
export function getEntitlementState(): EntitlementState | null {
  return {
    planKey: 'pro',
    features: {
      tier: 1,
      apiAccess: true,
      apiRateLimit: 100,
      maxDashboards: 10,
      prioritySupport: true,
      exportFormats: ['csv', 'json'],
      mcpAccess: true,
    },
    validUntil: Date.now() + 100000000,
  };
}
export function hasFeature(_flag: keyof EntitlementState['features']): boolean { return true; }
export function hasTier(_minTier: number): boolean { return true; }
export function isEntitled(): boolean { return true; }
export function shouldReloadOnEntitlementChange(_last: boolean | null, _next: boolean): boolean { return false; }
