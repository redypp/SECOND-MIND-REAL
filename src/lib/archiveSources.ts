import { supabase } from '@/integrations/supabase/client';

export interface ArchiveSource {
  id: string;
  item_id: string;
  source_type: string;
  source_url: string;
  external_id?: string;
  title?: string;
  imported_text?: string;
  status: 'importing' | 'ready' | 'failed';
  imported_at?: string;
  created_at: string;
}

// Regex to find URLs in text
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

/**
 * Extract all URLs from a text string
 */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Trigger background import for a URL attached to an item.
 * Returns the source_id for tracking.
 */
export async function importSource(
  url: string,
  itemId: string,
): Promise<{ sourceId?: string; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { error: 'Not authenticated' };

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-source`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, item_id: itemId }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return { error: data.error || 'Import failed', sourceId: data.source_id };
    }
    return { sourceId: data.source_id };
  } catch (err) {
    console.error('importSource error:', err);
    return { error: 'Network error' };
  }
}

/**
 * Fetch all sources for an item
 */
export async function fetchSourcesForItem(itemId: string): Promise<ArchiveSource[]> {
  const { data, error } = await supabase
    .from('archive_sources' as any)
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false }) as any;

  if (error) {
    console.error('fetchSourcesForItem error:', error);
    return [];
  }
  return (data || []) as ArchiveSource[];
}

/**
 * Fetch all sources for multiple items (for AI context)
 */
export async function fetchSourcesForItems(itemIds: string[]): Promise<ArchiveSource[]> {
  if (itemIds.length === 0) return [];
  
  const { data, error } = await supabase
    .from('archive_sources' as any)
    .select('*')
    .in('item_id', itemIds)
    .eq('status', 'ready') as any;

  if (error) {
    console.error('fetchSourcesForItems error:', error);
    return [];
  }
  return (data || []) as ArchiveSource[];
}
