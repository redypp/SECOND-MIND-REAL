import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, SUPABASE_AUTH_STORAGE_KEY } from '@/integrations/supabase/app-client';
import { startTiming, endTiming, endTimingWithError, logLifecycle } from '@/lib/performanceLogger';
import { startSessionMonitor, stopSessionMonitor, setSignOutReason, safeSignOut } from '@/lib/sessionMonitor';
import { initSyncQueue, clearQueueForUser } from '@/lib/syncQueue';
import { clearSubheadingsCache } from '@/hooks/useLifeSubheadings';
import { setSessionExpiry, resetInitialLoad, markInitialLoadComplete } from '@/lib/appLifecycle';

type LoadingPhase = 'connecting' | 'profile' | 'collections' | 'items' | 'complete' | 'error';

/**
 * Typed events that SpacesContext reports to AuthContext.
 * AuthContext owns all state mutations; SpacesContext only reports what happened.
 */
export type DataFetchEvent =
  | { kind: 'cache_ready' }                        // Local cache loaded — app can render
  | { kind: 'fetching'; phase: LoadingPhase; progress: number } // Cloud fetch in progress
  | { kind: 'success' }                            // Cloud fetch succeeded
  | { kind: 'cache_fallback' }                     // Cloud failed, using cached data
  | { kind: 'error'; message: string }             // All fetches failed, no cache
  | { kind: 'signed_out' }                         // User signed out, no data to wait for
  | { kind: 'user_changed' };                      // User switched accounts, reset loading state

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  birthday: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authReady: boolean; // Auth check is complete (user may or may not exist)
  dataReady: boolean; // Collections/items are loaded
  appReady: boolean;  // Everything is loaded and UI can render
  loadingPhase: LoadingPhase;
  loadingProgress: number;
  loadingError: string | null;
  setDataReady: (ready: boolean) => void;
  setDataLoaded: (loaded: boolean) => void; // Called when data fetch succeeds
  setLoadingPhase: (phase: LoadingPhase) => void;
  setLoadingProgress: (progress: number) => void;
  setLoadingError: (error: string | null) => void;
  /** Single controlled entry point for SpacesContext to report data-load outcomes.
   *  Replaces direct use of the individual setters above from SpacesContext,
   *  making AuthContext the sole owner of loading-state mutation logic. */
  notifyDataStatus: (event: DataFetchEvent) => void;
  retrySync: () => void;
  initializeAuth: () => Promise<void>; // Manual initialization trigger
  signUp: (email: string, password: string, fullName: string, phoneNumber?: string) => Promise<{ error: Error | null; session: Session | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: { full_name?: string; birthday?: string; location?: string }) => Promise<{ error: Error | null }>;
  isOnboardingComplete: boolean;
  /** True once a profile fetch attempt has completed for the current user (even if result is null).
   *  Guards against premature onboarding redirects while profile is still loading. */
  profileFetched: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileFetched, setProfileFetched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false); // True only on successful fetch
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('connecting');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const initRef = useRef(false);
  const userRef = useRef<User | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const lastHiddenAtRef = useRef<number>(0);

  const loadingRef = useRef(loading);

  // Keep refs in sync with state
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Track when app was last hidden for resume-aware auth suppression
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // appReady = auth complete + data loaded successfully + no errors
  // Once appReady becomes true, it stays true until explicit sign-out.
  // This prevents the loading screen from flashing during in-app navigation.
  const appReadyNow = authReady && dataLoaded && loadingPhase === 'complete' && !loadingError;
  const appReadyRef = useRef(false);
  if (appReadyNow) appReadyRef.current = true;
  // Reset on sign-out (user becomes null after being set)
  if (!user && !loading && authReady) appReadyRef.current = false;
  const appReady = appReadyRef.current;

  // Check if onboarding is complete (has full_name)
  // birthday is collected during onboarding but must not gate existing users who skipped it
  const isOnboardingComplete = Boolean(profile?.full_name?.trim());

  // ─── In-flight guard: serializes concurrent getSession calls ───────────────
  // Multiple systems (initializeAuth, onAuthStateChange, sessionMonitor) can
  // all call getSession simultaneously, causing Navigator.locks contention.
  // This guard ensures only one request is in-flight at a time.
  const getSessionInFlightRef = useRef<Promise<{ data: { session: Session | null } }> | null>(null);

  // ─── In-flight guard: deduplicates concurrent profile fetches ──────────────
  // initializeAuth and onAuthStateChange both fire profile fetches on cold
  // start. Running them concurrently causes LockManager contention and can
  // make both return null even when the profile row exists.  Sharing a single
  // in-flight promise eliminates the duplicate request.
  // Tracks both the in-flight promise AND the userId it's fetching for, so a
  // concurrent request for a *different* user (e.g., account switch in the same
  // tab) doesn't get the wrong user's profile back from the dedupe path.
  const profileFetchInFlightRef = useRef<{ userId: string; promise: Promise<Profile | null> } | null>(null);

  const getSessionOnce = useCallback(() => {
    if (!getSessionInFlightRef.current) {
      getSessionInFlightRef.current = supabase.auth.getSession().finally(() => {
        getSessionInFlightRef.current = null;
      });
    }
    return getSessionInFlightRef.current;
  }, []);

  // Fetch user profile — single attempt, no retry loop.
  // Retrying profile fetch on lock errors makes contention worse.
  // The profile is non-critical; a null profile is handled gracefully.
  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const timingId = startTiming('fetch_profile');
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      
      endTiming(timingId, data ? 'found' : 'not found');
      return data;
    } catch (err) {
      const isLockError = err instanceof Error && 
        (err.message.includes('LockManager') || (err.message.includes('lock') && err.message.includes('timed out')));
      
      if (isLockError) {
        console.warn('[Auth] Profile fetch skipped — lock contention, will retry on next auth event');
      } else {
        console.error('Error fetching profile:', err);
      }
      endTimingWithError(timingId, err);
      return null;
    }
  }, []);

  // Deduplicated profile fetch — if a fetch for the SAME userId is already
  // in-flight, return the same promise rather than firing a second concurrent
  // Supabase request. Fetches for a different userId always start a fresh
  // request to avoid returning the previous user's profile.
  const fetchProfileOnce = useCallback((userId: string): Promise<Profile | null> => {
    const inFlight = profileFetchInFlightRef.current;
    if (inFlight && inFlight.userId === userId) {
      return inFlight.promise;
    }
    const promise = fetchProfile(userId).finally(() => {
      // Only clear the ref if it still points to THIS request — otherwise a
      // newer in-flight fetch for a different user has already taken over.
      if (profileFetchInFlightRef.current?.promise === promise) {
        profileFetchInFlightRef.current = null;
      }
    });
    profileFetchInFlightRef.current = { userId, promise };
    return promise;
  }, [fetchProfile]);

  // Manual initialization function - called by AppStartup AFTER first render
  // Also called on resume to re-validate session
  const initializeAuth = useCallback(async (): Promise<void> => {
  // On re-init (resume), only do a lightweight session revalidation
    if (initRef.current) {
      logLifecycle('Auth re-validation (resume)');
      try {
        // If we already have a user in state, skip getSession and just refresh silently
        if (userRef.current) {
          logLifecycle('Auth re-validation: user exists, refreshing token silently');
          const expiresAt = sessionRef.current?.expires_at ? sessionRef.current.expires_at * 1000 : 0;
          if (expiresAt - Date.now() < 300_000) {
            supabase.auth.refreshSession()
              .then(({ data, error }) => {
                if (error) {
                  logLifecycle('Silent token refresh failed, falling back to getSession', { message: error.message });
                  // Fall back to full session check instead of staying with stale token
                  return supabase.auth.getSession().then(({ data: sessionData }) => {
                    if (sessionData.session?.user) {
                      setSession(sessionData.session);
                      setUser(sessionData.session.user);
                      if (sessionData.session.expires_at) {
                        setSessionExpiry(sessionData.session.expires_at * 1000);
                      }
                    }
                  });
                } else if (data.session?.expires_at) {
                  setSessionExpiry(data.session.expires_at * 1000);
                }
              })
              .catch(() => {
                logLifecycle('Silent token refresh failed completely, keeping current state');
              });
          }
          // Ensure loading states are correct so appReady stays true
          setAuthReady(true);
          setLoading(false);
          return;
        }

        // No user in state — try getSession (use shared in-flight guard)
        const { data: { session: currentSession } } = await Promise.race([
          getSessionOnce(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
        ]);
        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);
          setAuthReady(true);
          setLoading(false);
          if (currentSession.expires_at && currentSession.expires_at * 1000 - Date.now() < 120_000) {
            supabase.auth.refreshSession().catch(() => {});
          }
        }
      } catch {
        logLifecycle('Auth re-validation timed out, keeping current state');
      }
      return;
    }
    initRef.current = true;
    
    logLifecycle('Auth initialization started (deferred)');
    
    // Initialize sync queue from localStorage (synchronous, fast)
    try {
      initSyncQueue();
    } catch (err) {
      console.warn('[Auth] Failed to init sync queue:', err);
    }
    
    setLoadingPhase('connecting');
    setLoadingProgress(10);
    setLoadingError(null);
    // Only reset dataLoaded if we haven't already loaded data from cache.
    // Resetting unconditionally overrides SpacesContext's cache_ready signal,
    // forcing a full Supabase round-trip even when instant cache render is available.
    // SpacesContext's fetchData will call notifyDataStatus('success') to confirm
    // cloud data once it arrives; the cache signal is safe to preserve until then.
    setDataLoaded(prev => {
      // If already true (cache was ready), keep it — don't reset
      // If false (fresh load or retry after error), keep it false so loader shows
      return prev;
    });
    setAuthReady(false);
    
    const timingId = startTiming('auth_init');
    
    try {
      // ── Step 1: Try to extract user ID from localStorage synchronously ──
      // This lets us start the profile fetch in parallel with getSession
      let cachedUserId: string | null = null;
      try {
        const localSession = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
        if (localSession) {
          const parsed = JSON.parse(localSession);
          if (
            typeof parsed?.user?.id === 'string' &&
            typeof parsed?.expires_at === 'number' &&
            parsed.expires_at * 1000 > Date.now()
          ) {
            cachedUserId = parsed.user.id;
          }
        }
      } catch { /* ignore parse errors */ }

      // ── Step 2: Fire getSession + profile fetch in parallel ──
      const sessionPromise = Promise.race([
        getSessionOnce(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Session check timed out')), 3000)
        ),
      ]).catch((err) => {
        console.warn('[Auth] Session check failed, checking localStorage fallback:', err);
        // Try localStorage recovery
        try {
          const localSession = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
          if (localSession) {
            const parsed = JSON.parse(localSession);
            if (
              typeof parsed?.access_token === 'string' &&
              typeof parsed?.expires_at === 'number' &&
              parsed.expires_at * 1000 > Date.now()
            ) {
              logLifecycle('Recovered session from localStorage');
              return { data: { session: parsed as Session } };
            }
          }
        } catch { /* ignore */ }
        return { data: { session: null } };
      });

      // Start profile fetch immediately if we have a cached user ID (don't wait for getSession).
      // Use fetchProfileOnce to deduplicate — onAuthStateChange may fire concurrently and
      // start its own fetch; sharing the same in-flight promise avoids lock contention.
      const profilePromise = cachedUserId
        ? Promise.race([
            fetchProfileOnce(cachedUserId),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]).catch(() => null)
        : Promise.resolve(null);

      setLoadingPhase('profile');
      setLoadingProgress(30);

      // Wait for both in parallel
      const [sessionResult, profileData] = await Promise.all([sessionPromise, profilePromise]);
      const existingSession = sessionResult.data?.session ?? null;

      if (existingSession?.user) {
        logLifecycle('Session found', { userId: existingSession.user.id });
        setSession(existingSession);
        setUser(existingSession.user);
        
        // Start session monitor for token refresh
        startSessionMonitor();
        
        // Track session expiry for warm resume decisions
        if (existingSession.expires_at) {
          setSessionExpiry(existingSession.expires_at * 1000);
        }
        
        // Use the already-fetched profile if user ID matches, otherwise re-fetch quickly
        if (cachedUserId === existingSession.user.id && profileData) {
          setProfile(profileData);
        } else {
          // Either user ID mismatch OR cachedUserId was null (JWT expired in localStorage)
          // OR the parallel profile fetch timed out — fetch/retry the profile now.
          try {
            let resolvedProfile = await Promise.race([
              fetchProfileOnce(existingSession.user.id),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
            ]);
            // Retry once if null — handles LockManager contention or slow network.
            // The retry MUST have its own timeout; without it a hung Supabase
            // request blocks startup indefinitely and trips the outer
            // AppStartup timeout, locking the user out cold.
            if (!resolvedProfile) {
              await new Promise(r => setTimeout(r, 1500));
              resolvedProfile = await Promise.race([
                fetchProfile(existingSession.user.id),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
              ]);
            }
            setProfile(resolvedProfile);
          } catch {
            setProfile(null);
          }
        }
        // Mark profile fetch as complete so onboarding check can be evaluated.
        // This must happen before authReady=true so ProtectedRoute never sees
        // appReady=true with profileFetched=false.
        setProfileFetched(true);

        setLoadingProgress(50);
      } else {
        logLifecycle('No session found');
        // No user = no data to load, so data is "ready"
        setDataLoaded(true);
        setLoadingPhase('complete');
        setLoadingProgress(100);
      }
      
      endTiming(timingId, existingSession ? 'session found' : 'no session');
    } catch (err) {
      console.error('Error initializing auth:', err);
      endTimingWithError(timingId, err);
      
      // Don't block app on auth errors - let user try to sign in
      logLifecycle('Auth init failed, allowing app to continue');
      setDataLoaded(true);
      setLoadingPhase('complete');
      setLoadingProgress(100);
    } finally {
      setLoading(false);
      setAuthReady(true);
    }
  }, [fetchProfileOnce, getSessionOnce]);

  // Set up auth state listener for future changes (runs immediately, no blocking)
  useEffect(() => {
    let signOutDebounce: ReturnType<typeof setTimeout> | null = null;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        logLifecycle('Auth state change', { event, hasSession: !!currentSession });
        
        // Reset data state on sign out — but suppress during resume and debounce
        if (event === 'SIGNED_OUT' || (!currentSession && event === 'TOKEN_REFRESHED')) {
          // If app was hidden less than 30s ago, this is likely a transient iOS resume gap
          // Skip entirely — the token will recover on its own
          const timeSinceHidden = Date.now() - lastHiddenAtRef.current;
          if (timeSinceHidden < 30_000 && lastHiddenAtRef.current > 0) {
            logLifecycle('Suppressing transient sign-out during resume', { timeSinceHidden, event });
            return;
          }

          // Debounce: wait 1000ms before clearing user state
          // If a new session arrives within this window, skip the clear
          if (signOutDebounce) clearTimeout(signOutDebounce);
          signOutDebounce = setTimeout(() => {
            // Only clear if still no session
            logLifecycle('Debounced sign-out executing');
            setDataLoaded(true);
            setDataReady(false);
            setLoadingPhase('complete');
            setProfile(null);
            setProfileFetched(false);
            stopSessionMonitor();
            setSession(null);
            setUser(null);
          }, 1000);
          return;
        }
        
        // Cancel any pending sign-out debounce if we got a valid session
        if (currentSession?.user && signOutDebounce) {
          clearTimeout(signOutDebounce);
          signOutDebounce = null;
        }
        
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user && event === 'SIGNED_IN') {
          // Start session monitor when user signs in
          startSessionMonitor();

          // If initializeAuth is currently running (initRef.current = true and loading
          // is still true), avoid the loading-progress setState cascade — that competition
          // caused glitchy UI during Google OAuth. BUT we must still fetch the profile
          // ourselves: if initializeAuth's getSession() returned null and committed to the
          // "no session" branch, it will NEVER call setProfileFetched(true). Without that,
          // ProtectedRoute permanently shows the transparent profile-fetch placeholder
          // even though the user is signed in. fetchProfileOnce() dedupes against any
          // concurrent fetch initializeAuth might have started, so this is safe in both
          // races (init found same session OR init found no session).
          if (initRef.current && loadingRef.current) {
            logLifecycle('SIGNED_IN: initializeAuth in progress, deferring loading state but fetching profile');
            (async () => {
              try {
                let profileData = await fetchProfileOnce(currentSession.user.id);
                if (!profileData) {
                  await new Promise(r => setTimeout(r, 1500));
                  profileData = await fetchProfile(currentSession.user.id);
                }
                setProfile(profileData);
              } catch (err) {
                console.error('[Auth] Deferred profile fetch failed:', err);
              } finally {
                // Always unblock ProtectedRoute even on profile fetch failure.
                setProfileFetched(true);
              }
            })();
            return;
          }

          // Reset data loading state when user was previously signed out
          // (re-login after sign-out in the same session). Without this, after sign-out
          // dataLoaded=true and loadingPhase='complete' are still set from the sign-out
          // path, so the app renders with empty data.
          const wasSignedOut = !userRef.current;
          if (wasSignedOut) {
            setDataLoaded(false);
            setDataReady(false);
            setLoadingPhase('profile');
            setLoadingProgress(30);
          }

          try {
            // Use fetchProfileOnce to share any in-flight fetch already started by
            // initializeAuth, preventing concurrent requests and lock contention.
            let profileData = await Promise.race([
              fetchProfileOnce(currentSession.user.id),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
            ]);
            // Retry once if null — handles LockManager contention on first attempt.
            // Retry needs its own timeout or a hung request blocks the SIGNED_IN
            // handler forever, stalling profileFetched and ProtectedRoute.
            if (!profileData) {
              await new Promise(r => setTimeout(r, 1500));
              profileData = await Promise.race([
                fetchProfile(currentSession.user.id),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
              ]);
            }
            setProfile(profileData);
          } catch (err) {
            console.error('[Auth] Unexpected error fetching profile in auth state change:', err);
            setProfile(null);
          }
          // Signal that profile fetch is complete (success or failure) so
          // ProtectedRoute can safely evaluate isOnboardingComplete.
          setProfileFetched(true);
          if (wasSignedOut) {
            setLoadingProgress(50);
          }
        }
      }
    );

    return () => {
      if (signOutDebounce) clearTimeout(signOutDebounce);
      subscription.unsubscribe();
    };
  }, [fetchProfileOnce]);

  // Single controlled entry point for SpacesContext to report data-load outcomes.
  // All loading-state mutations from SpacesContext flow through here so AuthContext
  // remains the sole owner of dataLoaded / dataReady / loadingPhase / loadingProgress /
  // loadingError. SpacesContext only describes *what happened*; this function decides
  // *what state transition to make*.
  const notifyDataStatus = useCallback((event: DataFetchEvent) => {
    switch (event.kind) {
      case 'cache_ready':
        // Local cache was pre-loaded — allow the app to render immediately.
        setDataLoaded(true);
        setDataReady(true);
        setLoadingPhase('complete');
        setLoadingProgress(100);
        break;
      case 'fetching':
        // Cloud fetch in progress — update phase/progress only, do not reset dataLoaded
        // so cached content stays visible while the background fetch runs.
        setLoadingPhase(event.phase);
        setLoadingProgress(event.progress);
        break;
      case 'success':
      case 'cache_fallback':
        // Cloud fetch succeeded, or cloud failed but cache is available as fallback.
        // Both cases mean the app has the best data currently available.
        setDataLoaded(true);
        setDataReady(true);
        setLoadingPhase('complete');
        setLoadingProgress(100);
        setLoadingError(null);
        break;
      case 'error':
        // All fetch attempts failed with no cache — show error, keep app unblocked.
        setLoadingError(event.message);
        setLoadingPhase('error');
        setDataReady(false);
        break;
      case 'signed_out':
        // User signed out; no data to wait for.
        setDataLoaded(true);
        setDataReady(true);
        setLoadingPhase('complete');
        break;
      case 'user_changed':
        // Active user switched — reset so the loader shows while the new user's data loads.
        setDataLoaded(false);
        setDataReady(false);
        break;
    }
  }, []);

  // Retry sync function - resets everything
  const retrySync = useCallback(() => {
    initRef.current = false;
    setLoading(true);
    setAuthReady(false);
    setDataReady(false);
    setDataLoaded(false);
    setLoadingPhase('connecting');
    setLoadingProgress(0);
    setLoadingError(null);
    // Re-initialize
    initializeAuth().catch(console.error);
  }, [initializeAuth]);

  const signUp = async (email: string, password: string, fullName: string, phoneNumber?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
          ...(phoneNumber ? { phone_number: phoneNumber } : {}),
        },
      },
    });
    return { error, session: data?.session ?? null };
  };

  const signIn = async (email: string, password: string) => {
    // Do NOT reset dataLoaded/loadingPhase here. Resetting forces a mandatory
    // loading screen after sign-in even when we have a fully valid appReady
    // state from the cold-start no-session path. SpacesContext fetches data
    // in the background once user state commits; the app renders immediately.
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    const userId = user?.id;
    setSignOutReason('user_initiated');
    stopSessionMonitor();

    // Reset lifecycle state so next login requires full load
    resetInitialLoad();

    // Clear cached subheadings so the next user never sees a previous user's data
    clearSubheadingsCache();

    // SAFE LOGOUT: Only clear synced operations, preserve unsynced
    if (userId) {
      const { cleared, preserved } = clearQueueForUser(userId, false);
      if (preserved > 0) {
        logLifecycle('Logout with preserved unsynced data', { preserved, userId });
      }
    }

    // Clear legacy unscoped localStorage keys that could leak between accounts.
    // These keys were used before habits moved to Supabase. They are not scoped
    // by user_id, so if they survive a sign-out they can be picked up by the
    // next account that signs in on the same device and migrated into the wrong
    // user's cloud data. Clearing them here closes that window completely.
    try {
      localStorage.removeItem('secondmind_habits');
      localStorage.removeItem('secondmind_habit_entries');
    } catch { /* ignore — storage may be unavailable */ }

    // Clear layout session so next login starts at Daily Plan
    sessionStorage.removeItem('layout_visited');
    await safeSignOut('user_initiated');
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileFetched(false);
    setDataReady(false);
    setDataLoaded(true); // No user = nothing to load
  };

  const updateProfile = async (updates: { full_name?: string; birthday?: string; location?: string }) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, ...updates }, { onConflict: 'user_id' });

    if (!error) {
      // Refresh profile data
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }

    return { error };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        authReady,
        dataReady,
        appReady,
        loadingPhase,
        loadingProgress,
        loadingError,
        setDataReady,
        setDataLoaded,
        setLoadingPhase,
        setLoadingProgress,
        setLoadingError,
        notifyDataStatus,
        retrySync,
        initializeAuth,
        signUp,
        signIn,
        signOut,
        updateProfile,
        isOnboardingComplete,
        profileFetched,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
