import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/app-client';
import { useSpaces } from '@/contexts/SpacesContext';
import { useAuth } from '@/contexts/AuthContext';

export interface LifeSubheadings {
  daily_plan: string;
  todo: string;
  habits: string;
  journal: string;
}

// Module-level cache: persists for the lifetime of the JS bundle (cleared on page reload)
let sessionCache: LifeSubheadings | null = null;
let fetchInProgress = false;

/** Call on sign-out so the next user never sees a previous user's cached subheadings. */
export function clearSubheadingsCache(): void {
  sessionCache = null;
  fetchInProgress = false;
}

// Rotation seed: increments each time the JS bundle loads fresh (page reload / app restart).
// Wraps at 5 so phrasing cycles through 5 variants without repeating too often.
const ROTATION_KEY = 'sm_subhead_rotation';
const rotationSeed = (() => {
  try {
    const prev = parseInt(sessionStorage.getItem(ROTATION_KEY) || '0', 10);
    const next = (isNaN(prev) ? 0 : prev + 1) % 5;
    sessionStorage.setItem(ROTATION_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
})();

// ─── Shared context builder ──────────────────────────────────────────────────
// Fetches all signals needed for smart subheadings in one parallel batch.
async function buildSubheadingContext() {
  // Use local timezone date/time to match how items are stored (not UTC)
  const localDate = format(new Date(), 'yyyy-MM-dd');
  const localTime = format(new Date(), 'HH:mm');
  const sevenDaysAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [spacesRes, itemsRes, habitsRes, habitEntriesRes] = await Promise.all([
    supabase
      .from('spaces')
      .select('id, name, item_count')
      .is('deleted_at', null)
      .limit(50),
    supabase
      .from('items')
      .select('id, title, sub_category, space_ids, scheduled_date, scheduled_time, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('habits')
      .select('id, name')
      .order('position', { ascending: true }),
    supabase
      .from('habit_entries')
      .select('habit_id, status')
      .eq('date', localDate),
  ]);

  const spaces = (spacesRes.data || []).map(s => ({
    id: s.id,
    name: s.name,
    itemCount: s.item_count,
  }));

  const rawItems = itemsRes.data || [];
  const allItems = rawItems.map(item => ({
    id: item.id,
    title: item.title,
    subCategory: item.sub_category,
    spaceIds: item.space_ids || [],
    scheduledDate: item.scheduled_date,
    scheduledTime: item.scheduled_time,
    createdAt: item.created_at,
  }));

  const habits = (habitsRes.data || []).map(h => ({ id: h.id, name: h.name }));
  const todayEntries = habitEntriesRes.data || [];
  const habitsCompletedToday = todayEntries.filter(e => e.status === 'done').length;

  // Journal items written in the last 7 days
  const journalItems = allItems.filter(
    i => i.subCategory === 'journal' && i.createdAt && i.createdAt.slice(0, 10) >= sevenDaysAgo
  );
  const journalCount7Days = journalItems.length;
  const lastJournalDate = journalItems.length > 0 ? (journalItems[0].createdAt?.slice(0, 10) ?? null) : null;

  // Notes/ideas added in the last 24 h (createdAt is UTC ISO so comparison is fine)
  const recentNoteCount = allItems.filter(
    i => (i.subCategory === 'notes' || i.subCategory === 'idea') && i.createdAt && i.createdAt >= oneDayAgo
  ).length;

  // Only send up to 50 items to the edge function (MAX_ITEMS validation limit)
  const items = allItems.slice(0, 50);

  return {
    spaces,
    items,
    habits,
    habitsCompletedToday,
    journalCount7Days,
    lastJournalDate,
    recentNoteCount,
    // Pass local date/time explicitly to avoid UTC vs local timezone mismatch
    localDate,
    localTime,
    currentTime: new Date().toISOString(),
    rotationSeed,
  };
}

/**
 * Prefetch subheadings during boot (before the app renders).
 * Call this after auth is initialized so we have a valid token.
 * Fetches items/spaces/habits directly from DB to avoid depending on SpacesContext.
 */
export async function prefetchLifeSubheadings(): Promise<void> {
  if (sessionCache || fetchInProgress) return;
  fetchInProgress = true;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const authToken = sessionData?.session?.access_token;
    if (!authToken) return;

    const context = await buildSubheadingContext();
    if (context.items.length === 0) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            type: 'life_subheadings',
            input: 'Generate personalized subheadings for my life sections',
            context,
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) return;

    const data = await response.json();
    if (data?.success && data?.data) {
      sessionCache = {
        daily_plan: data.data.daily_plan || '',
        todo: data.data.todo || '',
        habits: data.data.habits || '',
        journal: data.data.journal || '',
      };
    }
  } catch (err) {
    console.error('Life subheadings prefetch error:', err);
  } finally {
    fetchInProgress = false;
  }
}

export function useLifeSubheadings(fallbacks: LifeSubheadings): LifeSubheadings {
  const { items } = useSpaces();
  const { user, session } = useAuth();
  const [aiSubheadings, setAiSubheadings] = useState<LifeSubheadings | null>(sessionCache);
  const attempted = useRef(false);

  // If prefetch already populated the cache, pick it up immediately
  useEffect(() => {
    if (sessionCache) {
      setAiSubheadings(sessionCache);
    }
  }, []);

  useEffect(() => {
    // Only fetch once per session, and only when we have data
    if (sessionCache || attempted.current || fetchInProgress || !user || items.length === 0) return;
    attempted.current = true;
    fetchInProgress = true;

    const authToken = session?.access_token;

    (async () => {
      try {
        if (!authToken) return;

        // Build the full rich context (habits, journal counts, local dates, rotation seed, etc.)
        const context = await buildSubheadingContext();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        let response: Response;
        try {
          response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                type: 'life_subheadings',
                input: 'Generate personalized subheadings for my life sections',
                context,
              }),
              signal: controller.signal,
            }
          );
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) return;

        const data = await response.json();
        if (data?.success && data?.data) {
          const result: LifeSubheadings = {
            daily_plan: data.data.daily_plan || fallbacks.daily_plan,
            todo: data.data.todo || fallbacks.todo,
            habits: data.data.habits || fallbacks.habits,
            journal: data.data.journal || fallbacks.journal,
          };
          sessionCache = result;
          setAiSubheadings(result);
        }
      } catch (err) {
        console.error('Life subheadings fetch error:', err);
      } finally {
        fetchInProgress = false;
      }
    })();
  }, [user, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always use real-time fallback for daily_plan (event counts change frequently).
  // Use AI subheadings for the more subjective fields (todo, habits, journal).
  return {
    daily_plan: fallbacks.daily_plan,
    todo: aiSubheadings?.todo || fallbacks.todo,
    habits: aiSubheadings?.habits || fallbacks.habits,
    journal: aiSubheadings?.journal || fallbacks.journal,
  };
}
