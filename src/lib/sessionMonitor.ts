/**
 * Session Monitor
 * Handles token refresh, detects session issues, and provides safe logout
 */

import { supabase } from '@/integrations/supabase/app-client';
import { logLifecycle, startTiming, endTiming, endTimingWithError } from './performanceLogger';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';

type SessionListener = (event: SessionEvent) => void;
type SessionEvent = 
  | { type: 'session_refreshed' }
  | { type: 'session_expired'; reason: string }
  | { type: 'refresh_failed'; error: string }
  | { type: 'signed_out'; reason: SignOutReason };

export type SignOutReason = 
  | 'user_initiated'
  | 'token_expired'
  | 'refresh_failed'
  | 'storage_cleared'
  | 'network_error'
  | 'unknown';

const listeners: Set<SessionListener> = new Set();

function notifyListeners(event: SessionEvent) {
  listeners.forEach(listener => listener(event));
}

export function subscribeSessionEvents(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Track sign-out reason
let lastSignOutReason: SignOutReason = 'unknown';

export function getLastSignOutReason(): SignOutReason {
  return lastSignOutReason;
}

export function setSignOutReason(reason: SignOutReason): void {
  lastSignOutReason = reason;
  logLifecycle('Sign-out reason set', { reason });
}

// Monitor session health
let sessionCheckInterval: ReturnType<typeof setInterval> | null = null;
let lastSessionCheck = 0;
const SESSION_CHECK_INTERVAL = 60000; // Check every minute
const SESSION_EXPIRY_BUFFER = 300000; // 5 minutes before expiry

export function startSessionMonitor(): void {
  if (sessionCheckInterval) {
    return;
  }
  
  logLifecycle('Session monitor started');
  
  sessionCheckInterval = setInterval(async () => {
    await checkSessionHealth();
  }, SESSION_CHECK_INTERVAL);
  
  // Delay the initial check by 15s so it doesn't compete with auth
  // initialization, profile fetch, and data sync that are still completing
  // at startup. Previously 3s caused a competing getSession() call during
  // the most latency-sensitive window.
  setTimeout(() => {
    checkSessionHealth();
  }, 15000);
}

export function stopSessionMonitor(): void {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
    logLifecycle('Session monitor stopped');
  }
}

async function checkSessionHealth(): Promise<void> {
  const now = Date.now();
  
  // Debounce checks — skip if checked recently
  if (now - lastSessionCheck < SESSION_CHECK_INTERVAL / 2) {
    return;
  }
  
  // Skip if app is backgrounded (avoid competing with resume handler)
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return;
  }
  
  lastSessionCheck = now;
  
  const timingId = startTiming('session_health_check');
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      throw error;
    }
    
    if (!session) {
      // No session - user signed out
      endTiming(timingId, 'no session');
      return;
    }
    
    // Check if token is about to expire
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const timeToExpiry = expiresAt - now;
    
    if (timeToExpiry < SESSION_EXPIRY_BUFFER && timeToExpiry > 0) {
      logLifecycle('Token expiring soon, refreshing', { timeToExpiry });
      await refreshSession();
    }
    
    endTiming(timingId, 'healthy');
  } catch (err) {
    endTimingWithError(timingId, err);
    console.error('[SessionMonitor] Health check failed:', err);
  }
}

export async function refreshSession(): Promise<boolean> {
  const timingId = startTiming('session_refresh');
  
  try {
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      throw error;
    }
    
    if (!data.session) {
      throw new Error('No session returned after refresh');
    }
    
    endTiming(timingId, 'success');
    logLifecycle('Session refreshed successfully');
    notifyListeners({ type: 'session_refreshed' });
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    endTimingWithError(timingId, err);
    
    logLifecycle('Session refresh failed', { error: errorMessage });
    notifyListeners({ type: 'refresh_failed', error: errorMessage });
    
    // Check if this is a permanent failure
    if (isRefreshTokenExpired(err)) {
      setSignOutReason('token_expired');
      showErrorPopup(
        'Your session has expired. Please sign in again to continue.',
        () => window.location.href = '/auth'
      );
    } else if (!navigator.onLine) {
      // Network issue - don't show error, will retry when online
      setSignOutReason('network_error');
    } else {
      setSignOutReason('refresh_failed');
      showErrorPopup(
        'Unable to refresh your session. Please sign in again.',
        () => window.location.href = '/auth'
      );
    }
    
    return false;
  }
}

function isRefreshTokenExpired(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('refresh token') ||
      msg.includes('expired') ||
      msg.includes('invalid token') ||
      msg.includes('jwt expired')
    );
  }
  return false;
}

// Safe sign-out that preserves unsynced data
export async function safeSignOut(reason: SignOutReason = 'user_initiated'): Promise<void> {
  const timingId = startTiming('sign_out');
  setSignOutReason(reason);
  
  logLifecycle('Sign-out initiated', { reason });
  
  try {
    // Don't clear localStorage here - let sync queue handle it
    await supabase.auth.signOut();
    
    endTiming(timingId, reason);
    notifyListeners({ type: 'signed_out', reason });
  } catch (err) {
    endTimingWithError(timingId, err);
    console.error('[SessionMonitor] Sign-out error:', err);
    // Force clear session on error
    await supabase.auth.signOut({ scope: 'local' });
  }
}

// Detect if localStorage was cleared externally
export function checkStorageIntegrity(): boolean {
  try {
    const testKey = '__session_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    setSignOutReason('storage_cleared');
    return false;
  }
}

// Listen for storage events (cleared by another tab/extension)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    // Check if Supabase auth storage was cleared
    if (event.key?.startsWith('sb-') && event.newValue === null) {
      logLifecycle('Auth storage cleared externally', { key: event.key });
      setSignOutReason('storage_cleared');
    }
  });
}
