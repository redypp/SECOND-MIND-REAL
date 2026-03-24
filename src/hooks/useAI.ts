import { useState, useCallback, useEffect, useRef } from 'react';
import { useSpaces } from '@/contexts/SpacesContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/app-client';
import { fetchSourcesForItems, ArchiveSource } from '@/lib/archiveSources';

// ─── Module-level auth token cache ──────────────────────────────────────────
// Avoids an async round-trip to the session store on every question submit.
// Tokens are valid for the session duration; we conservatively refresh after 4 min.
let _authTokenCache: { token: string; ts: number } | null = null;
const AUTH_CACHE_TTL = 4 * 60 * 1000; // 4 minutes

async function getCachedAuthToken(): Promise<string | null> {
  if (_authTokenCache && Date.now() - _authTokenCache.ts < AUTH_CACHE_TTL) {
    return _authTokenCache.token;
  }
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token ?? null;
  if (token) _authTokenCache = { token, ts: Date.now() };
  return token;
}

/** Call on page mount so the token is cached before the user submits. */
export async function prewarmAuth(): Promise<void> {
  await getCachedAuthToken();
}
// ────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ActionSuggestion {
  type: 'create_task' | 'schedule_event' | 'add_to_archive' | 'view_related';
  label: string;
  description?: string;
  payload: {
    title?: string;
    content?: string;
    date?: string;
    time?: string;
    spaceName?: string;
  };
}

interface AIResponse {
  content: string;
  error?: string;
}

export interface OrganizedNote {
  title: string;
  summary: string;
  suggested_collection: string;
  tags: string[];
  action_items?: string[];
}

export interface DumpItem {
  title: string;
  content: string;
  sub_category: 'notes' | 'todo' | 'scheduling' | 'misc';
  destination: 'archive' | 'todo' | 'habit' | 'journal' | 'daily_plan' | 'reminder';
  target_space: string;
  needs_clarification: boolean;
  clarification_options?: string[];
  tags: string[];
  scheduled_date?: string;
  scheduled_time?: string;
  scheduled_end_time?: string;
}

export interface OrganizeDumpResult {
  items: DumpItem[];
  summary: string;
}

export interface OrganizeSuggestion {
  itemId: string;
  currentTitle: string;
  suggestedTitle?: string;
  suggestedSpaceId?: string;
  suggestedSpaceName?: string;
  tags: string[];
  reason: string;
  // resolved at call time
  currentSpaceName?: string;
}

export interface OrganizeAllResult {
  suggestions: OrganizeSuggestion[];
  summary: string;
}

interface OrganizeNoteResponse {
  data?: OrganizedNote;
  error?: string;
}

interface OrganizeAllResponse {
  data?: OrganizeAllResult;
  error?: string;
}

export function useAI() {
  const { spaces, items } = useSpaces();
  const { profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [sourcesCache, setSourcesCache] = useState<ArchiveSource[]>([]);
  const sourcesFetchedRef = useRef(false);

  // Load imported sources for AI context
  useEffect(() => {
    if (sourcesFetchedRef.current || items.length === 0) return;
    sourcesFetchedRef.current = true;
    
    const itemIds = items.slice(0, 50).map(i => i.id);
    fetchSourcesForItems(itemIds).then(setSourcesCache).catch(() => {});
  }, [items]);

  const buildContext = useCallback(() => {
    // Build source text snippets keyed by item ID
    const sourcesByItem: Record<string, string> = {};
    for (const s of sourcesCache) {
      if (s.imported_text) {
        const snippet = s.imported_text.slice(0, 2000); // Cap per source
        sourcesByItem[s.item_id] = sourcesByItem[s.item_id]
          ? `${sourcesByItem[s.item_id]}\n---\n${snippet}`
          : snippet;
      }
    }

    return {
      spaces: spaces.map(s => ({
        id: s.id,
        name: s.name,
        itemCount: s.itemCount,
      })),
      items: items.slice(0, 50).map(item => ({
        id: item.id,
        title: item.title,
        subCategory: item.subCategory,
        content: item.content,
        blocks: item.blocks || [],
        spaceIds: item.spaceIds || [],
        keywords: item.keywords || [],
        scheduledDate: item.scheduledDate,
        scheduledTime: item.scheduledTime,
        createdAt: item.createdAt,
        // Include imported source text as additional knowledge
        ...(sourcesByItem[item.id] ? { importedContent: sourcesByItem[item.id] } : {}),
      })),
      currentTime: new Date().toISOString(),
      // User profile for personalisation
      ...(profile ? {
        profile: {
          name: profile.full_name || undefined,
          location: profile.location || undefined,
          birthday: profile.birthday || undefined,
        },
      } : {}),
    };
  }, [spaces, items, sourcesCache, profile]);

  const askQuestion = useCallback(async (
    question: string,
    conversationHistory?: ChatMessage[],
    onDelta?: (chunk: string) => void
  ): Promise<AIResponse> => {
    setIsLoading(true);
    
    // Create AbortController for timeout handling on mobile
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    try {
      // Use cached token — avoids async session lookup on every message
      const authToken = await getCachedAuthToken();
      if (!authToken) {
        return { content: '', error: 'Not authenticated. Please sign in and try again.' };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            type: 'ask_question',
            input: question,
            context: {
              ...buildContext(),
              ...(conversationHistory && conversationHistory.length > 0
                ? { conversationHistory: conversationHistory.slice(-6) }
                : {}),
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          return { content: '', error: 'Too many requests. Wait 1 minute and try again.' };
        }
        if (response.status === 402) {
          return { content: '', error: 'OpenAI billing issue. Check platform.openai.com/account/billing' };
        }
        if (response.status === 401) {
          return { content: '', error: 'Session expired. Please sign out and sign back in.' };
        }
        if (response.status === 500) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.error?.includes('No API key')) {
            return { content: '', error: 'No API key configured. Add your OpenAI API key in Settings.' };
          }
          return { content: '', error: errorData.error || 'AI service error. Please try again.' };
        }
        const errorData = await response.json().catch(() => ({}));
        return { content: '', error: errorData.error || 'Failed to connect to AI. Check your internet connection.' };
      }

      // Handle streaming response with mobile-friendly error handling
      if (onDelta && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';
        let chunkCount = 0;
        let lastActivityTime = Date.now();
        const STREAM_TIMEOUT = 20000; // 20s between chunks before considering stalled

        try {
          while (true) {
            // Check for stream timeout (connection stalled)
            if (Date.now() - lastActivityTime > STREAM_TIMEOUT) {
              console.warn('[AI Ask] Stream timeout after', STREAM_TIMEOUT, 'ms. Content so far:', fullContent.length, 'chars');
              break;
            }

            const { done, value } = await Promise.race([
              reader.read(),
              new Promise<{ done: true; value: undefined }>((_, reject) =>
                setTimeout(() => reject(new Error('Stream read timeout')), STREAM_TIMEOUT)
              )
            ]).catch((err) => {
              console.warn('[AI Ask] Stream read error:', err);
              return { done: true as const, value: undefined };
            });

            if (done) break;

            chunkCount++;
            lastActivityTime = Date.now();
            buffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
              let line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);

              if (line.endsWith('\r')) line = line.slice(0, -1);
              if (line.startsWith(':') || line.trim() === '') continue;
              if (!line.startsWith('data: ')) continue;

              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') {
                console.log('[AI Ask] Stream done. Total content:', fullContent.length, 'chars,', chunkCount, 'chunks');
                break;
              }

              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                  onDelta(content);
                }
              } catch {
                // Incomplete JSON chunk — keep it in buffer for next iteration
                buffer = line + '\n' + buffer;
                break;
              }
            }
          }
        } catch (streamError) {
          console.warn('[AI Ask] Stream error:', streamError);
          // Return whatever content we got so far
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // Reader may already be released
          }
        }

        // Return content even if stream was interrupted mid-way
        if (fullContent) {
          return { content: fullContent };
        }
        // Empty stream — log the raw response info for debugging
        console.error('[AI Ask] Empty stream response. Status:', response.status, 'Chunks received:', chunkCount);
        return { content: '', error: 'No response received. Please try again.' };
      }

      // Non-streaming response
      const data = await response.json();
      return { content: data.content || data.response || '' };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { content: '', error: 'Request timed out. Please try again.' };
        }
        console.error('AI request error:', error.message);
      }
      return { content: '', error: 'Failed to connect to AI. Check your connection and try again.' };
    } finally {
      setIsLoading(false);
    }
  }, [buildContext]);

  const getSmartSuggestions = useCallback(async (): Promise<{
    suggestions: Array<{ text: string; type: 'task' | 'reminder' | 'idea' }>;
    error?: string;
  }> => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'get_suggestions',
          input: 'Generate smart suggestions for what I should focus on right now',
          context: buildContext(),
        },
      });

      if (error) {
        return { suggestions: [], error: error.message };
      }

      return { suggestions: data.suggestions || [] };
    } catch (error) {
      console.error('Smart suggestions error:', error);
      return { suggestions: [], error: 'Failed to get suggestions' };
    } finally {
      setIsLoading(false);
    }
  }, [buildContext]);

  const findConnections = useCallback(async (itemId: string): Promise<{
    connections: Array<{ itemId: string; reason: string; strength: number }>;
    error?: string;
  }> => {
    const item = items.find(i => i.id === itemId);
    if (!item) {
      return { connections: [], error: 'Item not found' };
    }

    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'find_connections',
          input: `Find related notes for: ${item.title || ''} ${item.content || item.blocks?.map(b => 
            'content' in b ? b.content : ''
          ).join(' ')}`,
          context: buildContext(),
        },
      });

      if (error) {
        return { connections: [], error: error.message };
      }

      return { connections: data.connections || [] };
    } catch (error) {
      console.error('Find connections error:', error);
      return { connections: [], error: 'Failed to find connections' };
    } finally {
      setIsLoading(false);
    }
  }, [items, buildContext]);

  const organizeNote = useCallback(async (noteText: string): Promise<OrganizeNoteResponse> => {
    const attemptOrganize = async (): Promise<OrganizeNoteResponse> => {
      try {
        const { data, error } = await supabase.functions.invoke('ai-assistant', {
          body: {
            type: 'organize_note',
            input: noteText,
            context: buildContext(),
          },
        });

        if (error) {
          return { error: error.message };
        }

        if (!data?.success || !data?.data) {
          return { error: 'Invalid response from AI' };
        }

        const organized = data.data as OrganizedNote;

        // Validate required fields
        if (!organized.title || !organized.summary || !organized.suggested_collection || !Array.isArray(organized.tags)) {
          return { error: 'Incomplete response from AI' };
        }

        return { data: organized };
      } catch (err) {
        console.error('organizeNote error:', err);
        return { error: 'Failed to organize note' };
      }
    };

    setIsLoading(true);
    try {
      // First attempt
      const first = await attemptOrganize();
      if (first.data) return first;

      // Retry once on failure
      console.log('organizeNote: retrying after first failure');
      const second = await attemptOrganize();
      return second.data ? second : { error: "Couldn't organize—try again." };
    } finally {
      setIsLoading(false);
    }
  }, [buildContext]);

  const organizeAllItems = useCallback(async (): Promise<OrganizeAllResponse> => {
    const context = buildContext();
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'organize_all',
          input: `Analyze all ${context.items.length} items across ${context.spaces.length} collections and suggest reorganizations.`,
          context,
        },
      });

      if (error) return { error: error.message };
      if (!data?.success || !data?.data) return { error: 'Invalid response from AI' };

      const result = data.data as OrganizeAllResult;

      // Enrich suggestions with current space name
      const enriched: OrganizeSuggestion[] = (result.suggestions || []).map((s: OrganizeSuggestion) => {
        const currentItem = context.items.find(i => i.id === s.itemId);
        const currentSpaceId = currentItem?.spaceIds?.[0];
        const currentSpace = currentSpaceId ? context.spaces.find(sp => sp.id === currentSpaceId) : null;
        return { ...s, currentSpaceName: currentSpace?.name };
      });

      return { data: { suggestions: enriched, summary: result.summary } };
    } catch (err) {
      console.error('organizeAllItems error:', err);
      return { error: 'Failed to analyze items' };
    }
  }, [buildContext]);

  const organizeDump = useCallback(async (dumpText: string): Promise<{ data?: OrganizeDumpResult; error?: string }> => {
    setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
    
    try {
      const authToken = await getCachedAuthToken();
      if (!authToken) {
        return { error: 'Not authenticated. Please sign in and try again.' };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            type: 'organize_dump',
            input: dumpText,
            context: buildContext(),
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) return { error: 'Too many requests. Wait a moment and try again.' };
        if (response.status === 402) return { error: 'AI credits depleted. Please add credits.' };
        if (response.status === 504) return { error: 'Request timed out. Please try again.' };
        const errorData = await response.json().catch(() => ({}));
        return { error: errorData.error || 'Failed to organize notes' };
      }

      const data = await response.json();
      if (!data?.success || !data?.data) return { error: 'Invalid response from AI' };

      const result = data.data as OrganizeDumpResult;
      if (!Array.isArray(result.items)) return { error: 'Invalid response format' };

      return { data: result };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return { error: 'Request timed out. Please try again.' };
      }
      console.error('organizeDump error:', err);
      return { error: 'Failed to organize notes' };
    } finally {
      setIsLoading(false);
    }
  }, [buildContext]);

  const getActionSuggestions = useCallback(async (
    question: string,
    answer: string
  ): Promise<{ actions: ActionSuggestion[] }> => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'ask_action_suggestions',
          input: question,
          context: {
            ...buildContext(),
            answer,
          },
        },
      });

      if (error || !data?.success) return { actions: [] };
      return { actions: data.data?.actions || [] };
    } catch {
      return { actions: [] };
    }
  }, [buildContext]);

  return {
    isLoading,
    askQuestion,
    getSmartSuggestions,
    findConnections,
    organizeNote,
    organizeAllItems,
    organizeDump,
    getActionSuggestions,
  };
}
