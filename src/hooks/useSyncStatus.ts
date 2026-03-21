/**
 * Hook to track sync status, unsynced data, and surface warnings
 * Provides visibility into data persistence state
 */

import { useState, useEffect, useCallback } from 'react';
import { subscribeSyncState, getSyncState, retryFailedOperations, processQueue, hasUnsyncedOperations, getPendingOperationsForUser } from '@/lib/syncQueue';
import { subscribeSessionEvents, getLastSignOutReason, SignOutReason } from '@/lib/sessionMonitor';
import { getIntegrityStats } from '@/lib/dataIntegrity';
import { useAuth } from '@/contexts/AuthContext';

export interface SyncStatus {
  pendingCount: number;
  failedCount: number;
  lastSavedAt: number | null;
  isSyncing: boolean;
  hasErrors: boolean;
  hasUnsyncedData: boolean;
  isOnline: boolean;
  lastSignOutReason: SignOutReason;
  timeSinceLastSave: number | null;
  showWarning: boolean;
  integrityStats: {
    spaces: { total: number; synced: number; unsynced: number; deleted: number };
    items: { total: number; synced: number; unsynced: number; deleted: number };
  } | null;
}

const STALE_THRESHOLD = 60000; // 1 minute without saving = warning

export function useSyncStatus() {
  const { user } = useAuth();
  
  const [status, setStatus] = useState<SyncStatus>(() => {
    const state = getSyncState();
    return {
      pendingCount: state.pendingCount,
      failedCount: state.failedOperations.length,
      lastSavedAt: state.lastSavedAt,
      isSyncing: state.isSyncing,
      hasErrors: state.hasErrors,
      hasUnsyncedData: false,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      lastSignOutReason: getLastSignOutReason(),
      timeSinceLastSave: state.lastSavedAt ? Date.now() - state.lastSavedAt : null,
      showWarning: false,
      integrityStats: null,
    };
  });

  // Update time since last save and integrity stats periodically
  useEffect(() => {
    const updateStatus = () => {
      const integrityStats = getIntegrityStats();
      
      setStatus(prev => {
        const timeSinceLastSave = prev.lastSavedAt ? Date.now() - prev.lastSavedAt : null;
        const showWarning = (
          prev.hasErrors ||
          (prev.pendingCount > 0 && !prev.isSyncing && timeSinceLastSave && timeSinceLastSave > STALE_THRESHOLD)
        );
        
        return {
          ...prev,
          timeSinceLastSave,
          showWarning,
          integrityStats,
          hasUnsyncedData: user ? hasUnsyncedOperations(user.id) : false,
        };
      });
    };
    
    updateStatus(); // Initial update
    const interval = setInterval(updateStatus, 5000);

    return () => clearInterval(interval);
  }, [user]);

  // Subscribe to sync state changes
  useEffect(() => {
    const unsubscribe = subscribeSyncState((state) => {
      setStatus(prev => ({
        ...prev,
        pendingCount: state.pendingCount,
        failedCount: state.failedCount,
        lastSavedAt: state.lastSavedAt,
        isSyncing: state.isSyncing,
        hasErrors: state.hasErrors,
        timeSinceLastSave: state.lastSavedAt ? Date.now() - state.lastSavedAt : null,
      }));
    });

    return unsubscribe;
  }, []);

  // Subscribe to session events
  useEffect(() => {
    const unsubscribe = subscribeSessionEvents((event) => {
      if (event.type === 'signed_out') {
        setStatus(prev => ({
          ...prev,
          lastSignOutReason: event.reason,
        }));
      }
    });

    return unsubscribe;
  }, []);

  // Track online status
  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      // Try to sync when coming online
      processQueue();
    };
    
    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const retrySync = useCallback(() => {
    retryFailedOperations();
  }, []);

  const forceSync = useCallback(() => {
    processQueue();
  }, []);

  const formatLastSaved = useCallback(() => {
    if (!status.lastSavedAt) return 'Never';
    
    const seconds = Math.floor((Date.now() - status.lastSavedAt) / 1000);
    
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }, [status.lastSavedAt]);

  // Get pending operations for debugging
  const getPendingOperations = useCallback(() => {
    if (!user) return [];
    return getPendingOperationsForUser(user.id);
  }, [user]);

  return {
    ...status,
    retrySync,
    forceSync,
    formatLastSaved,
    getPendingOperations,
  };
}
