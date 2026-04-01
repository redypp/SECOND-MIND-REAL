import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';

export type OnboardingPhase =
  | 'ai-name'
  | 'ai-tone'
  | 'ai-focus'
  | 'tour-home'
  | 'tour-daily-plan'
  | 'tour-todos'
  | 'tour-habits'
  | 'tour-journal'
  | 'tour-archive'
  | 'tour-archive-explore'
  | 'tour-archive-add'
  | 'tour-archive-ai'
  | 'tour-ask'
  | 'complete';

// Legacy type alias for components that imported TutorialStep
export type TutorialStep = OnboardingPhase;

const PHASE_ORDER: OnboardingPhase[] = [
  'ai-name',
  'ai-tone',
  'ai-focus',
  'tour-home',
  'tour-daily-plan',
  'tour-todos',
  'tour-habits',
  'tour-journal',
  'tour-archive',
  'tour-archive-explore',
  'tour-archive-add',
  'tour-archive-ai',
  'tour-ask',
  'complete',
];

const STORAGE_KEY = 'secondmind_onboarding_phase';

export interface TourPhaseConfig {
  phase: OnboardingPhase;
  route: string;
  /** CSS selector for the element to spotlight. Omit for view-only steps. */
  targetSelector?: string;
  title: string;
  description: string;
  /** What to tell the user to do. Omit for view-only steps (a Next button is shown instead). */
  instruction?: string;
  /** Action key that pages report when the interaction is complete. Omit for view-only steps. */
  actionKey?: string;
  stepNumber: number;
  totalSteps: number;
}

export const TOUR_PHASE_CONFIGS: Record<string, TourPhaseConfig> = {
  // ── View-only step: Life/Home ──────────────────────────────────────────────
  'tour-home': {
    phase: 'tour-home',
    route: '/',
    title: 'Your Life dashboard',
    description:
      'This is your home. Upcoming events, recent notes, and quick-capture all live here. Everything connects back to this view.',
    stepNumber: 1,
    totalSteps: 10,
  },

  // ── Action steps ──────────────────────────────────────────────────────────
  'tour-daily-plan': {
    phase: 'tour-daily-plan',
    route: '/daily-plan',
    targetSelector: '[data-tutorial="add-event"]',
    title: 'Daily Planner',
    description:
      'A 24-hour visual timeline. Schedule events, focus blocks, and reminders so your day has structure.',
    instruction: 'Tap the + button to add your first event',
    actionKey: 'add-event',
    stepNumber: 2,
    totalSteps: 10,
  },
  'tour-todos': {
    phase: 'tour-todos',
    route: '/todos',
    targetSelector: '[data-tutorial="add-todo"]',
    title: 'Tasks',
    description:
      'Tasks float here until checked off. They stay visible so nothing gets buried or forgotten.',
    instruction: 'Tap + to create your first task',
    actionKey: 'add-todo',
    stepNumber: 3,
    totalSteps: 10,
  },
  'tour-habits': {
    phase: 'tour-habits',
    route: '/habits',
    targetSelector: '[data-tutorial="add-habit-btn"]',
    title: 'Habits',
    description:
      'Track anything you want to do consistently — exercise, reading, hydration. A simple daily grid keeps you honest.',
    instruction: 'Tap "Add New Habit" and give it a name',
    actionKey: 'add-habit',
    stepNumber: 4,
    totalSteps: 10,
  },
  'tour-journal': {
    phase: 'tour-journal',
    route: '/journal',
    targetSelector: '[data-tutorial="journal-input"]',
    title: 'Journal',
    description:
      'A private space for thoughts, reflections, and goals. Write freely — it saves automatically as you type.',
    instruction: 'Write anything here to continue',
    actionKey: 'journal-write',
    stepNumber: 5,
    totalSteps: 10,
  },

  // ── Archive section (3 steps) ─────────────────────────────────────────────
  'tour-archive': {
    phase: 'tour-archive',
    route: '/archive',
    targetSelector: '[data-tutorial="add-collection"]',
    title: 'Archive',
    description:
      'Archives group your notes, links, and ideas by topic — Work, Travel, Health, anything you like.',
    instruction: 'Tap + to create your first archive',
    actionKey: 'add-collection',
    stepNumber: 6,
    totalSteps: 10,
  },
  // Route '__space__' is resolved at runtime in OnboardingTutorial using the
  // localStorage key 'secondmind_tutorial_space_id' set after archive creation.
  'tour-archive-explore': {
    phase: 'tour-archive-explore',
    route: '__space__',
    title: 'Inside your archive',
    description:
      'Everything you save here stays in one place — notes, links, images, ideas. Tap + to start adding.',
    stepNumber: 7,
    totalSteps: 10,
  },
  'tour-archive-add': {
    phase: 'tour-archive-add',
    route: '__space__',
    targetSelector: '[data-tutorial="add-archive-item"]',
    title: 'Add your first note',
    description:
      'Write anything — a thought, a link, an idea. The AI reads it and can help you make sense of it later.',
    instruction: 'Tap + to add your first item',
    actionKey: 'add-archive-item',
    stepNumber: 8,
    totalSteps: 10,
  },
  'tour-archive-ai': {
    phase: 'tour-archive-ai',
    route: '__space__',
    targetSelector: '[data-tutorial="archive-settings"]',
    title: 'AI Organize',
    description:
      'The ✨ Organize option uses AI to group everything in your archive by theme — no manual sorting needed. Try it anytime from here.',
    stepNumber: 9,
    totalSteps: 10,
  },

  // ── AI Ask ────────────────────────────────────────────────────────────────
  // AskPage renders at z-[99999], so the spotlight sits under it.
  // We rely on the bottom bar instruction only — no spotlight needed.
  'tour-ask': {
    phase: 'tour-ask',
    route: '/ask',
    title: 'AI Ask',
    description:
      "Your personal assistant. Ask anything — it searches your notes, helps you plan, and thinks alongside you.",
    instruction: 'Type a message and send it',
    actionKey: 'ai-message',
    stepNumber: 10,
    totalSteps: 10,
  },
};

// Legacy export kept for backward compatibility (InteractiveTutorial.tsx)
export const TUTORIAL_STEP_CONFIGS = TOUR_PHASE_CONFIGS;

interface TutorialContextType {
  currentPhase: OnboardingPhase;
  isOnboardingActive: boolean;
  advancePhase: () => void;
  completeOnboarding: () => void;
  skipOnboarding: () => void;
  resetOnboarding: () => void;
  reportTutorialAction: (actionKey: string) => void;
  pendingAction: string | null;
  actionCompleted: boolean;
  // Legacy aliases so existing page components keep working without changes
  currentStep: OnboardingPhase;
  isActive: boolean;
  advanceStep: () => void;
  completeTutorial: () => void;
  skipTutorial: () => void;
  restartTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

function resolveInitialPhase(): OnboardingPhase {
  // Check new unified key first
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && PHASE_ORDER.includes(saved as OnboardingPhase)) {
    return saved as OnboardingPhase;
  }
  // Legacy mapping: old welcome slides → new AI personality phases
  if (saved === 'welcome-1') return 'ai-name';
  if (saved === 'welcome-2') return 'ai-tone';
  // Migration: if user completed both old onboarding + old tutorial, mark as complete
  const legacyOnboarding = localStorage.getItem('secondmind_onboarding_done');
  const legacyTutorial = localStorage.getItem('secondmind_tutorial_step');
  if (legacyOnboarding === 'true' && legacyTutorial === 'completed') {
    return 'complete';
  }
  // New user — start from the beginning
  return 'ai-name';
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [currentPhase, setCurrentPhase] = useState<OnboardingPhase>(resolveInitialPhase);
  const [actionCompleted, setActionCompleted] = useState(false);
  const pendingActionRef = useRef<string | null>(null);

  const config = TOUR_PHASE_CONFIGS[currentPhase];
  const pendingAction = config?.actionKey ?? null;
  pendingActionRef.current = pendingAction;

  // Reset actionCompleted when phase changes
  useEffect(() => {
    setActionCompleted(false);
  }, [currentPhase]);

  // Persist phase to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, currentPhase);
  }, [currentPhase]);

  // Handle legacy trigger key (from old Settings restart flow)
  useEffect(() => {
    const trigger = localStorage.getItem('secondmind_trigger_tutorial');
    if (trigger === 'true') {
      localStorage.removeItem('secondmind_trigger_tutorial');
      setCurrentPhase('ai-name');
    }
  }, []);

  const advancePhase = useCallback(() => {
    setCurrentPhase(prev => {
      const idx = PHASE_ORDER.indexOf(prev);
      if (idx < PHASE_ORDER.length - 1) return PHASE_ORDER[idx + 1];
      return 'complete';
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    setCurrentPhase('complete');
    localStorage.setItem(STORAGE_KEY, 'complete');
    // Keep legacy keys in sync
    localStorage.setItem('secondmind_onboarding_done', 'true');
    localStorage.setItem('secondmind_tour_seen', 'true');
  }, []);

  const skipOnboarding = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('secondmind_onboarding_done');
    localStorage.removeItem('secondmind_welcomed');
    localStorage.removeItem('secondmind_tutorial_step');
    localStorage.removeItem('secondmind_tutorial_collection_id');
    localStorage.removeItem('secondmind_tour_seen');
    setCurrentPhase('ai-name');
  }, []);

  const reportTutorialAction = useCallback((actionKey: string) => {
    if (pendingActionRef.current === actionKey) {
      setActionCompleted(true);
      setTimeout(() => {
        advancePhase();
      }, 1200);
    }
  }, [advancePhase]);

  const isOnboardingActive = currentPhase !== 'complete';

  const value: TutorialContextType = {
    currentPhase,
    isOnboardingActive,
    advancePhase,
    completeOnboarding,
    skipOnboarding,
    resetOnboarding,
    reportTutorialAction,
    pendingAction,
    actionCompleted,
    // Legacy aliases
    currentStep: currentPhase,
    isActive: isOnboardingActive,
    advanceStep: advancePhase,
    completeTutorial: completeOnboarding,
    skipTutorial: skipOnboarding,
    restartTutorial: resetOnboarding,
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) throw new Error('useTutorial must be used within TutorialProvider');
  return context;
}

/** Returns true when the user has fully completed the unified onboarding flow. */
export function isOnboardingFlowComplete(): boolean {
  const phase = localStorage.getItem(STORAGE_KEY);
  if (phase === 'complete') return true;
  // Legacy fallback
  return (
    localStorage.getItem('secondmind_onboarding_done') === 'true' &&
    localStorage.getItem('secondmind_tutorial_step') === 'completed'
  );
}

// Legacy exports
export function isTutorialCompleted(): boolean {
  return isOnboardingFlowComplete();
}

export function resetTutorial(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('secondmind_onboarding_done');
  localStorage.removeItem('secondmind_welcomed');
  localStorage.removeItem('secondmind_tutorial_step');
  localStorage.removeItem('secondmind_tutorial_collection_id');
  localStorage.removeItem('secondmind_tour_seen');
}
