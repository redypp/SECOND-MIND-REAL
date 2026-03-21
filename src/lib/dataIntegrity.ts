/**
 * Data Integrity System
 * Handles startup checks, conflict logging, and recovery
 */

import { supabase } from '@/integrations/supabase/app-client';
import { logLifecycle } from './performanceLogger';
import { getSpacesCache, getItemsCache, CachedItem, MergeResult } from './localCache';

export type IntegrityEventType = 'merge' | 'conflict' | 'recovery' | 'discrepancy' | 'sync_failure' | 'sync_success';

export interface IntegrityEvent {
  event_type: IntegrityEventType;
  details: Record<string, any>;
}

// Log integrity event to cloud (for debugging)
export async function logIntegrityEvent(
  userId: string,
  eventType: IntegrityEventType,
  details: Record<string, any>
): Promise<void> {
  try {
    await supabase
      .from('data_integrity_logs')
      .insert({
        user_id: userId,
        event_type: eventType,
        details,
      });
  } catch (err) {
    console.error('[DataIntegrity] Failed to log event:', err);
  }
}

// Perform startup integrity check
export async function performStartupIntegrityCheck(userId: string): Promise<IntegrityCheckResult> {
  const result: IntegrityCheckResult = {
    success: true,
    spacesResult: null,
    itemsResult: null,
    errors: [],
    warnings: [],
  };

  const spacesCache = getSpacesCache();
  const itemsCache = getItemsCache();

  try {
    // Get unsynced items before fetch
    const unsyncedSpaces = spacesCache.getUnsynced();
    const unsyncedItems = itemsCache.getUnsynced();

    if (unsyncedSpaces.length > 0 || unsyncedItems.length > 0) {
      logLifecycle('Found unsynced items at startup', {
        spaces: unsyncedSpaces.length,
        items: unsyncedItems.length,
      });

      result.warnings.push(
        `Found ${unsyncedSpaces.length} unsynced archives and ${unsyncedItems.length} unsynced items`
      );

      // Log discrepancy
      await logIntegrityEvent(userId, 'discrepancy', {
        unsyncedSpaces: unsyncedSpaces.map(s => s.id),
        unsyncedItems: unsyncedItems.map(i => i.id),
      });
    }

    // Fetch cloud data (excluding soft-deleted)
    const [spacesResult, itemsResult] = await Promise.all([
      supabase
        .from('spaces')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('position', { ascending: true }),
      supabase
        .from('items')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    ]);

    if (spacesResult.error) throw spacesResult.error;
    if (itemsResult.error) throw itemsResult.error;

    // Convert to cached items format
    const cloudSpaces: CachedItem[] = (spacesResult.data || []).map(s => ({
      id: s.id,
      user_id: s.user_id,
      data: s,
      version: s.version ?? 1,
      updated_at: s.updated_at,
      deleted_at: s.deleted_at,
      synced: true,
      last_synced_at: new Date().toISOString(),
    }));

    const cloudItems: CachedItem[] = (itemsResult.data || []).map(i => ({
      id: i.id,
      user_id: i.user_id,
      data: i,
      version: i.version ?? 1,
      updated_at: i.updated_at,
      deleted_at: i.deleted_at,
      synced: true,
      last_synced_at: new Date().toISOString(),
    }));

    // Merge with local cache (safe merge - never loses data)
    result.spacesResult = spacesCache.mergeFromCloud(cloudSpaces);
    result.itemsResult = itemsCache.mergeFromCloud(cloudItems);

    // Log any conflicts
    if (result.spacesResult.conflicts.length > 0 || result.itemsResult.conflicts.length > 0) {
      await logIntegrityEvent(userId, 'conflict', {
        spacesConflicts: result.spacesResult.conflicts.length,
        itemsConflicts: result.itemsResult.conflicts.length,
      });
    }

    // Log successful merge
    await logIntegrityEvent(userId, 'merge', {
      spacesAdded: result.spacesResult.added.length,
      spacesUpdated: result.spacesResult.updated.length,
      itemsAdded: result.itemsResult.added.length,
      itemsUpdated: result.itemsResult.updated.length,
      localNewerSpaces: result.spacesResult.localNewer.length,
      localNewerItems: result.itemsResult.localNewer.length,
    });

    logLifecycle('Integrity check completed', {
      spaces: cloudSpaces.length,
      items: cloudItems.length,
      localNewer: result.spacesResult.localNewer.length + result.itemsResult.localNewer.length,
    });

  } catch (err) {
    result.success = false;
    const message = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(message);
    
    await logIntegrityEvent(userId, 'sync_failure', {
      error: message,
      phase: 'startup_check',
    });

    logLifecycle('Integrity check failed', { error: message });
  }

  return result;
}

// Get recently deleted items for recovery
export async function getRecentlyDeletedItems(userId: string): Promise<{
  spaces: any[];
  items: any[];
}> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString();

    const [spacesResult, itemsResult] = await Promise.all([
      supabase
        .from('spaces')
        .select('*')
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .gte('deleted_at', cutoffDate)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('items')
        .select('*')
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .gte('deleted_at', cutoffDate)
        .order('deleted_at', { ascending: false }),
    ]);

    return {
      spaces: spacesResult.data || [],
      items: itemsResult.data || [],
    };
  } catch (err) {
    console.error('[DataIntegrity] Failed to fetch deleted items:', err);
    return { spaces: [], items: [] };
  }
}

// Restore a soft-deleted item
export async function restoreDeletedItem(
  userId: string,
  table: 'spaces' | 'items',
  itemId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: null })
      .eq('id', itemId)
      .eq('user_id', userId);

    if (error) throw error;

    // Update local cache
    if (table === 'spaces') {
      getSpacesCache().restore(itemId);
    } else {
      getItemsCache().restore(itemId);
    }

    await logIntegrityEvent(userId, 'recovery', {
      table,
      itemId,
      action: 'restore',
    });

    return true;
  } catch (err) {
    console.error('[DataIntegrity] Failed to restore item:', err);
    return false;
  }
}

// Permanently delete items that have been soft-deleted for more than 30 days
export async function cleanupOldDeletedItems(userId: string): Promise<number> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString();

    const [spacesResult, itemsResult] = await Promise.all([
      supabase
        .from('spaces')
        .delete()
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .lt('deleted_at', cutoffDate),
      supabase
        .from('items')
        .delete()
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .lt('deleted_at', cutoffDate),
    ]);

    const count = (spacesResult.count || 0) + (itemsResult.count || 0);
    
    if (count > 0) {
      await logIntegrityEvent(userId, 'recovery', {
        action: 'cleanup_old_deleted',
        count,
      });
    }

    return count;
  } catch (err) {
    console.error('[DataIntegrity] Failed to cleanup old deleted items:', err);
    return 0;
  }
}

// Get data integrity stats for debugging
export function getIntegrityStats(): {
  spaces: { total: number; synced: number; unsynced: number; deleted: number };
  items: { total: number; synced: number; unsynced: number; deleted: number };
} {
  return {
    spaces: getSpacesCache().getStats(),
    items: getItemsCache().getStats(),
  };
}

export interface IntegrityCheckResult {
  success: boolean;
  spacesResult: MergeResult<CachedItem> | null;
  itemsResult: MergeResult<CachedItem> | null;
  errors: string[];
  warnings: string[];
}
