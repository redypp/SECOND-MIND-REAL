/**
 * EntitlementContext — single source of truth for Plus subscription status.
 *
 * Pattern:
 *   1. Read cached entitlement from localStorage immediately so the gate
 *      doesn't flicker for returning subscribers on cold start.
 *   2. Trigger a fresh fetch from the IAP backend in the background.
 *   3. Re-fetch whenever the authed user changes.
 *
 * The rest of the app should only read `isPlus` / `entitlement` and call
 * `purchase()` / `restore()` from the paywall screen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getIap, NO_ENTITLEMENT, type Entitlement, type ProductId, type PurchaseResult } from '@/lib/iap';
import { analytics, Events } from '@/lib/analytics';
import { errorTracking } from '@/lib/errorTracking';
import { useAuth } from '@/contexts/AuthContext';

const CACHE_KEY = 'sm-entitlement-cache';

function readCache(): Entitlement {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return NO_ENTITLEMENT;
    return JSON.parse(raw) as Entitlement;
  } catch {
    return NO_ENTITLEMENT;
  }
}

function writeCache(entitlement: Entitlement) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(entitlement)); } catch { /* ignore */ }
}

interface EntitlementContextValue {
  entitlement: Entitlement;
  isPlus: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  purchase: (productId: ProductId) => Promise<PurchaseResult>;
  restore: () => Promise<PurchaseResult>;
}

const EntitlementContext = createContext<EntitlementContextValue | undefined>(undefined);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [entitlement, setEntitlement] = useState<Entitlement>(() => readCache());
  const [isLoading, setIsLoading] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);

  const applyEntitlement = useCallback((next: Entitlement) => {
    setEntitlement(next);
    writeCache(next);
    if (next.isPlus) {
      analytics.capture(Events.SubscriptionActive, {
        product_id: next.productId,
        in_trial: next.inTrial,
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await getIap().getEntitlement();
      applyEntitlement(next);
    } catch (err) {
      errorTracking.captureException(err, { where: 'entitlement.refresh' });
    } finally {
      setIsLoading(false);
    }
  }, [applyEntitlement]);

  // Refresh whenever the authed user changes (login / switch / logout).
  useEffect(() => {
    const userId = user?.id ?? null;
    if (userId === lastUserIdRef.current) return;
    lastUserIdRef.current = userId;

    if (!userId) {
      // Signed out — drop any cached Plus state from the prior user.
      applyEntitlement(NO_ENTITLEMENT);
      return;
    }
    void refresh();
  }, [user?.id, refresh, applyEntitlement]);

  const purchase = useCallback(async (productId: ProductId): Promise<PurchaseResult> => {
    analytics.capture(Events.PaywallStartTrial, { product_id: productId });
    const result = await getIap().purchase(productId);
    if (result.status === 'success') {
      applyEntitlement(result.entitlement);
      analytics.capture(Events.PaywallPurchase, { product_id: productId, in_trial: result.entitlement.inTrial });
    } else if (result.status === 'error') {
      errorTracking.captureMessage(`Purchase failed: ${result.message}`, 'warning');
    }
    return result;
  }, [applyEntitlement]);

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    analytics.capture(Events.PaywallRestore);
    const result = await getIap().restore();
    if (result.status === 'success') {
      applyEntitlement(result.entitlement);
    }
    return result;
  }, [applyEntitlement]);

  const value = useMemo<EntitlementContextValue>(() => ({
    entitlement,
    isPlus: entitlement.isPlus,
    isLoading,
    refresh,
    purchase,
    restore,
  }), [entitlement, isLoading, refresh, purchase, restore]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used inside EntitlementProvider');
  return ctx;
}
