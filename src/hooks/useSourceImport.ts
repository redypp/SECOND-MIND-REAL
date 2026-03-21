import { useState, useEffect, useCallback, useRef } from 'react';
import { ArchiveSource, extractUrls, importSource, fetchSourcesForItem } from '@/lib/archiveSources';

/**
 * Hook that auto-detects URLs in item content and triggers background import.
 * Returns source statuses for inline display.
 */
export function useSourceImport(itemId: string | undefined, content: string) {
  const [sources, setSources] = useState<ArchiveSource[]>([]);
  const importedUrlsRef = useRef<Set<string>>(new Set());
  const isImportingRef = useRef<Set<string>>(new Set());

  // Load existing sources on mount
  useEffect(() => {
    if (!itemId) return;
    fetchSourcesForItem(itemId).then(existing => {
      setSources(existing);
      existing.forEach(s => importedUrlsRef.current.add(s.source_url));
    });
  }, [itemId]);

  // Detect new URLs and auto-import
  const processContent = useCallback(async (text: string) => {
    if (!itemId) return;

    const urls = extractUrls(text);
    const newUrls = urls.filter(
      url => !importedUrlsRef.current.has(url) && !isImportingRef.current.has(url)
    );

    for (const url of newUrls) {
      isImportingRef.current.add(url);
      importedUrlsRef.current.add(url);

      // Add placeholder source for UI
      const placeholder: ArchiveSource = {
        id: `pending-${Date.now()}-${Math.random()}`,
        item_id: itemId,
        source_type: 'website',
        source_url: url,
        status: 'importing',
        created_at: new Date().toISOString(),
      };
      setSources(prev => [...prev, placeholder]);

      // Trigger import
      const result = await importSource(url, itemId);

      if (result.sourceId) {
        // Update placeholder with real source, poll for completion
        setSources(prev =>
          prev.map(s =>
            s.source_url === url && s.id.startsWith('pending-')
              ? { ...s, id: result.sourceId! }
              : s
          )
        );

        // Poll for status
        pollSourceStatus(result.sourceId, url);
      } else {
        // Mark as failed
        setSources(prev =>
          prev.map(s =>
            s.source_url === url && s.status === 'importing'
              ? { ...s, status: 'failed' }
              : s
          )
        );
      }

      isImportingRef.current.delete(url);
    }
  }, [itemId]);

  // Poll source status until ready/failed
  const pollSourceStatus = useCallback(async (sourceId: string, url: string) => {
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max
    
    const poll = async () => {
      if (attempts >= maxAttempts) {
        setSources(prev =>
          prev.map(s => s.id === sourceId ? { ...s, status: 'failed' } : s)
        );
        return;
      }
      
      attempts++;
      
      if (!itemId) return;
      const updated = await fetchSourcesForItem(itemId);
      const match = updated.find(s => s.id === sourceId);
      
      if (match && match.status !== 'importing') {
        setSources(prev =>
          prev.map(s => s.id === sourceId ? match : s)
        );
        return;
      }
      
      setTimeout(poll, 1000);
    };
    
    setTimeout(poll, 2000); // Initial delay
  }, [itemId]);

  // Debounced content processing
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!content || !itemId) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      processContent(content);
    }, 1500); // Wait 1.5s after typing stops

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, itemId, processContent]);

  return { sources };
}
