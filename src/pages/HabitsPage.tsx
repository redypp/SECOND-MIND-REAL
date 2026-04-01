import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Plus, X, Check, Trash2, ChevronLeft, ChevronRight, GripVertical, Settings2, Pencil, Minus, ArrowLeft } from 'lucide-react';
import { SecondMindLoader } from '@/components/SecondMindLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomNavigation } from '@/components/BottomNavigation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTutorial } from '@/contexts/TutorialContext';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  isAfter
} from 'date-fns';

interface Habit {
  id: string;
  name: string;
  createdAt: string;
  position: number;
}

interface HabitEntry {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  status: 'done' | 'partial' | 'missed';
}

// Migrate localStorage habits to cloud on first load.
//
// SECURITY: The legacy localStorage keys ('secondmind_habits', 'secondmind_habit_entries')
// are NOT scoped by user_id. If data from a previous account remains in localStorage
// (e.g. after a session expiry without a full sign-out), a naive migration would import
// another user's habits into the current user's account.
//
// Guard: we use a per-user flag key ('secondmind_habits_migrated_<userId>') to ensure
// each user's migration runs exactly once. The unscoped legacy keys are ALWAYS cleared
// on every call — whether migration runs or not — so they can never leak to a different
// account on the next sign-in.
async function migrateLocalHabits(userId: string): Promise<void> {
  const LOCAL_HABITS_KEY = 'secondmind_habits';
  const LOCAL_ENTRIES_KEY = 'secondmind_habit_entries';
  // Per-user flag: set after a successful (or skipped) migration so we never re-run.
  const MIGRATED_FLAG_KEY = `secondmind_habits_migrated_${userId}`;

  // Read legacy data upfront so we can clear the unscoped keys immediately,
  // regardless of what happens next (prevents cross-account contamination).
  const localHabitsStr = localStorage.getItem(LOCAL_HABITS_KEY);
  const localEntriesStr = localStorage.getItem(LOCAL_ENTRIES_KEY);

  // Always nuke the unscoped keys — they are not safe to leave around across sign-ins.
  localStorage.removeItem(LOCAL_HABITS_KEY);
  localStorage.removeItem(LOCAL_ENTRIES_KEY);

  // If this user has already been migrated, stop here.
  if (localStorage.getItem(MIGRATED_FLAG_KEY) === 'true') return;

  // Mark as complete for this user (whether or not there was anything to migrate).
  // We do this before the async work so a crash mid-migration doesn't leave stale
  // unscoped keys that could be picked up by a different account later.
  localStorage.setItem(MIGRATED_FLAG_KEY, 'true');

  if (!localHabitsStr) return;

  try {
    const localHabits = JSON.parse(localHabitsStr) as Array<{ id: string; name: string; createdAt: string }>;
    if (localHabits.length === 0) return;

    // Check if user already has cloud habits — if so, skip (already migrated earlier).
    const { data: existingHabits } = await supabase
      .from('habits')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (existingHabits && existingHabits.length > 0) {
      return;
    }

    // Migrate habits
    const habitIdMap = new Map<string, string>(); // old ID -> new UUID
    for (let i = 0; i < localHabits.length; i++) {
      const h = localHabits[i];
      const { data, error } = await supabase
        .from('habits')
        .insert({
          user_id: userId,
          name: h.name,
          position: i,
        })
        .select('id')
        .single();

      if (!error && data) {
        habitIdMap.set(h.id, data.id);
      }
    }

    // Migrate entries
    if (localEntriesStr) {
      const localEntries = JSON.parse(localEntriesStr) as Array<{ habitId: string; date: string; status: string }>;
      const validEntries = localEntries
        .filter(e => habitIdMap.has(e.habitId) && ['done', 'partial', 'missed'].includes(e.status))
        .map(e => ({
          user_id: userId,
          habit_id: habitIdMap.get(e.habitId)!,
          date: e.date,
          status: e.status,
        }));

      if (validEntries.length > 0) {
        // Insert in batches of 50
        for (let i = 0; i < validEntries.length; i += 50) {
          const batch = validEntries.slice(i, i + 50);
          await supabase.from('habit_entries').insert(batch as any);
        }
      }
    }

  } catch (err) {
    // The per-user flag is already set and unscoped keys already cleared — safe to proceed.
  }
}

interface HabitsPageProps {
  embedded?: boolean;
  onBack?: () => void;
}

export default function HabitsPage({ embedded = false, onBack }: HabitsPageProps) {
  const { user } = useAuth();
  const { reportTutorialAction, currentStep, isActive } = useTutorial();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHabitName, setNewHabitName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Auto-open edit mode for tutorial
  useEffect(() => {
    if (isActive && currentStep === 'tour-habits') {
      setEditMode(true);
    }
  }, [isActive, currentStep]);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const hasMigrated = useRef(false);
  // Track which user we last loaded data for — used to detect account switches
  // and clear stale data before loading the new user's habits.
  const loadedForUserRef = useRef<string | null>(null);
  
  // Current month being viewed - starts at today's month
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  
  const today = new Date();
  const scrollContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Track whether this is the first mount scroll (instant) vs month-nav scroll (smooth)
  const isInitialScrollRef = useRef(true);

  // Fetch habits and entries from cloud
  const fetchData = useCallback(async () => {
    if (!user) {
      setHabits([]);
      setEntries([]);
      setLoading(false);
      loadedForUserRef.current = null;
      return;
    }

    // Detect account switch: if a different user was previously loaded, clear
    // stale data immediately so it is never visible to the incoming user.
    if (loadedForUserRef.current !== null && loadedForUserRef.current !== user.id) {
      console.warn(
        `[Habits] Account switch detected (${loadedForUserRef.current} → ${user.id}). ` +
        'Clearing stale habits before loading new user data.'
      );
      setHabits([]);
      setEntries([]);
      hasMigrated.current = false; // Allow migration check for the new user
    }

    // Record which user we are loading for, before any async work.
    loadedForUserRef.current = user.id;
    setLoading(true);

    try {
      // Migrate localStorage data first (only once per user session)
      if (!hasMigrated.current) {
        hasMigrated.current = true;
        await migrateLocalHabits(user.id);
      }

      const [habitsResult, entriesResult] = await Promise.all([
        supabase
          .from('habits')
          .select('*')
          .eq('user_id', user.id)
          .order('position', { ascending: true }),
        supabase
          .from('habit_entries')
          .select('*')
          .eq('user_id', user.id),
      ]);

      if (habitsResult.error) throw habitsResult.error;
      if (entriesResult.error) throw entriesResult.error;

      // Guard: if the user changed while this fetch was in-flight, discard results.
      if (loadedForUserRef.current !== user.id) {
        console.warn('[Habits] User changed during fetch — discarding stale results');
        return;
      }

      const habits = (habitsResult.data || []).map(h => ({
        id: h.id,
        name: h.name,
        createdAt: h.created_at,
        position: h.position,
      }));
      const entries = (entriesResult.data || []).map(e => ({
        id: e.id,
        habitId: e.habit_id,
        date: e.date,
        status: e.status as 'done' | 'partial' | 'missed',
      }));

      setHabits(habits);
      setEntries(entries);
    } catch (err) {
      console.error('[Habits] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Scroll to today — smooth when navigating months, instant on first mount
  const scrollToToday = useCallback((behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => {
      scrollContainerRefs.current.forEach((container) => {
        if (container) {
          const dayWidth = 34;
          const todayIndex = today.getDate() - 1;
          const scrollPosition = (todayIndex + 1) * dayWidth - container.clientWidth + 16;
          container.scrollTo({ left: Math.max(0, scrollPosition), behavior });
        }
      });
    }, 50);
  }, [today]);

  // Scroll to today on first mount (instant) — only once after habits load
  const hasScrolledOnMountRef = useRef(false);
  useEffect(() => {
    if (!loading && !hasScrolledOnMountRef.current && scrollContainerRefs.current.size > 0) {
      hasScrolledOnMountRef.current = true;
      scrollToToday('instant');
    }
  }, [loading, scrollToToday]);

  // Scroll smoothly when user navigates to a different month
  useEffect(() => {
    if (isInitialScrollRef.current) {
      isInitialScrollRef.current = false;
      return;
    }
    scrollToToday('smooth');
  }, [viewMonth, scrollToToday]);


  // Days of the current month
  const monthDays = useMemo(() => {
    return eachDayOfInterval({ 
      start: startOfMonth(viewMonth), 
      end: endOfMonth(viewMonth) 
    });
  }, [viewMonth]);

  const addHabit = async () => {
    if (!newHabitName.trim()) return;

    // Guard: unauthenticated users get a visible error, not a silent no-op.
    if (!user) {
      showErrorPopup('You must be signed in to add a habit.');
      return;
    }

    const position = habits.length;
    const insertPayload = {
      user_id: user.id,
      name: newHabitName.trim(),
      position,
    };
    try {
      const { data, error } = await supabase
        .from('habits')
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;

      // Null-guard: defend against edge cases where Supabase returns no error
      // but also no data (e.g. RLS WITH CHECK silently filtered the row out).
      if (!data) {
        throw new Error(
          'Insert appeared to succeed but Supabase returned no row. ' +
          'This usually means an RLS WITH CHECK policy rejected the write.'
        );
      }

      // Post-insert verification: re-query the row to confirm it is actually
      // persisted in Supabase and readable by this user.
      const { data: verifyData, error: verifyError } = await supabase
        .from('habits')
        .select('id, name, user_id, position')
        .eq('id', data.id)
        .single();

      if (verifyError || !verifyData) {
        throw new Error(
          `Habit row (id=${data.id}) was inserted but could not be read back. ` +
          `Verify error: ${verifyError?.message ?? 'no row returned'}`
        );
      }

      // Only update local state once the DB write is confirmed.
      setHabits(prev => [...prev, {
        id: data.id,
        name: data.name,
        createdAt: data.created_at,
        position: data.position,
      }]);
      setNewHabitName('');
      setIsAdding(false);
      setEditMode(false);
      reportTutorialAction('add-habit');
    } catch (err) {
      console.error('[Habits:addHabit] Failed to add habit:', err);
      showErrorPopup('Could not save habit. Please check your connection and try again.');
    }
  };

  const deleteHabit = async (id: string) => {
    if (!user) return;
    
    // Optimistic update
    setHabits(prev => prev.filter(h => h.id !== id));
    setEntries(prev => prev.filter(e => e.habitId !== id));

    try {
      const { error } = await supabase
        .from('habits')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) throw error;
    } catch (err) {
      console.error('[Habits] Failed to delete:', err);
      fetchData(); // Revert on failure
    }
  };

  const startEditing = (habit: Habit) => {
    setEditingHabitId(habit.id);
    setEditedName(habit.name);
  };

  const saveEditedName = async () => {
    if (!editingHabitId || !editedName.trim() || !user) return;

    const trimmedName = editedName.trim();
    const editingId = editingHabitId;
    const originalHabit = habits.find(h => h.id === editingId);
    setHabits(prev => prev.map(h =>
      h.id === editingId ? { ...h, name: trimmedName } : h
    ));
    setEditingHabitId(null);
    setEditedName('');

    try {
      const { error } = await supabase
        .from('habits')
        .update({ name: trimmedName })
        .eq('id', editingId)
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error('[Habits] Failed to update name:', err);
      // Revert optimistic update
      if (originalHabit) {
        setHabits(prev => prev.map(h => h.id === editingId ? originalHabit : h));
      }
      showErrorPopup('Could not rename habit. Please try again.');
    }
  };

  const getEntryStatus = (habitId: string, date: Date): 'done' | 'partial' | 'missed' | null => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const entry = entries.find(e => e.habitId === habitId && e.date === dateStr);
    return entry?.status ?? null;
  };

  const toggleEntry = async (habitId: string, date: Date) => {
    if (!user) return;
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const existingEntry = entries.find(e => e.habitId === habitId && e.date === dateStr);
    
    if (!existingEntry) {
      // No entry → done
      const tempId = crypto.randomUUID();
      setEntries(prev => [...prev, { id: tempId, habitId, date: dateStr, status: 'done' }]);
      
      try {
        const { data, error } = await supabase
          .from('habit_entries')
          .insert({
            user_id: user.id,
            habit_id: habitId,
            date: dateStr,
            status: 'done',
          })
          .select('id')
          .single();
        
        if (error) throw error;
        // Update with real ID
        setEntries(prev => prev.map(e => e.id === tempId ? { ...e, id: data.id } : e));
      } catch (err) {
        console.error('[Habits] Failed to create entry:', err);
        setEntries(prev => prev.filter(e => e.id !== tempId));
      }
    } else if (existingEntry.status === 'done') {
      // done → partial
      setEntries(prev => prev.map(e =>
        e.id === existingEntry.id ? { ...e, status: 'partial' as const } : e
      ));
      try {
        const { error } = await supabase
          .from('habit_entries')
          .update({ status: 'partial' })
          .eq('id', existingEntry.id)
          .eq('user_id', user.id);
        if (error) throw new Error(error.message);
      } catch (err) {
        console.error('[Habits] Failed to update entry:', err);
        setEntries(prev => prev.map(e => e.id === existingEntry.id ? existingEntry : e));
      }
    } else if (existingEntry.status === 'partial') {
      // partial → missed
      setEntries(prev => prev.map(e =>
        e.id === existingEntry.id ? { ...e, status: 'missed' as const } : e
      ));
      try {
        const { error } = await supabase
          .from('habit_entries')
          .update({ status: 'missed' })
          .eq('id', existingEntry.id)
          .eq('user_id', user.id);
        if (error) throw new Error(error.message);
      } catch (err) {
        console.error('[Habits] Failed to update entry:', err);
        setEntries(prev => prev.map(e => e.id === existingEntry.id ? existingEntry : e));
      }
    } else if (existingEntry.status === 'missed') {
      // missed → remove
      setEntries(prev => prev.filter(e => e.id !== existingEntry.id));
      try {
        const { error } = await supabase
          .from('habit_entries')
          .delete()
          .eq('id', existingEntry.id)
          .eq('user_id', user.id);
        if (error) throw new Error(error.message);
      } catch (err) {
        console.error('[Habits] Failed to delete entry:', err);
        setEntries(prev => [...prev, existingEntry]);
      }
    }
  };

  const handleReorder = async (newOrder: Habit[]) => {
    if (!user) return;
    
    setHabits(newOrder);
    
    // Update positions in cloud
    try {
      for (let i = 0; i < newOrder.length; i++) {
        await supabase
          .from('habits')
          .update({ position: i })
          .eq('id', newOrder[i].id)
          .eq('user_id', user.id);
      }
    } catch (err) {
      console.error('[Habits] Failed to reorder:', err);
    }
  };

  const goToPrevMonth = () => setViewMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setViewMonth(prev => addMonths(prev, 1));
  
  const canGoNext = !isAfter(startOfMonth(viewMonth), startOfMonth(today));

  const getCompletionRate = (habitId: string) => {
    const daysUntilToday = monthDays.filter(d => !isAfter(d, today)).length;
    const score = monthDays.reduce((acc, d) => {
      const status = getEntryStatus(habitId, d);
      if (status === 'done') return acc + 1;
      if (status === 'partial') return acc + 0.5;
      return acc;
    }, 0);
    return daysUntilToday > 0 ? Math.round((score / daysUntilToday) * 100) : 0;
  };

  if (loading) {
    return (
      <div className={`h-screen flex flex-col bg-background overflow-hidden w-full max-w-md mx-auto ${embedded ? 'pb-12' : 'pb-20'}`}>
        <div className="flex-1 flex items-center justify-center">
          <SecondMindLoader size={32} />
        </div>
        {!embedded && <BottomNavigation />}
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col bg-background overflow-hidden w-full max-w-md mx-auto ${embedded ? 'pb-12' : 'pb-20'} ${!embedded ? 'safe-area-top-ios' : ''}`}>
      {/* Header */}
      <header className="flex-shrink-0 bg-background/95 backdrop-blur pt-4 pb-3 px-4">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="p-3 -ml-2 rounded-lg hover:bg-secondary active:bg-secondary/80 transition-colors touch-manipulation shrink-0"
                  style={{ minWidth: 44, minHeight: 44 }}
                  aria-label="Back to Life"
                >
                  <ArrowLeft className="w-5 h-5 text-foreground" />
                </button>
              )}
              <h1 className="text-2xl font-display font-bold tracking-[-0.04em] uppercase text-foreground">Habits</h1>
            </div>
          <motion.button
            data-tutorial="habit-settings"
            whileTap={{ scale: 0.95 }}
            onClick={() => setEditMode(!editMode)}
            className={`p-3.5 rounded-full transition-all duration-200 ${
              editMode 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-secondary/80 hover:bg-secondary text-foreground'
            }`}
          >
            {editMode ? <X className="w-5 h-5" /> : <Settings2 className="w-5 h-5" />}
          </motion.button>
        </div>
      </header>

      {/* Edit Mode Instructions */}
      <AnimatePresence>
        {editMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pt-3 overflow-hidden"
          >
            <div className="py-3 px-4 bg-secondary/50 border border-border/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                Drag to reorder • Tap pencil to rename • Tap trash to delete
              </p>
            </div>
            
            <Button
              data-tutorial="add-habit-btn"
              onClick={() => setIsAdding(true)}
              variant="outline"
              className="w-full mt-3 h-9 text-xs"
            >
              <Plus className="h-3 w-3 mr-1.5" />
              Add New Habit
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Month Navigation */}
      {!editMode && habits.length > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-1 w-full">
          <Button variant="ghost" size="icon" onClick={goToPrevMonth} className="h-6 w-6">
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <h2 className="text-xs font-semibold text-foreground">
            {format(viewMonth, 'MMMM yyyy')}
          </h2>
          <Button variant="ghost" size="icon" onClick={goToNextMonth} disabled={!canGoNext} className="h-6 w-6">
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-2 w-full">
        {/* Add Habit Form */}
        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 overflow-hidden"
            >
              <div className="flex gap-1.5 p-2 bg-card rounded-lg border border-border">
                <Input
                  value={newHabitName}
                  onChange={(e) => setNewHabitName(e.target.value)}
                  placeholder="New habit name..."
                  className="flex-1 h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addHabit();
                    if (e.key === 'Escape') setIsAdding(false);
                  }}
                />
                <Button onClick={addHabit} size="sm" className="h-8 px-3 text-xs">
                  Add
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setIsAdding(false);
                    setNewHabitName('');
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {habits.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 px-6"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 border-2 border-dashed border-border rounded-2xl mb-6">
              <Check className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">No habits yet</h3>
            <p className="text-muted-foreground text-sm max-w-[280px] mx-auto mb-8 leading-relaxed">
              Start tracking your daily habits to build consistency and achieve your goals.
            </p>
            <Button onClick={() => { setEditMode(true); setIsAdding(true); }} size="default">
              <Plus className="h-4 w-4 mr-2" />
              Add your first habit
            </Button>
          </motion.div>
        ) : editMode ? (
          <Reorder.Group 
            axis="y" 
            values={habits} 
            onReorder={handleReorder}
            className="space-y-2"
          >
            {habits.map((habit) => (
              <Reorder.Item
                key={habit.id}
                value={habit}
                className="bg-card rounded-xl border border-border p-3 cursor-grab active:cursor-grabbing"
                whileDrag={{ 
                  scale: 1.02, 
                  boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)",
                  zIndex: 50 
                }}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                  
                  {editingHabitId === habit.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="flex-1 h-8 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditedName();
                          if (e.key === 'Escape') {
                            setEditingHabitId(null);
                            setEditedName('');
                          }
                        }}
                      />
                      <Button onClick={saveEditedName} size="sm" className="h-8 px-2">
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium text-foreground truncate">
                        {habit.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditing(habit)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteHabit(habit.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        ) : (
          <div className="space-y-2">
            {habits.map((habit) => (
              <motion.div
                key={habit.id}
                layout
                className="bg-card rounded-xl border border-border p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {habit.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getCompletionRate(habit.id)}%
                  </span>
                </div>

                <div 
                  ref={(el) => {
                    if (el) scrollContainerRefs.current.set(habit.id, el);
                  }}
                  className="flex gap-0.5 overflow-x-auto scrollbar-hide py-1"
                >
                  {monthDays.map((date) => {
                    const isToday = isSameDay(date, today);
                    const isFuture = isAfter(date, today);
                    const status = getEntryStatus(habit.id, date);
                    
                    return (
                      <button
                        key={date.toISOString()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => !isFuture && toggleEntry(habit.id, date)}
                        disabled={isFuture}
                        tabIndex={-1}
                        className={`
                          flex-shrink-0 w-8 h-8 rounded flex items-center justify-center
                          text-[11px] font-medium transition-all duration-150 touch-manipulation
                          ${isFuture
                            ? 'bg-secondary/30 text-muted-foreground/55 cursor-not-allowed'
                            : 'hover:scale-110 active:scale-95 cursor-pointer'
                          }
                          ${status === 'done' 
                            ? 'bg-emerald-500 text-white' 
                            : status === 'partial'
                              ? 'bg-orange-500 text-white'
                              : status === 'missed'
                              ? 'bg-red-maroon text-white'
                              : !isFuture
                                ? 'bg-secondary/50 text-foreground hover:bg-secondary'
                                : ''
                          }
                          ${isToday && !status ? 'ring-1 ring-primary ring-offset-1 ring-offset-card' : ''}
                        `}
                      >
                        {status === 'done' ? (
                          <Check className="h-3 w-3" />
                        ) : status === 'partial' ? (
                          <Minus className="h-3 w-3" />
                        ) : status === 'missed' ? (
                          <X className="h-3 w-3" />
                        ) : (
                          <span>{format(date, 'd')}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {!embedded && <BottomNavigation />}
    </div>
  );
}
