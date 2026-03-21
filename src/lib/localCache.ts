/**
 * Local Cache System
 * Provides a reliable local cache that mirrors cloud data
 * Handles conflict resolution, merge logic, and recovery
 */

import { logLifecycle } from './performanceLogger';

export interface CachedItem {
  id: string;
  user_id: string;
  data: Record<string, any>;
  version: number;
  updated_at: string;
  deleted_at: string | null;
  synced: boolean;
  last_synced_at: string | null;
}

export interface CacheState<T extends CachedItem> {
  items: Map<string, T>;
  lastFetchedAt: string | null;
  lastSyncedAt: string | null;
}

const CACHE_PREFIX = 'secondmind_cache_';

// Generic cache manager
export class LocalCacheManager<T extends CachedItem> {
  private storageKey: string;
  private cache: CacheState<T>;

  constructor(tableName: string) {
    this.storageKey = `${CACHE_PREFIX}${tableName}`;
    this.cache = this.loadFromStorage();
  }

  private loadFromStorage(): CacheState<T> {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          items: new Map(Object.entries(parsed.items || {})),
          lastFetchedAt: parsed.lastFetchedAt || null,
          lastSyncedAt: parsed.lastSyncedAt || null,
        };
      }
    } catch (err) {
      console.error(`[LocalCache] Failed to load ${this.storageKey}:`, err);
    }
    return { items: new Map(), lastFetchedAt: null, lastSyncedAt: null };
  }

  private saveToStorage(): void {
    const toStore = {
      items: Object.fromEntries(this.cache.items),
      lastFetchedAt: this.cache.lastFetchedAt,
      lastSyncedAt: this.cache.lastSyncedAt,
    };
    
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(toStore));
    } catch (err) {
      // Handle QuotaExceededError - storage is full
      if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
        console.warn(`[LocalCache][Persistence] Storage FULL — attempting recovery for ${this.storageKey}`);
        logLifecycle('[Persistence] localStorage full — attempting recovery', { key: this.storageKey });
        this.handleStorageFull(toStore);
      } else {
        console.error(`[LocalCache][Persistence] FAILED to save ${this.storageKey}:`, err);
        logLifecycle('[Persistence] localStorage save failed', { key: this.storageKey, error: String(err) });
      }
    }
  }

  private handleStorageFull(toStore: object): void {
    try {
      // First, try clearing just this cache and retry
      localStorage.removeItem(this.storageKey);
      localStorage.setItem(this.storageKey, JSON.stringify(toStore));
      console.log(`[LocalCache] Recovered by clearing ${this.storageKey}`);
    } catch (retryErr) {
      // Still failing - clear ALL app caches
      console.warn('[LocalCache] Clearing all caches due to storage pressure');
      clearAllCaches();
      
      // One more attempt with minimal data
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(toStore));
      } catch {
        // Give up - proceed without local cache
        console.warn(`[LocalCache] Proceeding without local cache for ${this.storageKey}`);
      }
    }
  }

  // Get all non-deleted items
  getAll(): T[] {
    return Array.from(this.cache.items.values())
      .filter(item => !item.deleted_at);
  }

  // Get all items including soft-deleted (for recovery UI)
  getAllIncludingDeleted(): T[] {
    return Array.from(this.cache.items.values());
  }

  // Get recently deleted items (within 7 days)
  getRecentlyDeleted(): T[] {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return Array.from(this.cache.items.values())
      .filter(item => {
        if (!item.deleted_at) return false;
        return new Date(item.deleted_at) > sevenDaysAgo;
      });
  }

  // Get unsynced items
  getUnsynced(): T[] {
    return Array.from(this.cache.items.values())
      .filter(item => !item.synced);
  }

  // Get a single item by ID
  get(id: string): T | undefined {
    return this.cache.items.get(id);
  }

  // Set/update an item (marks as unsynced)
  set(item: T, synced = false): void {
    const existing = this.cache.items.get(item.id);
    
    // If we have a newer local version, don't overwrite
    if (existing && !synced && existing.version > item.version) {
      logLifecycle('Skipped older update', { 
        id: item.id, 
        existingVersion: existing.version, 
        newVersion: item.version 
      });
      return;
    }

    this.cache.items.set(item.id, {
      ...item,
      synced,
      last_synced_at: synced ? new Date().toISOString() : (existing?.last_synced_at || null),
    });
    this.saveToStorage();
  }

  // Soft delete an item (marks as unsynced)
  softDelete(id: string): void {
    const item = this.cache.items.get(id);
    if (item) {
      this.cache.items.set(id, {
        ...item,
        deleted_at: new Date().toISOString(),
        synced: false,
      });
      this.saveToStorage();
    }
  }

  // Restore a soft-deleted item
  restore(id: string): void {
    const item = this.cache.items.get(id);
    if (item) {
      this.cache.items.set(id, {
        ...item,
        deleted_at: null,
        synced: false,
      });
      this.saveToStorage();
    }
  }

  // Permanently remove an item (only after confirmed cloud delete)
  hardDelete(id: string): void {
    this.cache.items.delete(id);
    this.saveToStorage();
  }

  // Mark item as synced
  markSynced(id: string, version?: number): void {
    const item = this.cache.items.get(id);
    if (item) {
      this.cache.items.set(id, {
        ...item,
        synced: true,
        version: version ?? item.version,
        last_synced_at: new Date().toISOString(),
      });
      this.saveToStorage();
    }
  }

  // Merge cloud data with local cache (safe merge - never lose newer data)
  mergeFromCloud(cloudItems: T[]): MergeResult<T> {
    const result: MergeResult<T> = {
      added: [],
      updated: [],
      conflicts: [],
      localNewer: [],
    };

    const cloudItemMap = new Map(cloudItems.map(item => [item.id, item]));
    const now = new Date().toISOString();

    // Process cloud items
    for (const cloudItem of cloudItems) {
      const localItem = this.cache.items.get(cloudItem.id);

      if (!localItem) {
        // New item from cloud
        this.cache.items.set(cloudItem.id, {
          ...cloudItem,
          synced: true,
          last_synced_at: now,
        });
        result.added.push(cloudItem);
      } else if (!localItem.synced) {
        // Local has unsynced changes - conflict resolution needed
        const cloudTime = new Date(cloudItem.updated_at).getTime();
        const localTime = new Date(localItem.updated_at).getTime();

        if (cloudItem.version > localItem.version) {
          // Cloud is newer by version - take cloud but log conflict
          result.conflicts.push({
            id: cloudItem.id,
            local: localItem,
            cloud: cloudItem,
            resolution: 'cloud_wins',
          });
          this.cache.items.set(cloudItem.id, {
            ...cloudItem,
            synced: true,
            last_synced_at: now,
          });
        } else if (localItem.version > cloudItem.version) {
          // Local is newer - keep local, needs sync
          result.localNewer.push(localItem);
        } else if (cloudTime > localTime) {
          // Same version but cloud timestamp newer
          this.cache.items.set(cloudItem.id, {
            ...cloudItem,
            synced: true,
            last_synced_at: now,
          });
          result.updated.push(cloudItem);
        } else {
          // Local wins by timestamp
          result.localNewer.push(localItem);
        }
      } else {
        // Local is synced - safe to update from cloud
        if (cloudItem.version >= localItem.version) {
          this.cache.items.set(cloudItem.id, {
            ...cloudItem,
            synced: true,
            last_synced_at: now,
          });
          result.updated.push(cloudItem);
        }
      }
    }

    // Check for items that exist locally but not in cloud
    // These might be locally created items that haven't synced yet
    for (const [id, localItem] of this.cache.items) {
      if (!cloudItemMap.has(id) && !localItem.synced && !localItem.deleted_at) {
        // This is a local-only item that needs to be synced
        result.localNewer.push(localItem);
      }
    }

    this.cache.lastFetchedAt = now;
    this.saveToStorage();

    logLifecycle('Cache merge completed', {
      added: result.added.length,
      updated: result.updated.length,
      conflicts: result.conflicts.length,
      localNewer: result.localNewer.length,
    });

    return result;
  }

  // Clear cache for a specific user
  clearForUser(userId: string): void {
    const itemsToKeep: [string, T][] = [];
    
    for (const [id, item] of this.cache.items) {
      // Keep unsynced items even on logout
      if (item.user_id !== userId || !item.synced) {
        itemsToKeep.push([id, item]);
      }
    }
    
    this.cache.items = new Map(itemsToKeep);
    this.saveToStorage();
  }

  // Get cache stats
  getStats(): CacheStats {
    const items = Array.from(this.cache.items.values());
    return {
      total: items.length,
      synced: items.filter(i => i.synced).length,
      unsynced: items.filter(i => !i.synced).length,
      deleted: items.filter(i => i.deleted_at).length,
      lastFetchedAt: this.cache.lastFetchedAt,
      lastSyncedAt: this.cache.lastSyncedAt,
    };
  }
}

export interface MergeResult<T> {
  added: T[];
  updated: T[];
  conflicts: ConflictRecord<T>[];
  localNewer: T[];
}

export interface ConflictRecord<T> {
  id: string;
  local: T;
  cloud: T;
  resolution: 'cloud_wins' | 'local_wins' | 'merged';
}

export interface CacheStats {
  total: number;
  synced: number;
  unsynced: number;
  deleted: number;
  lastFetchedAt: string | null;
  lastSyncedAt: string | null;
}

// Create singleton caches for each table
let spacesCache: LocalCacheManager<CachedItem> | null = null;
let itemsCache: LocalCacheManager<CachedItem> | null = null;

export function getSpacesCache(): LocalCacheManager<CachedItem> {
  if (!spacesCache) {
    spacesCache = new LocalCacheManager('spaces');
  }
  return spacesCache;
}

export function getItemsCache(): LocalCacheManager<CachedItem> {
  if (!itemsCache) {
    itemsCache = new LocalCacheManager('items');
  }
  return itemsCache;
}

// Clear all caches
export function clearAllCaches(): void {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}spaces`);
    localStorage.removeItem(`${CACHE_PREFIX}items`);
  } catch (e) {
    console.warn('[LocalCache] Failed to remove cache keys:', e);
  }
  spacesCache = null;
  itemsCache = null;
}

// Check storage health for proactive management
export function checkStorageHealth(): { isHealthy: boolean; usedKB: number; availableKB: number } {
  try {
    let totalUsed = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        totalUsed += (localStorage.getItem(key)?.length || 0) * 2; // UTF-16 = 2 bytes per char
      }
    }
    const usedKB = Math.round(totalUsed / 1024);
    // Safari on iOS typically allows ~5MB for localStorage
    const availableKB = 5000 - usedKB;
    return {
      isHealthy: availableKB > 500, // At least 500KB free
      usedKB,
      availableKB: Math.max(0, availableKB)
    };
  } catch {
    return { isHealthy: true, usedKB: 0, availableKB: 5000 };
  }
}

// Force clear all app caches (for user-triggered cleanup)
// This is the nuclear option - clears ALL app-related localStorage
export function forceClearAllCaches(): { clearedKB: number } {
  const before = checkStorageHealth();
  
  // Clear everything app-related (not just cache prefix)
  const APP_KEYS = [
    `${CACHE_PREFIX}spaces`,
    `${CACHE_PREFIX}items`,
    'secondmind_sync_queue',
    'secondmind_scrapbook',
    'scrapbook_entries',
    'app-theme',
    'user-mantra',
    'sm_last_active',
    'sm_had_session',
    'secondmind_habits',
    'secondmind_habit_entries',
    'feature_tour_completed',
    'welcome_dialog_shown',
  ];
  
  try {
    for (const key of APP_KEYS) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
    
    // Also clear any keys that start with known prefixes
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith(CACHE_PREFIX) || 
        key.startsWith('secondmind_') ||
        key.startsWith('sm_')
      )) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.warn('[LocalCache] Error during force clear, attempting localStorage.clear:', e);
    try { localStorage.clear(); } catch (e2) { /* last resort failed */ }
  }
  
  spacesCache = null;
  itemsCache = null;
  
  const after = checkStorageHealth();
  return { clearedKB: before.usedKB - after.usedKB };
}
