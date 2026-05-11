/**
 * AppStartup - Smart Loading with Warm Resume Support
 * 
 * Key behavior:
 * 1. Cold start (first launch / session expired): Show splash screen
 * 2. Warm resume (returning within 30min): Instant UI, background refresh
 * 3. Never reload when returning from background unless truly necessary
 */

import { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { RefreshCw, AlertCircle, WifiOff, LogOut, Trash2 } from 'lucide-react';
import splashLogo from '@/assets/splash-logo.png';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

import {
  initAppLifecycle,
  canWarmResume,
  markInitialLoadComplete,
  resetInitialLoad,
  subscribeLifecycle,
} from '@/lib/appLifecycle';
import { initResumeHandler, onResume, setOverlayLogoUrl } from '@/lib/resumeHandler';
import { forceClearAllCaches } from '@/lib/localCache';

type StartupPhase = 
  | 'immediate'      // First render - no async yet
  | 'initializing'   // Starting async work
  | 'auth'           // Checking auth
  | 'ready'          // All done
  | 'error';         // Something failed

type StartupError = {
  phase: string;
  message: string;
  details?: string;
};

interface AppStartupProps {
  children: ReactNode;
  onInitialize: () => Promise<void>;
  onLogout: () => Promise<void>;
  /** True once spaces + items are fully loaded (or an unrecoverable error occurred).
   *  AppStartup keeps the splash screen visible until this is true, ensuring the
   *  user never sees a blank Life page or empty Archive on first load. */
  isDataReady: boolean;
}

// Auth sub-operations have their own 3s timeouts. Data loading (SpacesContext) has
// a 15s timeout. 10s is enough for auth init on a working connection; if it hasn't
// finished by then, show the error UI so the user can retry or clear data rather
// than staring at a blank splash for 20+ seconds.
const STARTUP_TIMEOUT_MS = 10000;

// Logging helper
function logStartup(message: string, data?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  console.log(`[boot:${message}]`, data || '', `(${timestamp})`);
}

export function AppStartup({ children, onInitialize, onLogout, isDataReady }: AppStartupProps) {
  // Controls the fade-out overlay that smooths the splash → content transition.
  // When phase becomes 'ready', we keep a full-screen overlay briefly so the
  // content underneath can mount and paint before the user sees it.
  const [showFadeOverlay, setShowFadeOverlay] = useState(true);

  // Fade out the HTML initial-loader smoothly instead of removing instantly
  useEffect(() => {
    const loader = document.getElementById('initial-loader');
    if (loader) {
      // Fade out over 300ms, then remove from DOM
      loader.style.opacity = '0';
      const timer = setTimeout(() => loader.remove(), 300);
      return () => clearTimeout(timer);
    }
  }, []);

  const isWarmResume = useRef((() => {
    try { return canWarmResume(); } catch { return false; }
  })());
  
  // Ref so event callbacks (set up once) always see the current phase
  // without needing to be recreated on every phase change.
  const phaseRef = useRef<StartupPhase>('immediate');

  const [phase, setPhase] = useState<StartupPhase>(() => {
    if (isWarmResume.current) {
      logStartup('warm-resume');
      return 'ready';
    }
    return 'immediate';
  });
  
  // Keep ref in sync so callbacks always read the current phase.
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const [error, setError] = useState<StartupError | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [isOnline, setIsOnline] = useState(() => {
    try {
      return typeof navigator !== 'undefined' ? navigator.onLine : true;
    } catch {
      return true;
    }
  });
  
  // Tracks whether onInitialize() has resolved. Used together with isDataReady
  // to decide when to transition to 'ready'. Using state (not ref) so the effect
  // below re-runs when this flips to true.
  const [initDone, setInitDone] = useState(false);

  const initStartedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitializedLifecycle = useRef(false);

  // Initialize app lifecycle tracking once
  useEffect(() => {
    if (hasInitializedLifecycle.current) return;
    hasInitializedLifecycle.current = true;
    setOverlayLogoUrl(splashLogo);
    initAppLifecycle();
    logStartup('start');
  }, []);

  // Track online status
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    } catch (err) {
      console.warn('[boot] Failed to set up online listeners:', err);
    }
  }, []);

  // Subscribe to lifecycle events for background/foreground handling
  useEffect(() => {
    const unsubscribe = subscribeLifecycle((event) => {
      if (event.type === 'foreground' && event.wasBackground) {
        logStartup('foreground', { 
          duration: event.backgroundDuration,
          canWarmResume: canWarmResume(),
        });
        if (phase === 'ready' && canWarmResume()) {
          logStartup('warm-resume-ok');
        }
      }
    });
    return unsubscribe;
  }, [phase]);


  // Transition to 'ready' once auth init is done AND data is fully loaded.
  // This prevents users from seeing an empty Life page or Archive before spaces/items arrive.
  useEffect(() => {
    if (initDone && isDataReady && phase !== 'ready' && phase !== 'error') {
      logStartup('data-ready');
      markInitialLoadComplete();
      setPhase('ready');
    }
  }, [initDone, isDataReady, phase]);

  // Deferred initialization
  useEffect(() => {
    if (isWarmResume.current) {
      logStartup('warm-resume-bg-init');
      onInitialize().catch(err => {
        console.warn('[boot] Background init failed:', err);
      });
      return;
    }
    
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    logStartup('cold-start');

    // Start init immediately — no setTimeout wrapper
    logStartup('session:check');
    setPhase('initializing');

    // Hard timeout
    timeoutRef.current = setTimeout(() => {
      logStartup('timeout');
      setError({
        phase: 'timeout',
        message: 'Having trouble connecting',
        details: 'The app took too long to start. Please try again.',
      });
      setPhase('error');
    }, STARTUP_TIMEOUT_MS);

    setPhase('auth');
    onInitialize()
      .then(() => {
        logStartup('done');
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setError(null);
        // Signal that auth init is complete. The isDataReady effect will
        // transition to 'ready' once SpacesContext finishes loading data.
        setInitDone(true);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[boot:error]', msg, err);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setError({
          phase: 'initialization',
          message: 'Something went wrong',
          details: msg,
        });
        setPhase('error');
      });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onInitialize]);

  // Show retry / clear-data / log-out buttons after 1.5s so a stuck launch is
  // recoverable almost immediately instead of staring at a blank splash.
  useEffect(() => {
    if (phase === 'ready' || phase === 'error') return;
    const timer = setTimeout(() => setShowRetry(true), 1500);
    return () => clearTimeout(timer);
  }, [phase]);

  // Retry handler
  const handleRetry = useCallback(() => {
    logStartup('retry');
    setError(null);
    setShowRetry(false);
    setInitDone(false);
    initStartedRef.current = false;
    isWarmResume.current = false;
    setPhase('immediate');

    setTimeout(() => {
      initStartedRef.current = true;
      setPhase('initializing');

      timeoutRef.current = setTimeout(() => {
        logStartup('retry-timeout');
        setError({
          phase: 'timeout',
          message: 'Having trouble connecting',
          details: 'The app took too long to start. Please try again.',
        });
        setPhase('error');
      }, STARTUP_TIMEOUT_MS);

      setPhase('auth');
      onInitialize()
        .then(() => {
          logStartup('retry-done');
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setError(null);
          // Signal auth complete; isDataReady effect will flip to 'ready'
          setInitDone(true);
        })
        .catch((err) => {
          console.error('[boot:retry-error]', err);
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setError({
            phase: 'initialization',
            message: 'Something went wrong',
            details: err instanceof Error ? err.message : 'Unknown error',
          });
          setPhase('error');
        });
    }, 100);
  }, [onInitialize]);

  // Initialize resume handler — clears stuck states on return from background
  useEffect(() => {
    const cleanupResume = initResumeHandler();

    const unsubResume = onResume((event) => {
      if (event.type === 'resume_start') {
        // Clear any stuck loading states so the app is usable immediately
        setPhase(prev => {
          if (prev !== 'ready') {
            logStartup('resume-clearing-stuck-loader');
            setError(null);
            setShowRetry(false);
            return 'ready';
          }
          return prev;
        });
      }
      if (event.type === 'soft_reset') {
        logStartup('resume-soft-reset');
        setPhase(prev => {
          if (prev !== 'ready') {
            initStartedRef.current = false;
            isWarmResume.current = false;
            return 'immediate';
          }
          return prev;
        });
      }
      if (event.type === 'session_missing') {
        // Only act when the app was already rendered (warm resume path).
        // During cold start the initializeAuth path handles a missing session
        // itself; interfering there would race with ongoing initialization.
        if (phaseRef.current === 'ready') {
          logStartup('session-missing-on-resume');
          onLogout().catch(() => {
            window.location.href = '/auth';
          });
        }
      }
      if (event.type === 'data_refetched') {
        // Background data refresh — never block UI
        onInitialize().catch(err => {
          console.warn('[resume] Background re-init failed:', err);
        });
      }
    });

    return () => {
      cleanupResume();
      unsubResume();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onInitialize]);


  const handleLogout = useCallback(async () => {
    logStartup('logout');
    resetInitialLoad();
    try {
      await onLogout();
      window.location.href = '/auth';
    } catch (err) {
      console.error('[boot:logout-error]', err);
      window.location.href = '/auth';
    }
  }, [onLogout]);

  // Nuclear recovery for stuck TestFlight installs: wipe every cache + storage
  // key the app owns and hard-reload. This is the only fully offline escape
  // hatch — it works even when the network/Supabase is unreachable.
  const handleClearData = useCallback(() => {
    logStartup('clear-data');
    try { forceClearAllCaches(); } catch (err) { console.warn('[boot] clear caches failed', err); }
    try { localStorage.clear(); } catch (err) { console.warn('[boot] localStorage.clear failed', err); }
    try { sessionStorage.clear(); } catch (err) { console.warn('[boot] sessionStorage.clear failed', err); }
    window.location.href = '/auth';
  }, []);

  // When phase transitions to 'ready', start fading out the overlay so children
  // can mount and paint behind it before the user sees them.
  useEffect(() => {
    if (phase === 'ready') {
      // Small delay lets React render children behind the overlay first
      const timer = setTimeout(() => setShowFadeOverlay(false), 80);
      return () => clearTimeout(timer);
    } else {
      setShowFadeOverlay(true);
    }
  }, [phase]);

  // Always render children so they can mount and be ready when the overlay fades.
  // The overlay blocks visibility until the transition is complete.
  return (
    <>
      {/* App content — always mounted so it paints behind the overlay */}
      <div style={{ visibility: phase === 'ready' ? 'visible' : 'hidden' }}>
        {phase === 'ready' ? children : null}
      </div>

      {/* Splash / loading overlay */}
      <AnimatePresence>
        {(phase !== 'ready' || showFadeOverlay) && (
          <motion.div
            key="startup-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6 overflow-hidden"
          >
            {phase === 'error' || !isOnline ? (
              /* Error / offline state */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-6"
              >
                {phase === 'error' ? (
                  <AlertCircle className="w-8 h-8 text-destructive" />
                ) : (
                  <WifiOff className="w-8 h-8 text-muted-foreground" />
                )}
                {phase === 'error' && error && (
                  <div className="text-center space-y-1.5">
                    <p className="text-sm font-medium text-foreground">{error.message}</p>
                    {error.details && (
                      <p className="text-xs text-muted-foreground max-w-[280px]">{error.details}</p>
                    )}
                  </div>
                )}
                {!isOnline && phase !== 'error' && (
                  <p className="text-xs text-muted-foreground">No internet connection</p>
                )}
              </motion.div>
            ) : (
              /* Minimal blank loading — no splash branding */
              <div />
            )}

            {/* Action buttons */}
            <AnimatePresence>
              {(phase === 'error' || !isOnline || showRetry) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mt-8 flex flex-col items-center gap-3"
                >
                  <div className="flex gap-2 flex-wrap justify-center">
                    <Button variant="default" size="sm" onClick={handleRetry} className="gap-2">
                      <RefreshCw className="w-4 h-4" /> Retry
                    </Button>
                    {(phase === 'error' || showRetry) && (
                      <Button variant="outline" size="sm" onClick={handleClearData} className="gap-2">
                        <Trash2 className="w-4 h-4" /> Clear data
                      </Button>
                    )}
                    {(phase === 'error' || showRetry) && (
                      <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
                        <LogOut className="w-4 h-4" /> Log out
                      </Button>
                    )}
                  </div>
                  {phase === 'error' && (
                    <p className="text-[11px] text-muted-foreground max-w-[280px] text-center mt-1">
                      If retry doesn't help, "Clear data" wipes local cache and starts fresh (you stay signed in if your session is valid).
                    </p>
                  )}
                  {!isOnline && (
                    <p className="text-xs text-muted-foreground mt-2">Please check your connection and try again</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
