/**
 * Sync Queue System
 * Queues operations for offline/weak network and syncs on reconnect
 * Never clears queue until cloud save is confirmed
 * Supports version-based conflict detection and confirmation callbacks
 */

import { supabase } from '@/integrations/supabase/app-client';
import { logLifecycle, startTiming, endTiming, endTimingWithError } from './performanceLogger';

export type SyncOperation = {
  id: string;
  table: 'spaces' | 'items' | 'user_preferences';
  action: 'insert' | 'update' | 'delete' | 'soft_delete';
  data: Record<string, any>;
  userId: string;
  timestamp: number;
  retries: number;
  lastError?: string;
  version?: number; // For conflict detection
  confirmedAt?: number; // When cloud confirmed the save
  nextRetryAt?: number; // Earliest time this op can be retried (exponential backoff)
};

type SyncCallback = (opId: string, success: boolean, error?: string) => void;
type SyncState = {
  queue: SyncOperation[];
  lastSavedAt: number | null;
  isSyncing: boolean;
  callbacks: Map<string, SyncCallback>;
};

const STORAGE_KEY = 'secondmind_sync_queue';
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff

// In-memory state
let state: SyncState = {
  queue: [],
  lastSavedAt: null,
  isSyncing: false,
  callbacks: new Map(),
};

// Listeners for state changes
type SyncListener = (state: { 
  pendingCount: number; 
  lastSavedAt: number | null; 
  isSyncing: boolean;
  hasErrors: boolean;
  failedCount: number;
}) => void;
const listeners: Set<SyncListener> = new Set();

function notifyListeners() {
  const failedOps = state.queue.filter(op => op.retries >= MAX_RETRIES);
  listeners.forEach(listener => listener({
    pendingCount: state.queue.length,
    lastSavedAt: state.lastSavedAt,
    isSyncing: state.isSyncing,
    hasErrors: failedOps.length > 0,
    failedCount: failedOps.length,
  }));
}

export function subscribeSyncState(listener: SyncListener): () => void {
  listeners.add(listener);
  // Immediately notify with current state
  const failedOps = state.queue.filter(op => op.retries >= MAX_RETRIES);
  listener({
    pendingCount: state.queue.length,
    lastSavedAt: state.lastSavedAt,
    isSyncing: state.isSyncing,
    hasErrors: failedOps.length > 0,
    failedCount: failedOps.length,
  });
  return () => listeners.delete(listener);
}

// Load queue from localStorage on init
export function initSyncQueue(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      state.queue = parsed.queue || [];
      state.lastSavedAt = parsed.lastSavedAt || null;
      
      // Clear any stale callbacks (they don't persist)
      state.callbacks = new Map();
      
      // Reset retry counts on failed ops so they get a fresh chance on new session
      let resetCount = 0;
      state.queue = state.queue.map(op => {
        if (op.retries >= MAX_RETRIES) {
          resetCount++;
          return { ...op, retries: 0, lastError: undefined, nextRetryAt: undefined };
        }
        return op;
      });
      if (resetCount > 0) {
        logLifecycle('Reset failed sync ops for retry', { count: resetCount });
      }
      
      logLifecycle('[Persistence] Sync queue loaded', {
        pendingOperations: state.queue.length,
        lastSavedAt: state.lastSavedAt,
        ops: state.queue.map(op => ({ table: op.table, action: op.action, id: op.data.id, retries: op.retries })),
      });

      // If we have pending operations, try to sync them
      if (state.queue.length > 0) {
        console.log(`[SyncQueue][Persistence] Startup: ${state.queue.length} pending operation(s) will be retried`,
          state.queue.map(op => `${op.action}:${op.table}:${op.data.id}`));
        logLifecycle('[Persistence] Resuming pending sync operations on startup', { count: state.queue.length });
        // Delay to allow app to fully initialize
        setTimeout(() => processQueue(), 1000);
      }
    }
  } catch (err) {
    console.error('[SyncQueue] Failed to load from localStorage:', err);
    state.queue = [];
  }
  notifyListeners();
}

// Persist queue to localStorage (resilient to storage full)
function persistQueue(): void {
  try {
    const data = JSON.stringify({
      queue: state.queue,
      lastSavedAt: state.lastSavedAt,
    });
    localStorage.setItem(STORAGE_KEY, data);
  } catch (err) {
    // Storage full - try clearing old data and retrying
    console.warn('[SyncQueue] Failed to persist to localStorage:', err);
    try {
      // Keep only the queue (drop other app caches to free space)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('secondmind_cache_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });
      // Retry persist
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        queue: state.queue,
        lastSavedAt: state.lastSavedAt,
      }));
    } catch {
      // Complete failure - queue is in-memory only, will sync on next online event
      console.error('[SyncQueue] Cannot persist queue - operating in memory only');
    }
  }
}

// Add operation to queue with optional callback for confirmation
export function queueOperation(
  table: SyncOperation['table'],
  action: SyncOperation['action'],
  data: Record<string, any>,
  userId: string,
  callback?: SyncCallback
): string {
  const opId = `${table}-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  const operation: SyncOperation = {
    id: opId,
    table,
    action,
    data,
    userId,
    timestamp: Date.now(),
    retries: 0,
    version: data.version || 1,
  };
  
  // Store callback if provided
  if (callback) {
    state.callbacks.set(opId, callback);
  }
  
  // For updates/deletes/soft_deletes, check if there's already a pending op for this item
  // and merge or replace it
  if ((action === 'update' || action === 'delete' || action === 'soft_delete') && data.id) {
    const existingIndex = state.queue.findIndex(
      op => op.table === table && op.data.id === data.id
    );
    
    if (existingIndex >= 0) {
      const existing = state.queue[existingIndex];
      
      if (action === 'delete' || action === 'soft_delete') {
        // If original was insert, just remove both (item never saved to cloud)
        if (existing.action === 'insert') {
          // Call the insert callback with failure (cancelled)
          const insertCallback = state.callbacks.get(existing.id);
          if (insertCallback) {
            insertCallback(existing.id, false, 'Cancelled by delete');
            state.callbacks.delete(existing.id);
          }
          
          state.queue.splice(existingIndex, 1);
          persistQueue();
          notifyListeners();
          
          // Call delete callback with success (nothing to delete)
          if (callback) {
            callback(opId, true);
            state.callbacks.delete(opId);
          }
          return opId;
        }
        // Replace update with delete/soft_delete
        state.queue[existingIndex] = operation;
      } else if (action === 'update' && (existing.action === 'update' || existing.action === 'insert')) {
        // Merge update data (preserve original action type)
        state.queue[existingIndex] = {
          ...existing,
          data: { ...existing.data, ...data },
          timestamp: Date.now(),
          version: Math.max(existing.version || 1, data.version || 1),
        };
        
        // Transfer callback to merged operation
        if (callback) {
          state.callbacks.set(existing.id, callback);
          state.callbacks.delete(opId);
        }
        
        persistQueue();
        notifyListeners();
        return existing.id;
      }
      
      persistQueue();
      notifyListeners();
      return existing.id;
    }
  }
  
  state.queue.push(operation);
  persistQueue();
  notifyListeners();
  
  logLifecycle('Operation queued', { opId, table, action, itemId: data.id });
  
  // Try to sync immediately if online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    processQueue();
  }
  
  return opId;
}

// Remove operation from queue after successful sync
function removeFromQueue(opId: string): void {
  state.queue = state.queue.filter(op => op.id !== opId);
  state.lastSavedAt = Date.now();
  persistQueue();
  notifyListeners();
}

// Process a single operation with confirmation
async function processOperation(op: SyncOperation): Promise<boolean> {
  const timingId = startTiming(`sync_${op.action}_${op.table}`);
  
  try {
    let error = null;
    let returnedData: any = null;
    
    switch (op.action) {
      case 'insert': {
        const { data, error: insertError } = await supabase
          .from(op.table)
          .insert(op.data as any)
          .select()
          .single();
        error = insertError;
        returnedData = data;
        break;
      }
      case 'update': {
        const { id, ...updateData } = op.data;
        const { data, error: updateError } = await supabase
          .from(op.table)
          .update(updateData as any)
          .eq('id', id)
          .eq('user_id', op.userId)
          .select()
          .single();
        error = updateError;
        returnedData = data;
        break;
      }
      case 'soft_delete': {
        // Soft delete - set deleted_at timestamp
        const { data, error: softDeleteError } = await supabase
          .from(op.table)
          .update({ deleted_at: new Date().toISOString() } as any)
          .eq('id', op.data.id)
          .eq('user_id', op.userId)
          .select()
          .single();
        error = softDeleteError;
        returnedData = data;
        break;
      }
      case 'delete': {
        // Hard delete - actually remove the row (only for cleanup)
        const { error: deleteError } = await supabase
          .from(op.table)
          .delete()
          .eq('id', op.data.id)
          .eq('user_id', op.userId);
        error = deleteError;
        break;
      }
    }
    
    if (error) {
      // Check for version conflict (optimistic locking)
      if (error.message?.includes('version') || error.code === '23505') {
        logLifecycle('Version conflict detected', { opId: op.id, table: op.table });
        // Conflict - need to refetch and merge
        throw new Error(`Version conflict: ${error.message}`);
      }
      throw error;
    }
    
    // Mark operation as confirmed
    op.confirmedAt = Date.now();
    
    // Call success callback
    const callback = state.callbacks.get(op.id);
    if (callback) {
      callback(op.id, true);
      state.callbacks.delete(op.id);
    }
    
    endTiming(timingId, 'success');
    logLifecycle('Operation synced', { 
      opId: op.id, 
      table: op.table, 
      action: op.action,
      newVersion: returnedData?.version 
    });
    
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    endTimingWithError(timingId, err);
    
    // Log failed save
    console.error(`[SyncQueue] Failed to ${op.action} ${op.table}:`, {
      opId: op.id,
      itemId: op.data.id,
      error: errorMessage,
      attempt: op.retries + 1,
    });
    
    // Update retry count, error, and schedule next retry time
    const opIndex = state.queue.findIndex(o => o.id === op.id);
    if (opIndex >= 0) {
      const newRetries = op.retries + 1;
      const delay = RETRY_DELAYS[Math.min(newRetries - 1, RETRY_DELAYS.length - 1)];
      state.queue[opIndex] = {
        ...state.queue[opIndex],
        retries: newRetries,
        lastError: errorMessage,
        nextRetryAt: Date.now() + delay,
      };
      persistQueue();
      notifyListeners();
    }
    
    // Call failure callback if max retries reached
    if (op.retries + 1 >= MAX_RETRIES) {
      console.error(`[SyncQueue][Persistence] PERMANENT FAILURE — ${op.action} on ${op.table} exhausted all ${MAX_RETRIES} retries. Data NOT saved to cloud.`, {
        opId: op.id,
        itemId: op.data.id,
        lastError: errorMessage,
        data: op.data,
      });
      logLifecycle('[Persistence] Sync op permanently failed', { table: op.table, action: op.action, itemId: op.data.id, error: errorMessage });
      const callback = state.callbacks.get(op.id);
      if (callback) {
        callback(op.id, false, errorMessage);
        state.callbacks.delete(op.id);
      }
    }
    
    return false;
  }
}

// Process entire queue
let processingPromise: Promise<void> | null = null;

export async function processQueue(): Promise<void> {
  // Prevent concurrent processing
  if (processingPromise) {
    return processingPromise;
  }
  
  if (state.queue.length === 0 || state.isSyncing) {
    return;
  }
  
  state.isSyncing = true;
  notifyListeners();
  
  processingPromise = (async () => {
    const timingId = startTiming('process_sync_queue');
    logLifecycle('Processing sync queue', { count: state.queue.length });
    
    // Process operations in order, skipping those not yet ready to retry
    const now = Date.now();
    const toProcess = [...state.queue].filter(
      op => op.retries < MAX_RETRIES && (!op.nextRetryAt || op.nextRetryAt <= now)
    );

    for (const op of toProcess) {
      // Check if we're online
      if (!navigator.onLine) {
        logLifecycle('Sync paused - offline');
        break;
      }

      const success = await processOperation(op);

      if (success) {
        removeFromQueue(op.id);
      }
      // On failure, nextRetryAt is set inside processOperation — no blocking delay here.
      // Remaining ops continue immediately so one failure can't block the whole queue.
    }

    // Schedule a follow-up pass if there are ops waiting for their retry window
    const hasWaiting = state.queue.some(
      op => op.retries < MAX_RETRIES && op.nextRetryAt && op.nextRetryAt > Date.now()
    );
    if (hasWaiting) {
      const soonestRetry = Math.min(
        ...state.queue
          .filter(op => op.retries < MAX_RETRIES && op.nextRetryAt)
          .map(op => op.nextRetryAt!)
      );
      const waitMs = Math.max(0, soonestRetry - Date.now());
      setTimeout(() => processQueue(), waitMs + 50);
    }
    
    endTiming(timingId, `${state.queue.length} remaining`);
  })();
  
  try {
    await processingPromise;
  } finally {
    processingPromise = null;
    state.isSyncing = false;
    notifyListeners();
  }
}

// Get current sync state
export function getSyncState() {
  const hasErrors = state.queue.some(op => op.retries >= MAX_RETRIES);
  return {
    pendingCount: state.queue.length,
    lastSavedAt: state.lastSavedAt,
    isSyncing: state.isSyncing,
    hasErrors,
    failedOperations: state.queue.filter(op => op.retries >= MAX_RETRIES),
  };
}

// Force retry all failed operations
export function retryFailedOperations(): void {
  state.queue = state.queue.map(op => ({
    ...op,
    retries: 0,
    lastError: undefined,
  }));
  persistQueue();
  notifyListeners();
  processQueue();
}

// SAFE LOGOUT: Only clear synced operations, preserve unsynced for recovery
export function clearQueueForUser(userId: string, forceAll = false): { cleared: number; preserved: number } {
  const userOps = state.queue.filter(op => op.userId === userId);
  const unsyncedOps = userOps.filter(op => !op.confirmedAt);
  const syncedOps = userOps.filter(op => op.confirmedAt);
  
  if (forceAll) {
    // Force clear all (user explicitly confirmed)
    if (unsyncedOps.length > 0) {
      console.warn('[SyncQueue] Force clearing unsynced operations:', unsyncedOps.length);
      logLifecycle('Queue force-cleared with pending ops', { 
        count: unsyncedOps.length, 
        userId,
        opIds: unsyncedOps.map(op => op.id),
      });
    }
    state.queue = state.queue.filter(op => op.userId !== userId);
  } else {
    // Safe clear - only remove confirmed synced operations
    if (unsyncedOps.length > 0) {
      console.warn('[SyncQueue] Preserving unsynced operations on logout:', unsyncedOps.length);
      logLifecycle('Queue partially cleared, preserving unsynced', { 
        cleared: syncedOps.length,
        preserved: unsyncedOps.length,
        userId,
      });
    }
    // Only remove synced operations
    const syncedIds = new Set(syncedOps.map(op => op.id));
    state.queue = state.queue.filter(op => op.userId !== userId || !syncedIds.has(op.id));
  }
  
  persistQueue();
  notifyListeners();
  
  return {
    cleared: forceAll ? userOps.length : syncedOps.length,
    preserved: forceAll ? 0 : unsyncedOps.length,
  };
}

// Check if there are unsynced operations for a user
export function hasUnsyncedOperations(userId: string): boolean {
  return state.queue.some(op => op.userId === userId && !op.confirmedAt);
}

// Get all pending operations for a user (for recovery UI)
export function getPendingOperationsForUser(userId: string): SyncOperation[] {
  return state.queue.filter(op => op.userId === userId);
}

// Get the set of item IDs that have pending (unconfirmed) operations for a given table.
// Used by backgroundRefresh to avoid overwriting unsaved local state.
export function getPendingItemIds(table: SyncOperation['table']): Set<string> {
  const ids = new Set<string>();
  for (const op of state.queue) {
    if (op.table === table && !op.confirmedAt && op.data.id) {
      ids.add(op.data.id as string);
    }
  }
  return ids;
}

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    logLifecycle('Network online - resuming sync');
    processQueue();
  });
  
  window.addEventListener('offline', () => {
    logLifecycle('Network offline - sync paused');
  });
}
