import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef, useMemo } from 'react';
import { Space, Item, GroupAssignments } from '@/types';
import { format } from 'date-fns';
import { supabase, SUPABASE_AUTH_STORAGE_KEY } from '@/integrations/supabase/app-client';
import { useAuth } from '@/contexts/AuthContext';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { DbSpace, DbItem } from '@/hooks/useCloudData';
import { startTiming, endTiming, endTimingWithError, logLifecycle } from '@/lib/performanceLogger';
import { withRetry } from '@/lib/networkRetry';
import { queueOperation, processQueue, getSyncState, getPendingItemIds } from '@/lib/syncQueue';
import { getSpacesCache, getItemsCache, CachedItem } from '@/lib/localCache';
import { performStartupIntegrityCheck, logIntegrityEvent } from '@/lib/dataIntegrity';
import { subscribeLifecycle, canWarmResume, markInitialLoadComplete } from '@/lib/appLifecycle';

// Convert database space to frontend Space type
function dbSpaceToSpace(dbSpace: DbSpace): Space {
  return {
    id: dbSpace.id,
    name: dbSpace.name,
    image: dbSpace.image || undefined,
    gifBackground: dbSpace.gif_background || undefined,
    color: dbSpace.color || undefined,
    itemCount: dbSpace.item_count,
    mergedFrom: dbSpace.merged_from || undefined,
    updatedAt: dbSpace.updated_at ? new Date(dbSpace.updated_at) : undefined,
    version: dbSpace.version,
    isPinned: dbSpace.is_pinned,
    pinnedAt: dbSpace.pinned_at ? new Date(dbSpace.pinned_at) : null,
    lastUsedAt: dbSpace.last_used_at ? new Date(dbSpace.last_used_at) : undefined,
    groupAssignments: dbSpace.group_assignments || null,
    isPublic: dbSpace.is_public ?? false,
    publicSlug: dbSpace.public_slug || undefined,
    publicDescription: dbSpace.public_description || undefined,
    publishedAt: dbSpace.published_at ? new Date(dbSpace.published_at) : undefined,
    authorName: dbSpace.author_name || undefined,
  };
}

// Convert database item to frontend Item type
function dbItemToItem(dbItem: DbItem): Item {
  return {
    id: dbItem.id,
    subCategory: dbItem.sub_category,
    title: dbItem.title || undefined,
    content: dbItem.content || undefined,
    blocks: dbItem.blocks || [],
    spaceIds: dbItem.space_ids || [],
    peopleIds: dbItem.people_ids || undefined,
    keywords: dbItem.keywords || undefined,
    scheduledDate: dbItem.scheduled_date || undefined,
    scheduledTime: dbItem.scheduled_time || undefined,
    color: dbItem.color || undefined,
    type: dbItem.item_type as Item['type'] || undefined,
    thumbnail: dbItem.thumbnail || undefined,
    url: dbItem.url || undefined,
    canvasX: dbItem.canvas_x ?? undefined,
    canvasY: dbItem.canvas_y ?? undefined,
    canvasZ: dbItem.canvas_z ?? undefined,
    canvasScale: dbItem.canvas_scale ?? undefined,
    aiTags: dbItem.ai_tags || undefined,
    createdAt: new Date(dbItem.created_at),
    updatedAt: dbItem.updated_at ? new Date(dbItem.updated_at) : undefined,
    version: dbItem.version,
  };
}

interface SpacesContextType {
  spaces: Space[];
  sharedSpaces: Space[];
  items: Item[];
   loading: boolean;
  addSpace: (name: string, image?: string, color?: string, gifBackground?: string) => string;
   addSpaceAsync: (name: string, image?: string, color?: string, gifBackground?: string) => Promise<string | null>;
  deleteSpace: (id: string) => void;
  moveSpace: (id: string, direction: 'up' | 'down') => void;
  reorderSpaces: (startIndex: number, endIndex: number) => void;
  updateSpaceImage: (id: string, image: string) => void;
  updateSpaceGif: (id: string, gifUrl: string | null) => void;
  updateSpaceName: (id: string, name: string) => void;
  updateSpaceColor: (id: string, color: string) => void;
  pinSpace: (id: string) => void;
  unpinSpace: (id: string) => void;
  markSpaceUsed: (id: string) => void;
  saveGroupAssignments: (id: string, assignments: GroupAssignments) => void;
  mergeSpaces: (sourceId: string, targetId: string) => void;
  duplicateSpace: (id: string) => void;
  addItem: (item: Omit<Item, 'id' | 'createdAt'>) => string;
   addItemAsync: (item: Omit<Item, 'id' | 'createdAt'>) => Promise<string | null>;
  updateItem: (id: string, updates: Partial<Pick<Item, 'title' | 'content' | 'subCategory' | 'spaceIds' | 'blocks' | 'color' | 'scheduledDate' | 'scheduledTime' | 'keywords' | 'aiTags' | 'peopleIds'>>) => void;
  updateItemPosition: (id: string, position: { x: number; y: number; z?: number; scale?: number }) => void;
  deleteItem: (id: string) => void;
  getItemsBySpaceId: (spaceId: string) => Item[];
  toggleChecklistItem: (itemId: string, blockId: string, checkItemId: string) => void;
}

const SpacesContext = createContext<SpacesContextType | undefined>(undefined);

// Only do a background refresh after a meaningful absence. Short app switches
// (checking a notification, replying to a message) don't need a full reload.
// Matches resumeHandler's BACKGROUND_THRESHOLD_MS so both systems stay in sync.
const BACKGROUND_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ─── Synchronous cache loader ────────────────────────────────────────────────
// Called once during the first render (via useState lazy initializer) so that
// spaces and items are already populated BEFORE the first paint. This eliminates
// the one-frame empty-state flash on warm resume where AppStartup skips the
// splash screen but the cache-first useEffect hadn't fired yet.
function loadInitialCacheState(): {
  spaces: Space[];
  items: Item[];
  hasCachedData: boolean;
  cachedUserId: string | null;
} {
  const empty = { spaces: [], items: [], hasCachedData: false, cachedUserId: null };
  try {
    // Derive cached user ID from localStorage auth token
    let cachedUserId: string | null = null;
    try {
      const localSession = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
      if (localSession) {
        const parsed = JSON.parse(localSession);
        if (typeof parsed?.user?.id === 'string') cachedUserId = parsed.user.id;
      }
    } catch { /* ignore parse errors */ }

    // Fallback: derive user ID from cache data itself
    if (!cachedUserId) {
      try {
        const fb = getSpacesCache().getAllIncludingDeleted();
        if (fb.length > 0) cachedUserId = fb[0].user_id;
      } catch { /* ignore */ }
    }
    if (!cachedUserId) {
      try {
        const fb = getItemsCache().getAllIncludingDeleted();
        if (fb.length > 0) cachedUserId = fb[0].user_id;
      } catch { /* ignore */ }
    }

    if (!cachedUserId) {
      logLifecycle('[Persistence] Sync cache init: no user ID found, skipping cache load');
      return empty;
    }

    const cachedSpaces = getSpacesCache().getAll();
    const cachedItems = getItemsCache().getAll();

    if (cachedSpaces.length === 0 && cachedItems.length === 0) {
      logLifecycle('[Persistence] Sync cache init: cache empty', { userId: cachedUserId });
      return { ...empty, cachedUserId };
    }

    logLifecycle('[Persistence] Sync cache init: loaded from cache synchronously', {
      spaces: cachedSpaces.length,
      items: cachedItems.length,
      userId: cachedUserId,
    });

    return {
      spaces: cachedSpaces.map(c => dbSpaceToSpace(c.data as DbSpace)),
      items: cachedItems.map(c => dbItemToItem(c.data as DbItem)),
      hasCachedData: true,
      cachedUserId,
    };
  } catch (err) {
    console.warn('[SpacesContext] Sync cache init failed:', err);
    return empty;
  }
}

export function SpacesProvider({ children }: { children: ReactNode }) {
   const { user, notifyDataStatus } = useAuth();

  // ── Synchronous cache initialization ────────────────────────────────────────
  // useState lazy initializer runs synchronously before the first render,
  // so spaces/items are already populated when the component mounts.
  // This prevents the empty-state flash on warm resume.
  const [initialCache] = useState(loadInitialCacheState);
  const [spaces, setSpaces] = useState<Space[]>(initialCache.spaces);
  const [sharedSpaces, setSharedSpaces] = useState<Space[]>([]);
  const [items, setItems] = useState<Item[]>(initialCache.items);
  // Start with loading=false if cache is populated; true if we need cloud fetch
  const [loading, setLoading] = useState(!initialCache.hasCachedData);
  const hasCleanedUp = useRef(false);
  const dbSpacesRef = useRef<DbSpace[]>([]);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const userStabilizationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pre-populate refs from sync cache init so fetchData/backgroundRefresh behave correctly
  const hasCachedDataRef = useRef(initialCache.hasCachedData);
  // Stores the user ID that was used to populate the cache-first render
  const cachedUserIdRef = useRef<string | null>(initialCache.cachedUserId);
  // Tracks whether the in-memory state actually has data. Updated on every setSpaces/setItems
  // call via the effect below. Used by fetchData to detect the "same user, empty state after
  // sign-out" case without needing spaces/items in the callback's dependency array.
  const stateHasDataRef = useRef(initialCache.spaces.length > 0 || initialCache.items.length > 0);

   // ── Cache-first: signal auth context if we already have cached data ──
   // State (spaces/items/loading) is already initialized synchronously by loadInitialCacheState.
   // This effect only signals AuthContext so AppStartup can skip the splash screen.
   useEffect(() => {
     if (initialCache.hasCachedData) {
       logLifecycle('[Persistence] Cache-first: signalling ready (data pre-loaded synchronously)', {
         spaces: initialCache.spaces.length,
         items: initialCache.items.length,
         userId: initialCache.cachedUserId,
       });
       notifyDataStatus({ kind: 'cache_ready' });
       markInitialLoadComplete();
     }
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

  // Keep stateHasDataRef in sync with actual state so fetchData can read it
  // without needing spaces/items in its dependency array.
  useEffect(() => {
    stateHasDataRef.current = spaces.length > 0 || items.length > 0;
  }, [spaces, items]);

   // Fetch data from cloud on mount/user change with integrity check
   const fetchData = useCallback(async () => {
     // Cancel any in-flight fetch
     if (fetchAbortRef.current) {
       fetchAbortRef.current.abort();
     }
     const controller = new AbortController();
     fetchAbortRef.current = controller;
     const signal = controller.signal;
     
     if (!user) {
       // Don't immediately clear if we previously had a user — stabilize first
       // This prevents cascade re-fetch on transient resume gaps
       if (previousUserIdRef.current !== null) {
         logLifecycle('User became null, starting stabilization delay');
         // Cancel any existing stabilization
         if (userStabilizationRef.current) clearTimeout(userStabilizationRef.current);
         userStabilizationRef.current = setTimeout(() => {
           // User stayed null for 500ms — this is a real logout
           logLifecycle('User stabilization: confirmed null, clearing data');
           previousUserIdRef.current = null;
           // Reset the cache flag so the next sign-in is treated as a fresh load.
           // Without this, hasCachedDataRef.current stays true after sign-out, which
           // causes fetchData on re-sign-in to silently fetch without a loading indicator
           // while displaying empty spaces/items to the user.
           hasCachedDataRef.current = false;
           userStabilizationRef.current = null;
           setSpaces([]);
           setItems([]);
           setLoading(false);
           notifyDataStatus({ kind: 'signed_out' });
         }, 500);
         return;
       }
       // No previous user. If we have cache-first data, preserve it — the user object
       // may arrive in the very next render (auth still resolving). Clearing here
       // would cause a visible flash of empty content even when the session is valid.
       if (hasCachedDataRef.current) {
         logLifecycle('[Persistence] fetchData: user null but cache-first data exists — preserving cached state while auth resolves');
         return;
       }
       logLifecycle('[Persistence] fetchData: user null and no cache — clearing to empty state, waiting for auth');
       setSpaces([]);
       setItems([]);
       setLoading(false);
       // Do NOT set dataLoaded/phase here. AuthContext owns that signal:
       // it sets dataLoaded=true on the no-session path. For the session-found
       // path, fetchData re-runs with the real user and signals complete after
       // the actual cloud fetch. Setting these prematurely caused appReady to
       // flip true before data loaded, opening the app with empty content.
       return;
     }

     // User is present — cancel any pending stabilization
     if (userStabilizationRef.current) {
       logLifecycle('User returned during stabilization, cancelling clear');
       clearTimeout(userStabilizationRef.current);
       userStabilizationRef.current = null;
     }

     // If same user ID as before AND state is actually populated, skip full re-fetch.
     // stateHasDataRef guards the edge case where the user signs out and signs back in
     // before the 500 ms stabilization timer fires: previousUserIdRef still holds the
     // old user ID and hasCachedDataRef is still true, but spaces/items were cleared by
     // sign-out. Without the stateHasDataRef check, fetchData would return early and the
     // app would stay empty with appReady=false (stuck loader).
      if (user.id === previousUserIdRef.current && hasCachedDataRef.current && stateHasDataRef.current) {
        logLifecycle('Same user returned, skipping re-fetch — re-notifying with cached data');
        // Re-signal cache_ready so AuthContext's dataLoaded is restored.
        // retrySync() resets dataLoaded=false; without this re-notify,
        // appReady stays false indefinitely when fetchData skips.
        notifyDataStatus({ kind: 'cache_ready' });
        return;
      }

     previousUserIdRef.current = user.id;

     // If the cache-first render loaded data for a different user, clear it
     // immediately so stale data isn't visible while we fetch the correct user's data
     if (hasCachedDataRef.current && cachedUserIdRef.current !== null && cachedUserIdRef.current !== user.id) {
       logLifecycle('Cache user mismatch — clearing stale cache data', {
         cachedUser: cachedUserIdRef.current,
         actualUser: user.id,
       });
       setSpaces([]);
       setItems([]);
       setLoading(true);
       notifyDataStatus({ kind: 'user_changed' });
       hasCachedDataRef.current = false;
       cachedUserIdRef.current = null;
     }

      const timingId = startTiming('initial_data_sync');
      logLifecycle('Data sync started', { userId: user.id });

      // Self-healing restore of recently soft-deleted archives/items.
      //
      // Previously this ran ONCE per user-install (guarded by a localStorage
      // flag). That meant: if an archive got soft-deleted — by a misclick,
      // a merge, a regression — and the user reopened the app even a day
      // later, the restore had already fired and the archive was permanently
      // invisible to the client even though the row still existed on the
      // server with `deleted_at` set. Multiple users reported archives
      // "disappearing" through this exact path.
      //
      // We now run the restore on every cold start with a SHORT window
      // (48 hours). That's long enough to catch accidental deletes the user
      // has noticed but not long enough to resurrect intentional deletes —
      // the user would have to reopen the app within 2 days for an
      // intentional delete to come back, which is acceptable friction for
      // the safety it buys. The window is deliberately shorter than the
      // previous 30 days precisely to avoid reviving long-intended deletes.
      //
      // IMPORTANT: awaited before the main fetch so restored rows land in
      // the very next query (fire-and-forget caused a race on mobile first
      // load where the fetch returned empty).
      const RESTORE_WINDOW_HOURS = 48;
      const windowCutoff = new Date(Date.now() - RESTORE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      await Promise.all([
        supabase
          .from('spaces')
          .update({ deleted_at: null })
          .eq('user_id', user.id)
          .not('deleted_at', 'is', null)
          .gte('deleted_at', windowCutoff)
          .select('id')
          .then(({ data, error }) => {
            if (error) logLifecycle('Space restore failed (non-critical)', { error: error.message });
            else if (data && data.length > 0) logLifecycle('Self-healing restore: recovered archives', { count: data.length });
          }),
        supabase
          .from('items')
          .update({ deleted_at: null })
          .eq('user_id', user.id)
          .not('deleted_at', 'is', null)
          .gte('deleted_at', windowCutoff)
          .select('id')
          .then(({ data, error }) => {
            if (error) logLifecycle('Item restore failed (non-critical)', { error: error.message });
            else if (data && data.length > 0) logLifecycle('Self-healing restore: recovered items', { count: data.length });
          }),
      ]).catch(() => {
        logLifecycle('Self-healing restore failed (non-critical), continuing with fetch');
      });

       const hasCachedData = hasCachedDataRef.current;
       if (!hasCachedData) {
         setLoading(true);
       }
      try {
        if (!hasCachedData) {
        // Update phase: fetching collections
        notifyDataStatus({ kind: 'fetching', phase: 'collections', progress: 60 });
        }
        
        // Timeout for mobile under resource pressure — 15s gives enough room
       // for retries on slow connections while failing fast enough to fall
       // back to cache before the ProtectedRoute safety timeout fires.
        const timeoutMs = 15000;

       // Fetch spaces and items in parallel with retry
       // IMPORTANT: Only fetch non-deleted items (soft delete filter)
       const fetchBothWithRetry = async () => {
         const collectionsTimingId = startTiming('fetch_collections');
         const itemsTimingId = startTiming('fetch_items');

         const [spacesResult, itemsResult] = await Promise.all([
           withRetry(
             async () => {
               // AbortSignal cancels this request if fetchData is called again
               const result = await supabase
                 .from('spaces')
                 .select('*')
                 .eq('user_id', user.id)
                 .is('deleted_at', null) // Soft delete filter
                 .order('position', { ascending: true })
                 .abortSignal(signal);
               if (result.error) throw result.error;
               return result;
             },
             { maxRetries: 2, silent: true }
           ),
           withRetry(
             async () => {
               const result = await supabase
                 .from('items')
                 .select('*')
                 .eq('user_id', user.id)
                 .is('deleted_at', null) // Soft delete filter
                 .order('created_at', { ascending: false })
                 .abortSignal(signal);
               if (result.error) throw result.error;
               return result;
             },
             { maxRetries: 2, silent: true }
           ),
         ]);
         
         endTiming(collectionsTimingId, `${spacesResult.data?.length ?? 0} collections`);
         endTiming(itemsTimingId, `${itemsResult.data?.length ?? 0} items`);
         
         return { spacesResult, itemsResult };
       };
       
       const timeoutPromise = new Promise<never>((_, reject) => 
         setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
       );
       
       const { spacesResult, itemsResult } = await Promise.race([
         fetchBothWithRetry(),
         timeoutPromise,
       ]);
       
       // Update phase: loading items
       notifyDataStatus({ kind: 'fetching', phase: 'items', progress: 80 });

       const dbSpaces = (spacesResult.data as DbSpace[]) || [];
       const dbItems = (itemsResult.data as DbItem[]) || [];

        // Update local caches for conflict resolution (wrapped in try-catch for storage resilience)
        try {
          const spacesCache = getSpacesCache();
          const itemsCache = getItemsCache();
          
          // Convert to cached format and merge (safe merge - never loses unsynced data)
          const cloudSpaces: CachedItem[] = dbSpaces.map(s => ({
            id: s.id,
            user_id: s.user_id,
            data: s,
            version: s.version ?? 1,
            updated_at: s.updated_at,
            deleted_at: null,
            synced: true,
            last_synced_at: new Date().toISOString(),
          }));
          
          const cloudItems: CachedItem[] = dbItems.map(i => ({
            id: i.id,
            user_id: i.user_id,
            data: i,
            version: i.version ?? 1,
            updated_at: i.updated_at,
            deleted_at: null,
            synced: true,
            last_synced_at: new Date().toISOString(),
          }));
          
          // Merge with local cache (preserves unsynced changes)
          const spacesMerge = spacesCache.mergeFromCloud(cloudSpaces);
          const itemsMerge = itemsCache.mergeFromCloud(cloudItems);
          
          // Check for unsynced local changes that need to be pushed
          if (spacesMerge.localNewer.length > 0 || itemsMerge.localNewer.length > 0) {
            logLifecycle('Found local-newer items to sync', {
              spaces: spacesMerge.localNewer.length,
              items: itemsMerge.localNewer.length,
            });
            // Process sync queue to push local changes
            processQueue();
          }
        } catch (cacheError) {
          // Cache operations failed (likely storage full) - continue with cloud data anyway
          console.warn('[SpacesContext] Cache merge failed, proceeding with cloud data:', cacheError);
          logLifecycle('Cache merge failed, continuing without cache', { 
            error: cacheError instanceof Error ? cacheError.message : 'Unknown error' 
          });
        }

       // Protect items/spaces that already have pending ops in the queue.
       // This covers two cases:
       //   1. Item EXISTS in cloud but has local edits not yet confirmed → keep local version
       //   2. Item NOT YET in cloud (insert queued but not synced) → keep local copy entirely
       // Without case-2 handling, a newly created space/item disappears on the next cloud
       // fetch because it isn't returned by Supabase until the insert is confirmed.
       const pendingItemIdsAtLoad = getPendingItemIds('items');
       const pendingSpaceIdsAtLoad = getPendingItemIds('spaces');

       dbSpacesRef.current = dbSpaces;
       setSpaces(prev => {
         const cloudSpaceIds = new Set(dbSpaces.map(s => s.id));
         const mapped = dbSpaces.map(s => {
           // Case 1: space is in cloud AND has pending local edits → keep local version
           if (pendingSpaceIdsAtLoad.has(s.id)) {
             return prev.find(ps => ps.id === s.id) ?? dbSpaceToSpace(s);
           }
           return dbSpaceToSpace(s);
         });
         if (pendingSpaceIdsAtLoad.size === 0) return mapped;
         // Case 2: spaces only in local state (insert not yet synced to cloud)
         const localOnlyPending = prev.filter(s =>
           pendingSpaceIdsAtLoad.has(s.id) && !cloudSpaceIds.has(s.id)
         );
         if (localOnlyPending.length > 0) {
           logLifecycle('[Persistence] fetchData: preserving locally-pending spaces not yet in cloud', {
             count: localOnlyPending.length,
             ids: localOnlyPending.map(s => s.id),
           });
         }
         return localOnlyPending.length === 0 ? mapped : [...mapped, ...localOnlyPending];
       });
       setItems(prev => {
         const cloudItemIds = new Set(dbItems.map(i => i.id));
         const mapped = dbItems.map(i => {
           // Case 1: item is in cloud AND has pending local edits → keep local version
           if (pendingItemIdsAtLoad.has(i.id)) {
             return prev.find(pi => pi.id === i.id) ?? dbItemToItem(i);
           }
           return dbItemToItem(i);
         });
         if (pendingItemIdsAtLoad.size === 0) return mapped;
         // Case 2: items only in local state (insert not yet synced to cloud)
         const localOnlyPending = prev.filter(i =>
           pendingItemIdsAtLoad.has(i.id) && !cloudItemIds.has(i.id)
         );
         if (localOnlyPending.length > 0) {
           logLifecycle('[Persistence] fetchData: preserving locally-pending items not yet in cloud', {
             count: localOnlyPending.length,
             ids: localOnlyPending.map(i => i.id),
           });
         }
         return localOnlyPending.length === 0 ? mapped : [...mapped, ...localOnlyPending];
       });

       // Complete! Mark data as successfully loaded
       notifyDataStatus({ kind: 'success' });

       // Fetch shared spaces (non-blocking, fire-and-forget)
       supabase
         .from('space_members')
         .select('space_id, role, accepted_at')
         .eq('user_id', user.id)
         .not('accepted_at', 'is', null)
         .then(async ({ data: memberships }) => {
           if (!memberships || memberships.length === 0) {
             setSharedSpaces([]);
             return;
           }
           const spaceIds = memberships.map(m => m.space_id);
           const { data: sharedData } = await supabase
             .from('spaces')
             .select('*')
             .in('id', spaceIds)
             .is('deleted_at', null);
           if (sharedData) {
             setSharedSpaces((sharedData as DbSpace[]).map(dbSpaceToSpace));
           }
         })
         .catch(() => { /* non-critical */ });

        // Mark initial load complete for warm resume support
        markInitialLoadComplete();
        hasCachedDataRef.current = true;
       
       endTiming(timingId, `${dbSpaces.length} collections, ${dbItems.length} items`);
       logLifecycle('Data sync completed', { 
         collections: dbSpaces.length, 
         items: dbItems.length 
       });
      } catch (err) {
        // If this fetch was superseded by a newer call, exit cleanly
        if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          logLifecycle('fetchData aborted — superseded by newer call');
          return;
        }

        console.error('Error fetching data:', err);
        endTimingWithError(timingId, err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        
        // DON'T block the app - try to use cached data
        logLifecycle('Data sync failed, checking cache', { error: errorMessage });
        
        const spacesCache = getSpacesCache();
        const itemsCache = getItemsCache();
        
        const cachedSpaces = spacesCache.getAll();
        const cachedItems = itemsCache.getAll();
        
        if (cachedSpaces.length > 0 || cachedItems.length > 0) {
          logLifecycle('Using cached data', { 
            spaces: cachedSpaces.length, 
            items: cachedItems.length 
          });
          
          // Use cached data
          setSpaces(cachedSpaces.map(c => dbSpaceToSpace(c.data as DbSpace)));
          setItems(cachedItems.map(c => dbItemToItem(c.data as DbItem)));
          
          // Mark as loaded even though we couldn't sync
          notifyDataStatus({ kind: 'cache_fallback' });
          markInitialLoadComplete();
        } else {
           // No cache — try one more clean attempt before giving up
           logLifecycle('No cache available, attempting single clean retry');
           try {
             const retryTimeout = new Promise<never>((_, reject) =>
               setTimeout(() => reject(new Error('Retry timed out')), 10000)
             );
             const [spacesRetry, itemsRetry] = await Promise.race([
               Promise.all([
                 supabase.from('spaces').select('*').eq('user_id', user.id).is('deleted_at', null).order('position', { ascending: true }).abortSignal(signal),
                 supabase.from('items').select('*').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false }).abortSignal(signal),
               ]),
               retryTimeout,
             ]) as any;
             
             if (spacesRetry.error) throw spacesRetry.error;
             if (itemsRetry.error) throw itemsRetry.error;
             
             const retrySpaces = (spacesRetry.data as DbSpace[]) || [];
             const retryItems = (itemsRetry.data as DbItem[]) || [];
             
             dbSpacesRef.current = retrySpaces;
             // Preserve locally-pending items not yet in cloud (same guard as primary fetch)
             const retryPendingSpaceIds = getPendingItemIds('spaces');
             const retryPendingItemIds = getPendingItemIds('items');
             setSpaces(prev => {
               const cloudIds = new Set(retrySpaces.map(s => s.id));
               const mapped = retrySpaces.map(dbSpaceToSpace);
               const localOnly = prev.filter(s => retryPendingSpaceIds.has(s.id) && !cloudIds.has(s.id));
               return localOnly.length === 0 ? mapped : [...mapped, ...localOnly];
             });
             setItems(prev => {
               const cloudIds = new Set(retryItems.map(i => i.id));
               const mapped = retryItems.map(dbItemToItem);
               const localOnly = prev.filter(i => retryPendingItemIds.has(i.id) && !cloudIds.has(i.id));
               return localOnly.length === 0 ? mapped : [...mapped, ...localOnly];
             });
             hasCachedDataRef.current = retrySpaces.length > 0 || retryItems.length > 0;
             notifyDataStatus({ kind: 'success' });
             markInitialLoadComplete();
             logLifecycle('Clean retry succeeded', { spaces: retrySpaces.length, items: retryItems.length });
           } catch (retryErr) {
             // Final failure — show friendly error
             console.error('Clean retry also failed:', retryErr);
             notifyDataStatus({ kind: 'error', message: "Couldn't reach the server. Please check your connection and try again." });
             
             if (user) {
               logIntegrityEvent(user.id, 'sync_failure', {
                 error: errorMessage,
                 retryError: retryErr instanceof Error ? retryErr.message : 'Unknown',
                 phase: 'initial_fetch',
               });
             }
           }
        }
      } finally {
        setLoading(false);
      }
   }, [user, notifyDataStatus]);
 
   useEffect(() => {
     fetchData();
   }, [fetchData]);

   // Background refresh on app resume (no loading state change)
   const backgroundRefresh = useCallback(async () => {
     if (!user) return;
     
     logLifecycle('Background refresh started');
     const timingId = startTiming('background_refresh');
     
     try {
       const [spacesResult, itemsResult] = await Promise.all([
         supabase
           .from('spaces')
           .select('*')
           .eq('user_id', user.id)
           .is('deleted_at', null)
           .order('position', { ascending: true }),
         supabase
           .from('items')
           .select('*')
           .eq('user_id', user.id)
           .is('deleted_at', null)
           .order('created_at', { ascending: false }),
       ]);
       
       if (spacesResult.error) throw spacesResult.error;
       if (itemsResult.error) throw itemsResult.error;
       
       const dbSpaces = (spacesResult.data as DbSpace[]) || [];
       const dbItems = (itemsResult.data as DbItem[]) || [];
       
        // Silently update state (no loading indicators).
        // Protect items/spaces that have pending (unconfirmed) sync operations —
        // their optimistic local version is newer than what the DB has returned.
        // Also preserve locally-pending items not yet confirmed in cloud (same
        // fix as in fetchData — prevents newly created items from disappearing).
        const pendingItemIds = getPendingItemIds('items');
        const pendingSpaceIds = getPendingItemIds('spaces');

        dbSpacesRef.current = dbSpaces;
        setSpaces(prev => {
          const cloudSpaceIds = new Set(dbSpaces.map(s => s.id));
          const mapped = dbSpaces.map(s => {
            if (pendingSpaceIds.has(s.id)) {
              return prev.find(ps => ps.id === s.id) ?? dbSpaceToSpace(s);
            }
            return dbSpaceToSpace(s);
          });
          if (pendingSpaceIds.size === 0) return mapped;
          const localOnlyPending = prev.filter(s =>
            pendingSpaceIds.has(s.id) && !cloudSpaceIds.has(s.id)
          );
          return localOnlyPending.length === 0 ? mapped : [...mapped, ...localOnlyPending];
        });
        setItems(prev => {
          const cloudItemIds = new Set(dbItems.map(i => i.id));
          const mapped = dbItems.map(i => {
            if (pendingItemIds.has(i.id)) {
              return prev.find(pi => pi.id === i.id) ?? dbItemToItem(i);
            }
            return dbItemToItem(i);
          });
          if (pendingItemIds.size === 0) return mapped;
          const localOnlyPending = prev.filter(i =>
            pendingItemIds.has(i.id) && !cloudItemIds.has(i.id)
          );
          return localOnlyPending.length === 0 ? mapped : [...mapped, ...localOnlyPending];
        });
        
        // Update caches (wrapped in try-catch for storage resilience)
        try {
          const spacesCache = getSpacesCache();
          const itemsCache = getItemsCache();
          
          const cloudSpaces: CachedItem[] = dbSpaces.map(s => ({
            id: s.id,
            user_id: s.user_id,
            data: s,
            version: s.version ?? 1,
            updated_at: s.updated_at,
            deleted_at: null,
            synced: true,
            last_synced_at: new Date().toISOString(),
          }));
          
          const cloudItems: CachedItem[] = dbItems.map(i => ({
            id: i.id,
            user_id: i.user_id,
            data: i,
            version: i.version ?? 1,
            updated_at: i.updated_at,
            deleted_at: null,
            synced: true,
            last_synced_at: new Date().toISOString(),
          }));
          
          spacesCache.mergeFromCloud(cloudSpaces);
          itemsCache.mergeFromCloud(cloudItems);
        } catch (cacheError) {
          // Background cache update failed - not critical, just log it
          console.warn('[SpacesContext] Background cache update failed:', cacheError);
        }
       
       // Process any pending sync operations
       processQueue();
       
       endTiming(timingId, `${dbSpaces.length} spaces, ${dbItems.length} items`);
       logLifecycle('Background refresh completed');
     } catch (err) {
       endTimingWithError(timingId, err);
       console.warn('[SpacesContext] Background refresh failed:', err);
       // Don't show error to user - this is silent background refresh
     }
   }, [user]);

   // Flush pending sync queue operations when the user navigates away or closes the tab.
  // This gives in-flight writes the best chance of succeeding before the page unloads.
  useEffect(() => {
    const handleBeforeUnload = () => { processQueue(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Subscribe to app lifecycle events for background refresh.
   useEffect(() => {
     const unsubscribe = subscribeLifecycle((event) => {
       if (
         event.type === 'foreground' &&
         event.wasBackground &&
         event.backgroundDuration >= BACKGROUND_REFRESH_THRESHOLD_MS
       ) {
         if (user && canWarmResume()) {
           logLifecycle('App resumed after meaningful absence, triggering background refresh', {
             backgroundDuration: event.backgroundDuration
           });
           backgroundRefresh();
         }
       }
     });

     return unsubscribe;
   }, [user, backgroundRefresh]);
 
   // Past items are intentionally preserved - no auto-cleanup
   // Users can manually delete items they no longer need

   const getNextSpacePosition = useCallback((): number => {
     const positions = dbSpacesRef.current
       .map((s) => s.position)
       .filter((p): p is number => Number.isFinite(p));
     const maxPos = positions.length > 0 ? Math.max(...positions) : -1;
     return maxPos + 1;
   }, []);

    // Sync version with queue-based persistence
    const addSpace = (name: string, image?: string, color?: string, gifBackground?: string): string => {
     const newId = crypto.randomUUID();

     // Require authentication — without a user the space would only exist locally
     // and silently disappear on the next page load when data is re-fetched from cloud.
     if (!user) {
       showErrorPopup('Please sign in to create an archive.');
       return newId;
     }

       // Add optimistically
       setSpaces(prev => [...prev, { id: newId, name, image, color, gifBackground, itemCount: 0 }]);

      // Queue for cloud save (will persist and retry automatically)
      if (user) {
         const maxPosition = getNextSpacePosition();
         const nowIso = new Date().toISOString();

          const dbSpace: DbSpace = {
           id: newId,
           user_id: user.id,
           name,
           image: image || null,
           color: color || null,
           item_count: 0,
           merged_from: null,
           position: maxPosition,
           created_at: nowIso,
           updated_at: nowIso,
           deleted_at: null,
           version: 1,
           is_pinned: false,
           pinned_at: null,
           last_used_at: nowIso,
           group_assignments: null,
           gif_background: gifBackground || null,
          };

         dbSpacesRef.current.push(dbSpace);

         // Update local cache immediately so page reloads show the new archive
         try {
           getSpacesCache().set({
             id: newId,
             user_id: user.id,
             data: dbSpace,
             version: 1,
             updated_at: nowIso,
             deleted_at: null,
             synced: false,
             last_synced_at: null,
           }, false);
         } catch { /* non-critical */ }

         // Queue the operation for reliable persistence
         queueOperation('spaces', 'insert', {
           id: newId,
           user_id: user.id,
           name,
           image: image || null,
           color: color || null,
           gif_background: gifBackground || null,
           position: maxPosition,
         }, user.id);
      }

     return newId;
   };
 
   // Async version that returns real ID with retry logic
   const addSpaceAsync = async (name: string, image?: string, color?: string, gifBackground?: string): Promise<string | null> => {
     if (!user) {
        showErrorPopup('Please sign in to create a collection.');
       return null;
     }

     const id = crypto.randomUUID();
     const position = getNextSpacePosition();
     const nowIso = new Date().toISOString();

     // Retry logic for network resilience
     const maxRetries = 3;
     let lastError: Error | null = null;

     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         const { error } = await supabase
           .from('spaces')
           .insert({
             id,
             user_id: user.id,
             name,
             image: image || null,
             color: color || null,
             gif_background: gifBackground || null,
             position,
           });

         if (error) {
           // Check for duplicate key error (already created on previous attempt)
           if (error.code === '23505') {
             console.log('Space already exists, treating as success');
             // Fall through to success handling
           } else {
             throw error;
           }
         }

         // Success! Update local state
          const dbSpace: DbSpace = {
           id,
           user_id: user.id,
           name,
           image: image || null,
           color: color || null,
           gif_background: gifBackground || null,
           item_count: 0,
           merged_from: null,
           position,
           created_at: nowIso,
           updated_at: nowIso,
           deleted_at: null,
           version: 1,
           is_pinned: false,
           group_assignments: null,
           pinned_at: null,
           last_used_at: nowIso,
         };

         dbSpacesRef.current.push(dbSpace);
         setSpaces(prev => [...prev, dbSpaceToSpace(dbSpace)]);

         // Update local cache immediately so page reloads show the new archive
         try {
           getSpacesCache().set({
             id,
             user_id: user.id,
             data: dbSpace,
             version: dbSpace.version ?? 1,
             updated_at: nowIso,
             deleted_at: null,
             synced: true,
             last_synced_at: nowIso,
           }, true);
         } catch { /* non-critical */ }

         return id;
       } catch (err) {
         lastError = err instanceof Error ? err : new Error(String(err));
         console.warn(`Space creation attempt ${attempt}/${maxRetries} failed:`, err);
         
         // Don't retry on auth errors
         if (lastError.message?.includes('JWT') || lastError.message?.includes('auth')) {
           break;
         }
         
         // Wait before retry with exponential backoff
         if (attempt < maxRetries) {
           await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
         }
       }
     }
     
     // All retries failed — fall back to queue-based persistence so the archive is never lost
     console.warn('[addSpaceAsync] Direct insert failed after all retries, queuing for background sync:', lastError);

     const dbSpace: DbSpace = {
       id,
       user_id: user.id,
       name,
       image: image || null,
       color: color || null,
       gif_background: gifBackground || null,
       item_count: 0,
       merged_from: null,
       position,
       created_at: nowIso,
       updated_at: nowIso,
       deleted_at: null,
       version: 1,
       is_pinned: false,
       group_assignments: null,
       pinned_at: null,
       last_used_at: nowIso,
     };

     dbSpacesRef.current.push(dbSpace);
     setSpaces(prev => [...prev, dbSpaceToSpace(dbSpace)]);

     try {
       getSpacesCache().set({
         id,
         user_id: user.id,
         data: dbSpace,
         version: 1,
         updated_at: nowIso,
         deleted_at: null,
         synced: false,
         last_synced_at: null,
       }, false);
     } catch { /* non-critical */ }

     queueOperation('spaces', 'insert', {
       id,
       user_id: user.id,
       name,
       image: image || null,
       color: color || null,
       gif_background: gifBackground || null,
       position,
     }, user.id);

     return id;
   };

  const updateSpaceName = (id: string, name: string) => {
    setSpaces(prev => prev.map(space => 
      space.id === id ? { ...space, name } : space
    ));

    // Update local cache immediately so restarts reflect the latest name
    try {
      const cache = getSpacesCache();
      const existing = cache.get(id);
      if (existing) {
        cache.set({ ...existing, data: { ...existing.data, name }, updated_at: new Date().toISOString() });
        logLifecycle('[Persistence] Space name written to local cache', { id });
      }
    } catch { /* non-critical */ }

    if (user) {
      queueOperation('spaces', 'update', { id, name }, user.id);
    }
  };

   const pinSpace = (id: string) => {
     const nowIso = new Date().toISOString();
     setSpaces(prev => prev.map(space =>
       space.id === id ? { ...space, isPinned: true, pinnedAt: new Date() } : space
     ));
     // Update local cache
     try {
       const cache = getSpacesCache();
       const existing = cache.get(id);
       if (existing) {
         cache.set({ ...existing, data: { ...existing.data, is_pinned: true, pinned_at: nowIso }, updated_at: nowIso });
         logLifecycle('[Persistence] Space pin written to local cache', { id });
       }
     } catch { /* non-critical */ }
     if (user) {
       queueOperation('spaces', 'update', { id, is_pinned: true, pinned_at: nowIso }, user.id);
     }
   };

   const unpinSpace = (id: string) => {
     const nowIso = new Date().toISOString();
     setSpaces(prev => prev.map(space =>
       space.id === id ? { ...space, isPinned: false, pinnedAt: null } : space
     ));
     // Update local cache
     try {
       const cache = getSpacesCache();
       const existing = cache.get(id);
       if (existing) {
         cache.set({ ...existing, data: { ...existing.data, is_pinned: false, pinned_at: null }, updated_at: nowIso });
         logLifecycle('[Persistence] Space unpin written to local cache', { id });
       }
     } catch { /* non-critical */ }
     if (user) {
       queueOperation('spaces', 'update', { id, is_pinned: false, pinned_at: null }, user.id);
     }
   };

   const markSpaceUsed = useCallback((id: string) => {
     const nowIso = new Date().toISOString();
     setSpaces(prev => prev.map(space =>
       space.id === id ? { ...space, lastUsedAt: new Date() } : space
     ));
     // Update local cache
     try {
       const cache = getSpacesCache();
       const existing = cache.get(id);
       if (existing) {
         cache.set({ ...existing, data: { ...existing.data, last_used_at: nowIso }, updated_at: nowIso });
       }
     } catch { /* non-critical */ }
     if (user) {
       queueOperation('spaces', 'update', { id, last_used_at: nowIso }, user.id);
     }
   // queueOperation is a stable module-level function (not a hook value) —
  // omitting it from deps prevents unnecessary re-creation of this callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

   const saveGroupAssignments = (id: string, assignments: GroupAssignments) => {
    const nowIso = new Date().toISOString();
    setSpaces(prev => prev.map(space =>
      space.id === id ? { ...space, groupAssignments: assignments } : space
    ));
    // Update local cache
    try {
      const cache = getSpacesCache();
      const existing = cache.get(id);
      if (existing) {
        cache.set({ ...existing, data: { ...existing.data, group_assignments: assignments }, updated_at: nowIso });
        logLifecycle('[Persistence] Space group assignments written to local cache', { id });
      }
    } catch { /* non-critical */ }
    if (user) {
      queueOperation('spaces', 'update', { id, group_assignments: assignments }, user.id);
    }
  };

  const updateSpaceColor = (id: string, color: string) => {
    setSpaces(prev => prev.map(space => 
      space.id === id ? { ...space, color } : space
    ));

    // Update local cache immediately so restarts reflect the latest color
    try {
      const cache = getSpacesCache();
      const existing = cache.get(id);
      if (existing) {
        cache.set({ ...existing, data: { ...existing.data, color }, updated_at: new Date().toISOString() });
        logLifecycle('[Persistence] Space color written to local cache', { id });
      }
    } catch { /* non-critical */ }

    if (user) {
      queueOperation('spaces', 'update', { id, color }, user.id);
    }
  };

  const mergeSpaces = (sourceId: string, targetId: string) => {
    const sourceSpace = spaces.find(s => s.id === sourceId);
    const targetSpace = spaces.find(s => s.id === targetId);

    if (!sourceSpace || !targetSpace) return;

    const nowIso = new Date().toISOString();

    // Compute new space_ids for each affected item (replace source with target)
    const affectedItems = items.filter(item => item.spaceIds?.includes(sourceId));
    const updatedItemSpaceIds = new Map<string, string[]>();
    affectedItems.forEach(item => {
      const newIds = [...new Set([...(item.spaceIds || []).filter(sid => sid !== sourceId), targetId])];
      updatedItemSpaceIds.set(item.id, newIds);
    });

    // Optimistic: update items
    setItems(prev => prev.map(item => {
      const newIds = updatedItemSpaceIds.get(item.id);
      return newIds ? { ...item, spaceIds: newIds } : item;
    }));

    // Optimistic: update target space + remove source space
    setSpaces(prev => prev
      .map(space =>
        space.id === targetId
          ? {
              ...space,
              itemCount: space.itemCount + sourceSpace.itemCount,
              mergedFrom: [...(space.mergedFrom || []), sourceId],
            }
          : space
      )
      .filter(space => space.id !== sourceId)
    );

    if (user) {
      // Queue each affected item's space_ids update for reliable cloud persistence
      updatedItemSpaceIds.forEach((newIds, itemId) => {
        queueOperation('items', 'update', { id: itemId, space_ids: newIds }, user.id);
        // Update local cache so changes survive a restart
        try {
          const cache = getItemsCache();
          const existing = cache.get(itemId);
          if (existing) {
            cache.set({
              ...existing,
              data: { ...existing.data, space_ids: newIds, updated_at: nowIso },
              updated_at: nowIso,
            });
          }
        } catch { /* non-critical */ }
      });

      // Queue target space update (merged_from list)
      const newMergedFrom = [...(targetSpace.mergedFrom || []), sourceId];
      queueOperation('spaces', 'update', { id: targetId, merged_from: newMergedFrom }, user.id);
      try {
        const cache = getSpacesCache();
        const existing = cache.get(targetId);
        if (existing) {
          cache.set({
            ...existing,
            data: { ...existing.data, merged_from: newMergedFrom, updated_at: nowIso },
            updated_at: nowIso,
          });
        }
      } catch { /* non-critical */ }

      // Soft-delete the source space
      queueOperation('spaces', 'soft_delete', { id: sourceId }, user.id);
      try { getSpacesCache().softDelete(sourceId); } catch { /* non-critical */ }

      logLifecycle('[Persistence] mergeSpaces: queued updates', {
        sourceId,
        targetId,
        affectedItems: affectedItems.length,
      });
    }
  };

  const duplicateSpace = (id: string) => {
    const space = spaces.find(s => s.id === id);
    if (!space) return;

    const spaceIndex = spaces.findIndex(s => s.id === id);
    // Use a pre-generated UUID so the optimistic ID matches the DB row ID.
    // This avoids a temp→real ID swap after the DB responds (which caused flickering
    // and broke navigation to /space/:id during the async window).
    const newId = crypto.randomUUID();
    const newSpaceName = `${space.name} (copy)`;
    const nowIso = new Date().toISOString();

     // Optimistic update
     setSpaces(prev => {
       const newSpace: Space = {
         id: newId,
         name: newSpaceName,
         image: space.image,
         color: space.color,
         gifBackground: space.gifBackground,
         itemCount: 0,
       };
       return [
         ...prev.slice(0, spaceIndex + 1),
         newSpace,
         ...prev.slice(spaceIndex + 1)
       ];
     });

     if (!user) return;

     // Write to local cache immediately so the duplicate survives a reload
     // even before the DB insert completes
     const optimisticDbSpace: DbSpace = {
       id: newId,
       user_id: user.id,
       name: newSpaceName,
       image: space.image || null,
       color: space.color || null,
       gif_background: space.gifBackground || null,
       item_count: 0,
       merged_from: null,
       position: spaceIndex + 1,
       created_at: nowIso,
       updated_at: nowIso,
       deleted_at: null,
       version: 1,
       is_pinned: false,
       group_assignments: null,
       pinned_at: null,
       last_used_at: nowIso,
     };
     try {
       getSpacesCache().set({
         id: newId,
         user_id: user.id,
         data: optimisticDbSpace,
         version: 1,
         updated_at: nowIso,
         deleted_at: null,
         synced: false,
         last_synced_at: null,
       }, false);
     } catch { /* non-critical */ }

     // Save to cloud using the pre-generated UUID as the row ID
     const position = spaceIndex + 1;
     supabase
       .from('spaces')
       .insert({
         id: newId,
         user_id: user.id,
         name: newSpaceName,
         image: space.image || null,
         color: space.color || null,
         gif_background: space.gifBackground || null,
         position,
       })
       .select()
       .single()
       .then(({ data, error }) => {
         if (error) {
           console.error('Error duplicating space:', error);
           showErrorPopup('Failed to duplicate collection.');
           setSpaces(prev => prev.filter(s => s.id !== newId));
           try { getSpacesCache().softDelete(newId); } catch { /* non-critical */ }
         } else if (data) {
           const dbSpace = data as DbSpace;
           dbSpacesRef.current.push(dbSpace);
           // Update state with server-returned data (version, timestamps)
           setSpaces(prev => prev.map(s => s.id === newId ? dbSpaceToSpace(dbSpace) : s));
           // Mark as synced in local cache
           try {
             getSpacesCache().set({
               id: newId,
               user_id: user.id,
               data: dbSpace,
               version: dbSpace.version ?? 1,
               updated_at: dbSpace.updated_at,
               deleted_at: null,
               synced: true,
               last_synced_at: nowIso,
             }, true);
           } catch { /* non-critical */ }
         }
       });
  };

  // SOFT DELETE: Mark as deleted but keep in database for recovery
  const deleteSpace = (id: string) => {
     setSpaces(prev => prev.filter(space => space.id !== id));
     dbSpacesRef.current = dbSpacesRef.current.filter(s => s.id !== id);
     
     // Update local cache
     getSpacesCache().softDelete(id);
      
      if (user) {
        // Queue SOFT DELETE for reliable persistence (can be recovered)
        queueOperation('spaces', 'soft_delete', { id }, user.id);
      }
   };

  const moveSpace = (id: string, direction: 'up' | 'down') => {
    setSpaces(prev => {
      const index = prev.findIndex(s => s.id === id);
      if (index === -1) return prev;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      
      const newSpaces = [...prev];
      [newSpaces[index], newSpaces[newIndex]] = [newSpaces[newIndex], newSpaces[index]];
        
        // Queue position updates
        if (user) {
          newSpaces.forEach((s, i) => {
            queueOperation('spaces', 'update', { id: s.id, position: i }, user.id);
          });
        }
        
      return newSpaces;
    });
  };

  const reorderSpaces = (startIndex: number, endIndex: number) => {
    setSpaces(prev => {
      const result = [...prev];
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
        
        // Queue position updates
        if (user) {
          result.forEach((s, i) => {
            queueOperation('spaces', 'update', { id: s.id, position: i }, user.id);
          });
        }
        
      return result;
    });
  };

  const updateSpaceImage = (id: string, image: string) => {
    setSpaces(prev => prev.map(space =>
      space.id === id ? { ...space, image } : space
    ));

    // Update local cache immediately so restarts reflect the latest background image
    try {
      const cache = getSpacesCache();
      const existing = cache.get(id);
      if (existing) {
        cache.set({ ...existing, data: { ...existing.data, image }, updated_at: new Date().toISOString() });
        logLifecycle('[Persistence] Space image written to local cache', { id });
      }
    } catch (_e) { /* non-critical */ }

    if (user) {
      queueOperation('spaces', 'update', { id, image }, user.id);
    }
  };

  const updateSpaceGif = (id: string, gifUrl: string | null) => {
    setSpaces(prev => prev.map(space =>
      space.id === id ? { ...space, gifBackground: gifUrl ?? undefined } : space
    ));

    // Update local cache immediately so restarts reflect the latest GIF background
    try {
      const nowIso = new Date().toISOString();
      const cache = getSpacesCache();
      const existing = cache.get(id);
      if (existing) {
        cache.set({ ...existing, data: { ...existing.data, gif_background: gifUrl }, updated_at: nowIso });
        logLifecycle('[Persistence] Space gif written to local cache', { id });
      }
    } catch { /* non-critical */ }

    if (user) {
      queueOperation('spaces', 'update', { id, gif_background: gifUrl }, user.id);
    }
  };

  const addItem = (itemData: Omit<Item, 'id' | 'createdAt'>): string => {
    // Without a user the item only lives locally and disappears on the next
    // data fetch. Surface the auth requirement early rather than silently losing data.
    if (!user) {
      showErrorPopup('Please sign in to save items.');
      return crypto.randomUUID();
    }
    let blocks = itemData.blocks;
    if (!blocks || blocks.length === 0) {
      if (itemData.content) {
        blocks = [{ id: Date.now().toString(), type: 'text', content: itemData.content }];
      } else {
        blocks = [];
      }
    }
    
    const newItemId = crypto.randomUUID();
    const newItem: Item = {
      ...itemData,
      blocks,
      id: newItemId,
      createdAt: new Date(),
    };
    setItems(prev => [newItem, ...prev]);
    
     const addItemSpaceIds = itemData.spaceIds;
     const shouldUpdateSpaceCount = addItemSpaceIds &&
       addItemSpaceIds.length > 0 &&
       itemData.subCategory !== 'todo' &&
       itemData.subCategory !== 'scheduling';

    if (shouldUpdateSpaceCount) {
      setSpaces(prev => prev.map(space =>
        addItemSpaceIds.includes(space.id)
          ? { ...space, itemCount: space.itemCount + 1 }
          : space
      ));
    }
    
     // Queue for cloud save (will persist and retry automatically)
     if (user) {
       const nowIso = new Date().toISOString();
       const dbItemData = {
         id: newItemId,
         user_id: user.id,
         sub_category: itemData.subCategory,
         title: itemData.title || null,
         content: itemData.content || null,
         blocks: blocks as any,
         space_ids: itemData.spaceIds || [],
         people_ids: itemData.peopleIds || null,
         keywords: itemData.keywords || null,
         scheduled_date: itemData.scheduledDate || null,
         scheduled_time: itemData.scheduledTime || null,
         color: itemData.color || null,
         item_type: itemData.type || null,
         thumbnail: itemData.thumbnail || null,
         url: itemData.url || null,
         canvas_x: itemData.canvasX ?? null,
         canvas_y: itemData.canvasY ?? null,
         canvas_z: itemData.canvasZ ?? null,
         canvas_scale: itemData.canvasScale ?? null,
       };
       queueOperation('items', 'insert', dbItemData, user.id);

       // Write to local cache immediately so the item survives a restart
       // even if the sync queue hasn't processed yet (e.g. offline scenario)
       try {
         getItemsCache().set({
           id: newItemId,
           user_id: user.id,
           data: {
             ...dbItemData,
             created_at: nowIso,
             updated_at: nowIso,
             deleted_at: null,
             version: 1,
             ai_processed: null,
             extracted_people: null,
             ai_summary: null,
             suggested_space: null,
             ai_tags: null,
           },
           version: 1,
           updated_at: nowIso,
           deleted_at: null,
           synced: false,
           last_synced_at: null,
         }, false);
         logLifecycle('[Persistence] New item written to local cache', { id: newItemId });
       } catch { /* non-critical */ }
     }
    
    return newItemId;
  };
 
   const addItemAsync = async (itemData: Omit<Item, 'id' | 'createdAt'>): Promise<string | null> => {
     if (!user) {
       // Fallback: use synchronous addItem which checks user internally
       // and shows its own error. This prevents silent null returns.
       console.warn('[addItemAsync] No user, falling back to addItem');
       return addItem(itemData);
     }

     let blocks = itemData.blocks;
     if (!blocks || blocks.length === 0) {
       if (itemData.content) {
         blocks = [{ id: Date.now().toString(), type: 'text', content: itemData.content }];
       } else {
         blocks = [];
       }
     }

     // Prepare fallback data upfront so the catch block can't fail
     const fallbackItemId = crypto.randomUUID();
     const nowIso = new Date().toISOString();
     const dbItemData = {
       id: fallbackItemId,
       user_id: user.id,
       sub_category: itemData.subCategory,
       title: itemData.title || null,
       content: itemData.content || null,
       blocks: blocks as any,
       space_ids: itemData.spaceIds || [],
       people_ids: itemData.peopleIds || null,
       keywords: itemData.keywords || null,
       scheduled_date: itemData.scheduledDate || null,
       scheduled_time: itemData.scheduledTime || null,
       color: itemData.color || null,
       item_type: itemData.type || null,
       thumbnail: itemData.thumbnail || null,
       url: itemData.url || null,
       canvas_x: itemData.canvasX ?? null,
       canvas_y: itemData.canvasY ?? null,
       canvas_z: itemData.canvasZ ?? null,
       canvas_scale: itemData.canvasScale ?? null,
     };

     try {
       const { data, error } = await supabase
         .from('items')
          .insert([dbItemData])
         .select()
         .single();

       if (error) throw error;

       const dbItem = data as DbItem;
       const newItem = dbItemToItem(dbItem);
       setItems(prev => [newItem, ...prev]);

       const itemSpaceIds = itemData.spaceIds;
       const shouldUpdateSpaceCount = itemSpaceIds &&
         itemSpaceIds.length > 0 &&
         itemData.subCategory !== 'todo' &&
         itemData.subCategory !== 'scheduling';

        if (shouldUpdateSpaceCount) {
          setSpaces(prev => prev.map(space =>
            itemSpaceIds.includes(space.id)
              ? { ...space, itemCount: space.itemCount + 1, lastUsedAt: new Date() }
              : space
          ));
          // Also update last_used_at in DB for affected spaces
          itemSpaceIds.forEach(spaceId => {
            queueOperation('spaces', 'update', { id: spaceId, last_used_at: nowIso }, user.id);
          });
        }

       return dbItem.id;
     } catch (err) {
       console.error('Error creating item (direct insert failed, falling back to queue):', err);
       // Fall back to sync queue so the item is retried automatically
       try {
         const newItem: Item = {
           id: fallbackItemId,
           subCategory: itemData.subCategory,
           title: itemData.title || undefined,
           content: itemData.content || undefined,
           blocks: blocks || [],
           spaceIds: itemData.spaceIds || [],
           peopleIds: itemData.peopleIds || undefined,
           keywords: itemData.keywords || undefined,
           scheduledDate: itemData.scheduledDate || undefined,
           scheduledTime: itemData.scheduledTime || undefined,
           color: itemData.color || undefined,
           type: itemData.type || undefined,
           thumbnail: itemData.thumbnail || undefined,
           url: itemData.url || undefined,
           createdAt: new Date(),
         };
         setItems(prev => [newItem, ...prev]);
       } catch { /* item display is non-critical */ }
       queueOperation('items', 'insert', dbItemData, user.id);
       try {
         getItemsCache().set({ id: fallbackItemId, user_id: user.id, data: { ...dbItemData, created_at: nowIso, updated_at: nowIso, deleted_at: null, version: 1, ai_processed: null, extracted_people: null, ai_summary: null, suggested_space: null, ai_tags: null }, version: 1, updated_at: nowIso, deleted_at: null, synced: false, last_synced_at: null }, false);
       } catch { /* non-critical */ }
       return fallbackItemId;
     }
   };

  const updateItem = (id: string, updates: Partial<Pick<Item, 'title' | 'content' | 'subCategory' | 'spaceIds' | 'blocks' | 'color' | 'scheduledDate' | 'scheduledTime' | 'keywords' | 'aiTags' | 'peopleIds'>>) => {
    const updatedAt = new Date();
    const nowIso = updatedAt.toISOString();
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates, updatedAt } : item
    ));

    if (user) {
      const dbUpdates: Record<string, any> = { id };
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.content !== undefined) dbUpdates.content = updates.content;
      if (updates.subCategory !== undefined) dbUpdates.sub_category = updates.subCategory;
      if (updates.spaceIds !== undefined) dbUpdates.space_ids = updates.spaceIds;
      if (updates.blocks !== undefined) dbUpdates.blocks = updates.blocks;
      if (updates.color !== undefined) dbUpdates.color = updates.color;
      if (updates.scheduledDate !== undefined) dbUpdates.scheduled_date = updates.scheduledDate;
      if (updates.scheduledTime !== undefined) dbUpdates.scheduled_time = updates.scheduledTime;
      if (updates.keywords !== undefined) dbUpdates.keywords = updates.keywords;
      if (updates.aiTags !== undefined) dbUpdates.ai_tags = updates.aiTags;
      if (updates.peopleIds !== undefined) dbUpdates.people_ids = updates.peopleIds;

      // Update local cache immediately so restarts reflect the latest content
      try {
        const cache = getItemsCache();
        const existing = cache.get(id);
        if (existing) {
          const { id: _id, ...cacheFields } = dbUpdates;
          cache.set({ ...existing, data: { ...existing.data, ...cacheFields, updated_at: nowIso }, updated_at: nowIso });
        }
      } catch { /* non-critical */ }

      // Queue the update for reliable persistence
      queueOperation('items', 'update', dbUpdates, user.id);
    }
  };

  // Debounced position updates to reduce database writes during rapid dragging
  const positionUpdateTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clear all pending position timers on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      positionUpdateTimers.current.forEach(timer => clearTimeout(timer));
      positionUpdateTimers.current.clear();
    };
  }, []);

  const updateItemPosition = useCallback((id: string, position: { x: number; y: number; z?: number; scale?: number }) => {
    // Optimistic update immediately
    setItems(prev => prev.map(item => 
      item.id === id 
        ? { 
            ...item, 
            canvasX: position.x, 
            canvasY: position.y,
            canvasZ: position.z ?? item.canvasZ,
            canvasScale: position.scale ?? item.canvasScale,
          } 
        : item
    ));
    
    if (!user) return;
    
    // Cancel any pending update for this item
    const existingTimer = positionUpdateTimers.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Debounce the database update (300ms) then queue for reliable persistence
    const timer = setTimeout(() => {
      const dbUpdates: Record<string, any> = {
        id,
        canvas_x: position.x,
        canvas_y: position.y,
      };
      if (position.z !== undefined) dbUpdates.canvas_z = position.z;
      if (position.scale !== undefined) dbUpdates.canvas_scale = position.scale;

      // Update local cache so canvas positions survive a restart
      try {
        const nowIso = new Date().toISOString();
        const cache = getItemsCache();
        const existing = cache.get(id);
        if (existing) {
          const { id: _id, ...cacheFields } = dbUpdates;
          cache.set({ ...existing, data: { ...existing.data, ...cacheFields, updated_at: nowIso }, updated_at: nowIso });
        }
      } catch { /* non-critical */ }

      // Queue the update for reliable persistence
      queueOperation('items', 'update', dbUpdates, user.id);

      positionUpdateTimers.current.delete(id);
    }, 300);
    
    positionUpdateTimers.current.set(id, timer);
  }, [user]);

  // SOFT DELETE: Mark as deleted but keep in database for recovery
  const deleteItem = (id: string) => {
    const item = items.find(i => i.id === id);
      
    if (item) {
      setItems(prev => prev.filter(i => i.id !== id));
      
      // Update local cache
      getItemsCache().softDelete(id);
      
       const deleteSpaceIds = item.spaceIds;
       const shouldUpdateSpaceCount = deleteSpaceIds &&
         deleteSpaceIds.length > 0 &&
         item.subCategory !== 'todo' &&
         item.subCategory !== 'scheduling';

      if (shouldUpdateSpaceCount) {
        setSpaces(prev => prev.map(space =>
          deleteSpaceIds.includes(space.id)
            ? { ...space, itemCount: Math.max(0, space.itemCount - 1) }
            : space
        ));
      }
        
        if (user) {
          // Queue SOFT DELETE for reliable persistence (can be recovered)
          queueOperation('items', 'soft_delete', { id }, user.id);
        }
    }
  };

  const getItemsBySpaceId = (spaceId: string): Item[] => {
    return items.filter(item => 
      item.spaceIds?.includes(spaceId) && 
      item.subCategory !== 'todo' && 
      item.subCategory !== 'scheduling'
    );
  };

   const toggleChecklistItem = (itemId: string, blockId: string, checkItemId: string) => {
     let updatedBlocks: any[] = [];
     
     setItems(prev => prev.map(item => {
       if (item.id !== itemId) return item;
     
       const newBlocks = item.blocks.map(block => {
         if (block.id !== blockId || block.type !== 'checklist') return block;
       
         return {
           ...block,
           items: block.items.map((checkItem: any) => 
             checkItem.id === checkItemId
               ? { ...checkItem, checked: !checkItem.checked }
               : checkItem
           )
         };
       });
       
       updatedBlocks = newBlocks;
       return { ...item, blocks: newBlocks };
     }));
     
     if (user && updatedBlocks.length > 0) {
       // Update local cache immediately so checklist state survives a restart
       try {
         const nowIso = new Date().toISOString();
         const cache = getItemsCache();
         const existing = cache.get(itemId);
         if (existing) {
           cache.set({ ...existing, data: { ...existing.data, blocks: updatedBlocks, updated_at: nowIso }, updated_at: nowIso });
           logLifecycle('[Persistence] Checklist toggle written to local cache', { id: itemId });
         }
       } catch { /* non-critical */ }

       // Queue the update for reliable persistence
       queueOperation('items', 'update', { id: itemId, blocks: updatedBlocks }, user.id);
     }
  };

  return (
    <SpacesContext.Provider value={{
      spaces,
      sharedSpaces,
      items,
       loading,
      addSpace, 
       addSpaceAsync,
      deleteSpace, 
      moveSpace, 
      reorderSpaces, 
      updateSpaceImage,
      updateSpaceGif,
      updateSpaceName,
      updateSpaceColor,
      pinSpace,
      unpinSpace,
      markSpaceUsed,
      saveGroupAssignments,
      mergeSpaces,
      duplicateSpace,
      addItem,
       addItemAsync,
      updateItem,
      updateItemPosition,
      deleteItem,
      getItemsBySpaceId,
      toggleChecklistItem
    }}>
      {children}
    </SpacesContext.Provider>
  );
}

export function useSpaces() {
  const context = useContext(SpacesContext);
  if (!context) {
    throw new Error('useSpaces must be used within a SpacesProvider');
  }
  return context;
}
