import { ReactNode, useRef, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { InitialSyncLoader } from '@/components/InitialSyncLoader';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Grace period: after losing user state (e.g. on iOS resume),
 * wait before redirecting to /auth so the session can recover.
 */
const AUTH_GRACE_MS = 6000;
// Safety net for the case where SpacesContext's cloud fetch (which has a 15s timeout
// internally) never resolves — e.g., a network error that doesn't bubble up to the
// error handler, or a race condition between auth and data contexts.
//
// Why 15 000 ms?
//   - SpacesContext uses a 15s timeout for its cloud fetch.
//   - For users WITH a local cache, appReady flips within milliseconds (cache-first).
//   - For users WITHOUT a cache (first login / cleared storage), we must wait for the
//     cloud fetch to either succeed, fail, or fall back to cache before forcing the
//     app ready. Forcing too early (e.g. 2s) shows empty spaces/items for several
//     seconds while the cloud fetch is still in progress.
//   - If the cloud fetch succeeds within 15s, appReady is already true and this timer
//     never fires. If it truly gets stuck, 15s gives users a reasonable wait before
//     showing the app in whatever state it is.
const LOADER_SAFETY_TIMEOUT_MS = 15000;

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const {
    user,
    loading,
    authReady,
    appReady,
    isOnboardingComplete,
    profileFetched,
    loadingPhase,
    loadingProgress,
    loadingError,
    retrySync,
    setDataReady,
    setDataLoaded,
    setLoadingPhase,
    setLoadingProgress,
  } = useAuth();
  const location = useLocation();
  
  // Track if we ever had a user to enable grace period
  const hadUserRef = useRef(!!user);
  const [graceActive, setGraceActive] = useState(false);
  const [forcedReady, setForcedReady] = useState(false);
  
  // Safety timeout: if loader is stuck for too long, force dismiss.
  // Fires for all states including errors — the error screen's retry button
  // is good UX but the user should never be permanently stuck.
  //
  // IMPORTANT: use `hasUser` (boolean) not `user` (object) as the dep.
  // retrySync() calls initializeAuth() which calls setUser() with a fresh
  // object from localStorage on every call. If `user` were in deps, each
  // retrySync() would reset this 15 s timer — and since the auto-retry fires
  // every 10 s (before the 15 s fires), the timer would NEVER fire, leaving
  // the app permanently stuck on the loading screen.
  const hasUser = !!user;
  useEffect(() => {
    if (appReady || forcedReady) return;
    if (!hasUser) return; // Don't force ready if there's no user

    const timer = setTimeout(() => {
      console.warn('[ProtectedRoute] SAFETY: Loader stuck, forcing ready after', LOADER_SAFETY_TIMEOUT_MS, 'ms');
      setForcedReady(true);
      // Also update auth context so it stays consistent
      setDataLoaded(true);
      setDataReady(true);
      setLoadingPhase('complete');
      setLoadingProgress(100);
    }, LOADER_SAFETY_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [appReady, forcedReady, hasUser, setDataLoaded, setDataReady, setLoadingPhase, setLoadingProgress]);
  
  // Reset forcedReady when appReady becomes true or when loading restarts after a retry
  useEffect(() => {
    if (appReady) setForcedReady(false);
  }, [appReady]);

  // Reset forcedReady when a retry restarts the loading sequence,
  // so the safety-forced app state doesn't persist through retries.
  useEffect(() => {
    if (loadingPhase === 'connecting' || loadingPhase === 'profile') {
      setForcedReady(false);
    }
  }, [loadingPhase]);

  // Auto-retry when stuck in error state — the user shouldn't have to manually
  // tap retry every time; automatically attempt again after a short delay.
  useEffect(() => {
    if (loadingPhase !== 'error' && !loadingError) return;
    if (appReady || forcedReady) return;
    if (!user) return;

    const timer = setTimeout(() => {
      console.warn('[ProtectedRoute] AUTO-RETRY: error state detected, retrying sync');
      retrySync();
    }, 10000);

    return () => clearTimeout(timer);
  }, [loadingPhase, loadingError, appReady, forcedReady, user, retrySync]);

  useEffect(() => {
    if (user) {
      hadUserRef.current = true;
      setGraceActive(false);
      return;
    }
    
    // User just went null — if we previously had a user, start grace period
    if (hadUserRef.current && authReady && !loading) {
      setGraceActive(true);
      const timer = setTimeout(() => {
        setGraceActive(false);
      }, AUTH_GRACE_MS);
      return () => clearTimeout(timer);
    }
  }, [user, authReady, loading]);

  const isReady = appReady || forcedReady;

  // STICKY SHORTCUT: once the app is fully ready, never flash a loader again
  if (isReady && user) {
    // Wait for profile fetch to complete before evaluating onboarding status.
    // appReady can become true while the profile fetch is still in-flight
    // (SpacesContext may load from cache before the profile round-trip finishes),
    // causing profile=null to be misread as "onboarding incomplete" for existing users.
    // Use a minimal transparent placeholder instead of the full InitialSyncLoader
    // to avoid flashing a second loading screen right after AppStartup's splash.
    if (!profileFetched) {
      return (
        <div className="fixed inset-0 z-[9998] bg-background" />
      );
    }
    if (!isOnboardingComplete && location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }
    return <>{children}</>;
  }

  // HARD GATE: Show loader until auth check is complete
  if (loading || !authReady) {
    return (
      <InitialSyncLoader
        phase={loadingPhase}
        progress={loadingProgress}
        error={loadingError}
        onRetry={retrySync}
      />
    );
  }

  // Not authenticated — but if we just lost the session transiently (iOS resume),
  // show loader during grace period instead of redirecting
  if (!user) {
    if (graceActive) {
      return (
        <InitialSyncLoader
          phase="connecting"
          progress={20}
          error={null}
          onRetry={retrySync}
        />
      );
    }
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // HARD GATE: Show loader until ALL data is loaded and ready
  if (!isReady) {
    return (
      <InitialSyncLoader
        phase={loadingPhase}
        progress={loadingProgress}
        error={loadingError}
        onRetry={retrySync}
      />
    );
  }

  // Authenticated but onboarding incomplete (profile must be fetched first)
  if (profileFetched && !isOnboardingComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
