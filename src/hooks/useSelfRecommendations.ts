import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/app-client';
import { useSpaces } from '@/contexts/SpacesContext';
import { useAuth } from '@/contexts/AuthContext';

export type RecommendationCategory =
  | 'local'
  | 'capture'
  | 'reflect'
  | 'explore'
  | 'connect'
  | 'habit';

export interface Recommendation {
  category: RecommendationCategory;
  title: string;
  rationale: string;
  action_hint: string;
  related_archive: string;
}

interface CacheEntry {
  recommendations: Recommendation[];
  timestamp: number;
}

// Personalised feed is refreshed on a slow cadence — the Self hub should feel
// like a living home but shouldn't burn tokens on every visit.
const CACHE_TTL_MS = 1000 * 60 * 60 * 4; // 4 hours
const CACHE_KEY = 'smind_self_recommendations_v1';

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || !Array.isArray(parsed.recommendations)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* ignore — cache is best-effort */
  }
}

/**
 * useSelfRecommendations — AI-powered personalised recommendations for the
 * Self hub. Draws on the user's profile, archive names, and recent activity
 * to surface 4–6 varied suggestions (local ideas, reflections, captures, etc).
 *
 * Cached in localStorage for a few hours to avoid burning tokens on every
 * visit. `refresh()` bypasses the cache.
 */
export function useSelfRecommendations() {
  const { spaces, items } = useSpaces();
  const { user, profile } = useAuth();
  const [recommendations, setRecommendations] = useState<Recommendation[]>(() => readCache()?.recommendations ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const fetchRecommendations = useCallback(async (force = false): Promise<Recommendation[] | null> => {
    if (!user) return null;
    if (inFlightRef.current) return null;

    // Cache hit — return immediately unless forced.
    if (!force) {
      const cached = readCache();
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.recommendations.length > 0) {
        setRecommendations(cached.recommendations);
        return cached.recommendations;
      }
    }

    inFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Most-recent items give the AI a flavour of what the user is currently
      // thinking about. Keep this small — the Haiku tokens add up.
      const recentItems = [...items]
        .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
        .slice(0, 12)
        .map(it => ({
          id: it.id,
          title: it.title,
          subCategory: it.subCategory,
          content: (it.content ?? '').slice(0, 240),
          blocks: [],
          spaceIds: it.spaceIds,
        }));

      const { data, error: fnError } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'personal_recommendations',
          input: `Generate personalised recommendations for ${profile?.full_name || 'this user'}.`,
          context: {
            currentTime: new Date().toISOString(),
            spaces: spaces.map(s => ({ id: s.id, name: s.name, itemCount: s.itemCount })),
            items: recentItems,
            userProfile: {
              name: profile?.full_name ?? null,
              birthday: profile?.birthday ?? null,
              location: profile?.location ?? null,
            },
          },
        },
      });

      if (fnError) throw new Error(fnError.message);

      const recs: Recommendation[] | undefined =
        data?.data?.recommendations ??
        data?.recommendations ??
        undefined;

      if (!recs || !Array.isArray(recs)) {
        throw new Error('Recommendations response was not in the expected shape');
      }

      setRecommendations(recs);
      writeCache({ recommendations: recs, timestamp: Date.now() });
      return recs;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load recommendations';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, [user, profile, spaces, items]);

  // Auto-fetch on mount if the cache is cold. Defensive — don't block render.
  useEffect(() => {
    if (!user) return;
    const cached = readCache();
    const stale = !cached || Date.now() - cached.timestamp >= CACHE_TTL_MS || cached.recommendations.length === 0;
    if (stale) {
      void fetchRecommendations(false);
    }
  }, [user, fetchRecommendations]);

  const refresh = useCallback(() => fetchRecommendations(true), [fetchRecommendations]);

  return { recommendations, isLoading, error, refresh };
}
