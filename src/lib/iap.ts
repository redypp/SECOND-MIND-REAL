/**
 * IAP — in-app purchase abstraction.
 *
 * Hides three possible backends behind a single interface:
 *   1. `window.despia.*`   — Despia's injected RevenueCat bridge (production iOS build)
 *   2. Capacitor plugin    — if/when we migrate to a Capacitor shell
 *   3. Stub                — web/dev mode; lets us test the paywall UI without
 *                            a real StoreKit environment
 *
 * The shape returned by every backend is the same so the rest of the app
 * (EntitlementContext, paywall screen) never has to branch on platform.
 *
 * ⚠️  TODO before launch: confirm the exact method names exposed by Despia's
 *     RevenueCat integration (likely `window.despia.purchase(...)` /
 *     `window.despia.restorePurchases()` / `window.despia.getCustomerInfo()`)
 *     and adjust the `DespiaBackend` block below. The rest of the app does
 *     not need to change.
 */

export type Entitlement = {
  /** True if the user has an active Plus subscription (incl. trial). */
  isPlus: boolean;
  /** ISO timestamp of when access expires, if known. */
  expiresAt: string | null;
  /** Currently active product, if known. */
  productId: string | null;
  /** True if the user is in their free-trial window. */
  inTrial: boolean;
};

export const NO_ENTITLEMENT: Entitlement = {
  isPlus: false,
  expiresAt: null,
  productId: null,
  inTrial: false,
};

export type PurchaseResult =
  | { status: 'success'; entitlement: Entitlement }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface IapBackend {
  /** Human label for telemetry / debugging. */
  readonly name: string;
  /** Fetch the current entitlement from the platform. */
  getEntitlement(): Promise<Entitlement>;
  /** Trigger native paywall / purchase flow for the given product. */
  purchase(productId: string): Promise<PurchaseResult>;
  /** Restore prior purchases (App Store: required UX). */
  restore(): Promise<PurchaseResult>;
}

/* ───────────────────────── Despia (production) ─────────────────────────
 * Despia injects helpers on window. The exact API is documented in their
 * dashboard once you enable RevenueCat for the project. The bridge below
 * assumes a Promise-returning shape; if Despia uses postMessage instead,
 * swap the bodies but keep the signatures intact. */

type DespiaCustomerInfo = {
  entitlements?: {
    active?: Record<string, {
      identifier: string;
      productIdentifier: string;
      expiresDate?: string | null;
      periodType?: 'normal' | 'trial' | 'intro';
    }>;
  };
};

type DespiaBridge = {
  revenuecat?: {
    getCustomerInfo?: () => Promise<DespiaCustomerInfo>;
    purchaseProduct?: (productId: string) => Promise<DespiaCustomerInfo>;
    restorePurchases?: () => Promise<DespiaCustomerInfo>;
  };
};

const ENTITLEMENT_KEY = 'plus'; // matches the entitlement id you'll create in RevenueCat

function customerInfoToEntitlement(info: DespiaCustomerInfo | undefined | null): Entitlement {
  const active = info?.entitlements?.active?.[ENTITLEMENT_KEY];
  if (!active) return NO_ENTITLEMENT;
  return {
    isPlus: true,
    expiresAt: active.expiresDate ?? null,
    productId: active.productIdentifier ?? null,
    inTrial: active.periodType === 'trial' || active.periodType === 'intro',
  };
}

class DespiaBackend implements IapBackend {
  readonly name = 'despia';
  private bridge: NonNullable<DespiaBridge['revenuecat']>;

  constructor(bridge: NonNullable<DespiaBridge['revenuecat']>) {
    this.bridge = bridge;
  }

  async getEntitlement(): Promise<Entitlement> {
    if (!this.bridge.getCustomerInfo) return NO_ENTITLEMENT;
    const info = await this.bridge.getCustomerInfo();
    return customerInfoToEntitlement(info);
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    if (!this.bridge.purchaseProduct) {
      return { status: 'error', message: 'Purchases unavailable on this device.' };
    }
    try {
      const info = await this.bridge.purchaseProduct(productId);
      return { status: 'success', entitlement: customerInfoToEntitlement(info) };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(message)) return { status: 'cancelled' };
      return { status: 'error', message };
    }
  }

  async restore(): Promise<PurchaseResult> {
    if (!this.bridge.restorePurchases) {
      return { status: 'error', message: 'Restore unavailable on this device.' };
    }
    try {
      const info = await this.bridge.restorePurchases();
      return { status: 'success', entitlement: customerInfoToEntitlement(info) };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', message };
    }
  }
}

/* ───────────────────────── Stub (dev / web preview) ───────────────────── */

const STUB_STORAGE_KEY = 'sm-dev-entitlement';

class StubBackend implements IapBackend {
  readonly name = 'stub';

  async getEntitlement(): Promise<Entitlement> {
    try {
      const raw = localStorage.getItem(STUB_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Entitlement;
    } catch { /* ignore */ }
    return NO_ENTITLEMENT;
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    // Simulate a successful purchase in dev so the post-paywall flow is testable.
    const entitlement: Entitlement = {
      isPlus: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      productId,
      inTrial: true,
    };
    try { localStorage.setItem(STUB_STORAGE_KEY, JSON.stringify(entitlement)); } catch { /* ignore */ }
    return { status: 'success', entitlement };
  }

  async restore(): Promise<PurchaseResult> {
    const entitlement = await this.getEntitlement();
    return entitlement.isPlus
      ? { status: 'success', entitlement }
      : { status: 'error', message: 'No previous purchases found.' };
  }
}

/* ───────────────────────── Backend selection ────────────────────────── */

function detectBackend(): IapBackend {
  if (typeof window === 'undefined') return new StubBackend();
  const despia = (window as unknown as { despia?: DespiaBridge }).despia;
  if (despia?.revenuecat?.getCustomerInfo) {
    return new DespiaBackend(despia.revenuecat);
  }
  return new StubBackend();
}

let cached: IapBackend | null = null;
export function getIap(): IapBackend {
  if (!cached) cached = detectBackend();
  return cached;
}

/* ───────────────────────── Product IDs ─────────────────────────────── *
 * Keep these IDs identical between App Store Connect, RevenueCat, and the
 * app code. Apple convention is reverse-DNS + period suffix.            */

export const PRODUCTS = {
  PLUS_MONTHLY: 'com.secondmind.plus.monthly',
  PLUS_YEARLY:  'com.secondmind.plus.yearly',
} as const;

export type ProductId = (typeof PRODUCTS)[keyof typeof PRODUCTS];
