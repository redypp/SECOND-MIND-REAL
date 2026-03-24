/**
 * App Lifecycle Manager
 * Handles foreground/background transitions with iOS WebView recovery
 * Ensures zero white-screen states after backgrounding
 */

import { logLifecycle } from './performanceLogger';

export type AppState = 'active' | 'background' | 'inactive';

export type LifecycleEvent = 
  | { type: 'foreground'; wasBackground: boolean; backgroundDuration: number }
  | { type: 'background' }
  | { type: 'visibility_hidden' }
  | { type: 'visibility_visible'; hiddenDuration: number }
  | { type: 'recovering' };

type LifecycleListener = (event: LifecycleEvent) => void;

// State
let currentState: AppState = 'active';
let lastActiveTime = Date.now();
let lastBackgroundTime: number | null = null;
let hasCompletedInitialLoad = false;
let sessionValidUntil: number | null = null;

const listeners = new Set<LifecycleListener>();

// Constants
const WARM_RESUME_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry
const IOS_PROCESS_KILL_THRESHOLD_MS = 60 * 1000; // 1 minute - likely process was killed
const HEALTH_CHECK_DELAY_MS = 300; // Wait for WebView to repaint

/**
 * Check if we can do a warm resume (skip loader)
 */
export function canWarmResume(): boolean {
  // Must have completed initial load at least once (in-memory or persisted in
  // localStorage so it survives iOS WebView process kills).
  if (!hasCompletedInitialLoad) {
    try {
      const storedTs = localStorage.getItem('sm_boot_ts');
      if (!storedTs) {
        logLifecycle('Cold start: no stored boot timestamp');
        return false;
      }
      const elapsed = Date.now() - parseInt(storedTs, 10);
      if (elapsed >= WARM_RESUME_THRESHOLD_MS) {
        logLifecycle('Cold start: stored boot too old', { elapsed });
        return false;
      }
      // Restore in-memory flag so subsequent calls are fast.
      hasCompletedInitialLoad = true;
      logLifecycle('Warm resume: restored from localStorage', { elapsed });
    } catch {
      logLifecycle('Cold start: localStorage unavailable');
      return false;
    }
  }

  // Check how long we were in background
  if (lastBackgroundTime) {
    const backgroundDuration = Date.now() - lastBackgroundTime;
    if (backgroundDuration >= WARM_RESUME_THRESHOLD_MS) {
      logLifecycle('Cold start: background exceeded threshold', {
        duration: backgroundDuration,
        threshold: WARM_RESUME_THRESHOLD_MS
      });
      return false;
    }
  }

  // Check if session would have expired
  if (sessionValidUntil && Date.now() > sessionValidUntil - SESSION_BUFFER_MS) {
    logLifecycle('Cold start: session may have expired');
    return false;
  }

  logLifecycle('Warm resume allowed');
  return true;
}

/**
 * Mark that the app has successfully completed initial data load
 */
export function markInitialLoadComplete(): void {
  hasCompletedInitialLoad = true;
  lastActiveTime = Date.now();
  try { localStorage.setItem('sm_boot_ts', Date.now().toString()); } catch {}
  logLifecycle('Initial load marked complete');
}

/**
 * Clear the initial load flag (e.g., on logout)
 */
export function resetInitialLoad(): void {
  hasCompletedInitialLoad = false;
  sessionValidUntil = null;
  try { localStorage.removeItem('sm_boot_ts'); } catch {}
  logLifecycle('Initial load reset');
}

/**
 * Update session expiry time (for warm resume decisions)
 */
export function setSessionExpiry(expiresAt: number): void {
  sessionValidUntil = expiresAt;
}

/**
 * Get current app state
 */
export function getAppState(): AppState {
  return currentState;
}

/**
 * Get how long the app was in background (if currently foregrounded)
 */
export function getBackgroundDuration(): number {
  if (lastBackgroundTime && currentState === 'active') {
    return Date.now() - lastBackgroundTime;
  }
  return 0;
}

/**
 * Subscribe to lifecycle events
 */
export function subscribeLifecycle(listener: LifecycleListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(event: LifecycleEvent): void {
  listeners.forEach(listener => {
    try {
      listener(event);
    } catch (err) {
      console.error('[AppLifecycle] Listener error:', err);
    }
  });
}

/**
 * Check if the DOM/WebView is in a healthy state.
 * iOS can terminate the WebView process under memory pressure,
 * leaving a blank white screen when the user returns.
 */
function isDOMHealthy(): boolean {
  try {
    const root = document.getElementById('root');
    if (!root) return false;
    // If root has no rendered children, the React tree is gone
    if (root.childElementCount === 0) {
      logLifecycle('DOM unhealthy: root has no children');
      return false;
    }
    // Check if body is actually visible (not zero-size from WebView kill)
    if (document.body.clientHeight === 0 || document.body.clientWidth === 0) {
      logLifecycle('DOM unhealthy: body has zero dimensions');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Show a lightweight recovery overlay before reloading
 */
function showRecoveryOverlay(): void {
  try {
    // Remove any existing overlay
    const existing = document.getElementById('ios-recovery-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ios-recovery-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      display:flex;align-items:center;justify-content:center;
      background:var(--background, #fafafa);
      transition:opacity 0.2s;
    `;
    // Spinner
    const spinner = document.createElement('div');
    spinner.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid var(--muted-foreground,#555);border-top-color:var(--foreground,#fff);animation:spin 0.9s linear infinite;';
    const style = document.createElement('style');
    style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    overlay.appendChild(spinner);
    overlay.appendChild(style);
    document.body.appendChild(overlay);
  } catch {
    // Non-critical - proceed with reload even if overlay fails
  }
}

/**
 * Signal recovery needed — no longer auto-reloads.
 * The resumeHandler is the single source of truth for reload decisions.
 */
function performRecovery(reason: string): void {
  logLifecycle('Recovery needed (delegated to resumeHandler)', { reason });
  notifyListeners({ type: 'recovering' });
}

/**
 * Run health check after returning to foreground.
 * Delayed slightly to allow WebView to repaint.
 */
function scheduleHealthCheck(backgroundDuration: number): void {
  setTimeout(() => {
    if (!isDOMHealthy()) {
      performRecovery('DOM unhealthy after resume');
      return;
    }
    
    // For long backgrounds on iOS, the JS context may be alive but stale.
    // Verify we can still interact with the DOM.
    if (backgroundDuration > IOS_PROCESS_KILL_THRESHOLD_MS) {
      try {
        // Probe: can we still read/write?
        const probe = document.createElement('div');
        probe.style.display = 'none';
        document.body.appendChild(probe);
        document.body.removeChild(probe);
      } catch {
        performRecovery('DOM interaction failed after long background');
        return;
      }
    }
    
    logLifecycle('Health check passed after resume', { backgroundDuration });
  }, HEALTH_CHECK_DELAY_MS);
}

// Handle visibility change
function handleVisibilityChange(): void {
  if (typeof document === 'undefined') return;
  
  if (document.visibilityState === 'hidden') {
    currentState = 'background';
    lastBackgroundTime = Date.now();
    logLifecycle('App went to background');
    notifyListeners({ type: 'visibility_hidden' });
    notifyListeners({ type: 'background' });
  } else if (document.visibilityState === 'visible') {
    const hiddenDuration = lastBackgroundTime ? Date.now() - lastBackgroundTime : 0;
    const wasBackground = currentState === 'background';
    
    currentState = 'active';
    lastActiveTime = Date.now();
    
    logLifecycle('App came to foreground', { 
      hiddenDuration, 
      wasBackground,
      canWarmResume: canWarmResume() 
    });
    
    notifyListeners({ type: 'visibility_visible', hiddenDuration });
    notifyListeners({ 
      type: 'foreground', 
      wasBackground, 
      backgroundDuration: hiddenDuration 
    });
    
    // Schedule DOM health check after returning
    if (wasBackground) {
      scheduleHealthCheck(hiddenDuration);
    }
  }
}

// Handle page focus/blur (additional signals)
function handleFocus(): void {
  if (currentState !== 'active') {
    const wasBackground = currentState === 'background';
    const backgroundDuration = lastBackgroundTime ? Date.now() - lastBackgroundTime : 0;
    
    currentState = 'active';
    lastActiveTime = Date.now();
    
    logLifecycle('App focused', { wasBackground, backgroundDuration });
    
    notifyListeners({ 
      type: 'foreground', 
      wasBackground, 
      backgroundDuration 
    });
    
    if (wasBackground) {
      scheduleHealthCheck(backgroundDuration);
    }
  }
}

function handleBlur(): void {
  currentState = 'inactive';
  logLifecycle('App blurred');
}

// Handle page unload/beforeunload - save state
function handleBeforeUnload(): void {
  try {
    const ts = Date.now().toString();
    sessionStorage.setItem('sm_last_active', ts);
    sessionStorage.setItem('sm_had_session', hasCompletedInitialLoad ? '1' : '0');
    // Also persist to localStorage so warm resume survives WebView process kills.
    if (hasCompletedInitialLoad) {
      localStorage.setItem('sm_boot_ts', ts);
    }
  } catch {
    // Ignore storage errors
  }
}

// Check if this is a page reload vs fresh navigation
export function isPageReload(): boolean {
  try {
    const lastActive = sessionStorage.getItem('sm_last_active');
    const hadSession = sessionStorage.getItem('sm_had_session');
    
    if (lastActive && hadSession === '1') {
      const elapsed = Date.now() - parseInt(lastActive, 10);
      // If less than 5 seconds, likely a reload
      return elapsed < 5000;
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

// Initialize lifecycle tracking
export function initAppLifecycle(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  
  // Check for reload scenario
  if (isPageReload()) {
    // Treat reloads as warm start if within threshold
    const lastActive = sessionStorage.getItem('sm_last_active');
    if (lastActive) {
      const elapsed = Date.now() - parseInt(lastActive, 10);
      if (elapsed < WARM_RESUME_THRESHOLD_MS) {
        hasCompletedInitialLoad = true;
        logLifecycle('Page reload detected, treating as warm resume', { elapsed });
      }
    }
  }
  
  // Set up listeners
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  // Also handle pagehide for mobile browsers
  window.addEventListener('pagehide', () => {
    currentState = 'background';
    lastBackgroundTime = Date.now();
    handleBeforeUnload();
  });
  
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      // Page was restored from bfcache
      const wasBackground = true;
      const backgroundDuration = lastBackgroundTime ? Date.now() - lastBackgroundTime : 0;
      
      currentState = 'active';
      lastActiveTime = Date.now();
      
      logLifecycle('Page restored from cache', { backgroundDuration });
      
      notifyListeners({ 
        type: 'foreground', 
        wasBackground, 
        backgroundDuration 
      });
      
      // Always health-check after bfcache restore
      scheduleHealthCheck(backgroundDuration);
    }
  });
  
  // iOS-specific: detect webview process termination recovery
  // When WKWebView's process is killed and restored, the window
  // gets a new 'load' event but the React root is empty.
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (hasCompletedInitialLoad && !isDOMHealthy()) {
        performRecovery('WebView process was terminated');
      }
    }, 500);
  });
  
  logLifecycle('App lifecycle initialized');
}

// Clean up (for testing)
export function cleanupAppLifecycle(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('focus', handleFocus);
  window.removeEventListener('blur', handleBlur);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  
  listeners.clear();
}
