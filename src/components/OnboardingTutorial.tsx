/**
 * OnboardingTutorial — Unified onboarding flow
 *
 *  1. AI setup phases (ai-name, ai-tone, ai-focus) — personality configuration
 *  2. Tour phases     (tour-*) — app is live underneath; spotlight + bottom bar
 *  3. Complete phase  — brief completion screen, then hides itself
 *
 * Overlay fix: once the user taps the spotlighted button, the dim panels are
 * removed immediately so any form/sheet that opens is fully interactive.
 * A thin strip stays at the bottom so the user knows what to do next.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2, X } from 'lucide-react';
import {
  useTutorial,
  TOUR_PHASE_CONFIGS,
  OnboardingPhase,
} from '@/contexts/TutorialContext';
import { AIPersonalitySetup } from '@/components/AIPersonalitySetup';

// ─── Legacy export so any stale App.tsx import keeps compiling ───────────────
export { isOnboardingFlowComplete as isOnboardingComplete } from '@/contexts/TutorialContext';

// ─── Spotlight geometry ──────────────────────────────────────────────────────

const SPOTLIGHT_PADDING = 10;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function OnboardingTutorial() {
  const {
    currentPhase,
    isOnboardingActive,
    advancePhase,
    completeOnboarding,
    skipOnboarding,
    actionCompleted,
  } = useTutorial();

  const navigate = useNavigate();
  const location = useLocation();

  // Track transition to "complete" so we can show the completion screen
  // briefly without showing it on reload (when user was already complete).
  const [justCompleted, setJustCompleted] = useState(false);
  const prevPhaseRef = useRef<OnboardingPhase>(currentPhase);

  // Spotlight state
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [spotlightVisible, setSpotlightVisible] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Track whether the user has already tapped the spotlighted button so we
  // can remove the blocking overlay and let them interact with the form/sheet.
  const [targetClicked, setTargetClicked] = useState(false);
  const listenerAttachedRef = useRef(false);

  // ── Detect "just completed" ───────────────────────────────────────────────
  useEffect(() => {
    if (prevPhaseRef.current !== 'complete' && currentPhase === 'complete') {
      setJustCompleted(true);
    }
    prevPhaseRef.current = currentPhase;
  }, [currentPhase]);

  useEffect(() => {
    if (!justCompleted) return;
    const t = setTimeout(() => setJustCompleted(false), 3000);
    return () => clearTimeout(t);
  }, [justCompleted]);

  // ── Navigate to the correct page when a tour phase starts ─────────────────
  useEffect(() => {
    const config = TOUR_PHASE_CONFIGS[currentPhase];
    if (config) {
      // '__space__' is a sentinel meaning "go to the tutorial archive"
      let route = config.route;
      if (route === '__space__') {
        const spaceId = localStorage.getItem('secondmind_tutorial_space_id');
        route = spaceId ? `/space/${spaceId}` : '/archive';
      }
      navigate(route);
      // Reset per-phase state
      setSpotlightVisible(false);
      setTargetRect(null);
      setTargetClicked(false);
      listenerAttachedRef.current = false;
    }
  }, [currentPhase, navigate]);

  // ── Poll for spotlight target & attach one-shot click listener ───────────
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const config = TOUR_PHASE_CONFIGS[currentPhase];
    if (!config?.targetSelector) return; // view-only or no-spotlight steps

    const updateRect = () => {
      const el = document.querySelector(config.targetSelector!);
      if (!el) { setTargetRect(null); return; }

      // Attach click listener only for action steps (not view-only).
      // For view-only steps there's no form to complete — tapping the
      // spotlighted element should not swap the "Next" bar away.
      if (!listenerAttachedRef.current && config.actionKey) {
        el.addEventListener('click', () => setTargetClicked(true), { once: true });
        listenerAttachedRef.current = true;
      }

      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { setTargetRect(null); return; }
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const showTimer = setTimeout(() => {
      updateRect();
      setSpotlightVisible(true);
    }, 500);

    pollRef.current = setInterval(updateRect, 200);

    return () => {
      clearTimeout(showTimer);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [currentPhase]);

  // ── Route guard ───────────────────────────────────────────────────────────
  const isAuthRoute =
    location.pathname === '/auth' || location.pathname === '/onboarding';
  if (isAuthRoute) return null;

  const isTourPhase = currentPhase.startsWith('tour-');
  const isAISetupPhase = currentPhase.startsWith('ai-');
  const isComplete = currentPhase === 'complete';

  if (isComplete && !justCompleted) return null;
  if (!isOnboardingActive && !justCompleted) return null;

  // ── Completion screen ─────────────────────────────────────────────────────
  if (isComplete && justCompleted) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="text-center max-w-sm"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className="mx-auto w-16 h-16 rounded-full bg-foreground/10 flex items-center justify-center mb-6"
          >
            <CheckCircle2 className="w-8 h-8 text-foreground" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-2xl font-light text-foreground mb-3"
          >
            You're all set.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-sm text-muted-foreground"
          >
            Your second mind is ready.
          </motion.p>
        </motion.div>
      </div>
    );
  }

  // ── AI personality setup (replaces old welcome slides) ────────────────────
  if (isAISetupPhase) {
    return <AIPersonalitySetup phase={currentPhase} />;
  }

  // ── Tour phases ───────────────────────────────────────────────────────────
  if (isTourPhase) {
    const config = TOUR_PHASE_CONFIGS[currentPhase];
    if (!config) return null;

    const isViewStep = !config.actionKey; // view-only steps use a "Next" button

    // Spotlight geometry (only when: has selector, target found, not yet clicked)
    const showSpotlight =
      spotlightVisible &&
      !!config.targetSelector &&
      !!targetRect &&
      !targetClicked &&
      !actionCompleted;

    const cutout = targetRect
      ? {
          top: targetRect.top - SPOTLIGHT_PADDING,
          left: targetRect.left - SPOTLIGHT_PADDING,
          width: targetRect.width + SPOTLIGHT_PADDING * 2,
          height: targetRect.height + SPOTLIGHT_PADDING * 2,
        }
      : null;

    const cutoutBottom = cutout ? cutout.top + cutout.height : 0;
    const cutoutRight = cutout ? cutout.left + cutout.width : 0;

    return (
      <>
        {/* ── Spotlight overlay — removed the instant the target is tapped ── */}
        <AnimatePresence>
          {showSpotlight && cutout && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[99998]"
              style={{ pointerEvents: 'none' }}
            >
              {/* Top */}
              <div
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: Math.max(0, cutout.top),
                  background: 'rgba(0,0,0,0.55)',
                  pointerEvents: 'auto',
                }}
              />
              {/* Bottom — leave clear space for the bottom bar */}
              <div
                style={{
                  position: 'absolute', top: cutoutBottom, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.55)',
                  pointerEvents: 'auto',
                }}
              />
              {/* Left */}
              <div
                style={{
                  position: 'absolute', top: cutout.top, left: 0,
                  width: Math.max(0, cutout.left),
                  height: cutout.height,
                  background: 'rgba(0,0,0,0.55)',
                  pointerEvents: 'auto',
                }}
              />
              {/* Right */}
              <div
                style={{
                  position: 'absolute', top: cutout.top, left: cutoutRight, right: 0,
                  height: cutout.height,
                  background: 'rgba(0,0,0,0.55)',
                  pointerEvents: 'auto',
                }}
              />
              {/* Ring */}
              <div
                style={{
                  position: 'absolute',
                  top: cutout.top - 2,
                  left: cutout.left - 2,
                  width: cutout.width + 4,
                  height: cutout.height + 4,
                  borderRadius: 14,
                  border: '2px solid rgba(255,255,255,0.4)',
                  pointerEvents: 'none',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bottom instruction bar ─────────────────────────────────────── */}
        {/*
          Three states:
          (a) actionCompleted  → success flash
          (b) targetClicked && !actionCompleted → thin strip "complete the form…"
          (c) normal → full bar with progress + instruction / Next button
        */}
        <AnimatePresence mode="wait">
          {actionCompleted ? (
            /* (a) Success */
            <motion.div
              key="success"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-[100000] bg-card border-t border-border/50 shadow-2xl"
              style={{ paddingBottom: 'max(var(--app-safe-bottom), 20px)' }}
            >
              <div className="px-5 pt-4 pb-1 flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, delay: 0.05 }}
                >
                  <CheckCircle2 className="w-5 h-5 text-foreground shrink-0" />
                </motion.div>
                <div>
                  <p className="text-sm font-medium text-foreground">Nice work!</p>
                  <p className="text-sm text-muted-foreground">Moving to the next section…</p>
                </div>
              </div>
            </motion.div>

          ) : targetClicked ? (
            /* (b) Target tapped — a modal/form is now open; hide entirely so
               nothing covers the user's input area. The action will fire
               reportTutorialAction when the form is completed. */
            null

          ) : (
            /* (c) Normal — full bar */
            <motion.div
              key="normal"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200, delay: 0.15 }}
              className="fixed bottom-0 left-0 right-0 z-[100000] bg-card border-t border-border/50 shadow-2xl"
              style={{ paddingBottom: 'max(var(--app-safe-bottom), 20px)' }}
            >
              <div className="px-5 pt-4 pb-1">
                {/* Step progress + dismiss */}
                <div className="flex items-center gap-1.5 mb-4">
                  {Array.from({ length: config.totalSteps }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-[3px] rounded-full flex-1 transition-all duration-500 ${
                        i < config.stepNumber ? 'bg-foreground' : 'bg-border'
                      }`}
                    />
                  ))}
                  <span className="text-[13px] text-muted-foreground shrink-0 ml-1">
                    {config.stepNumber}/{config.totalSteps}
                  </span>
                  <button
                    onClick={skipOnboarding}
                    className="ml-2 shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors touch-manipulation"
                    aria-label="Skip tutorial"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentPhase}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    <h3 className="text-[15px] font-semibold text-foreground leading-tight">
                      {config.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                      {config.description}
                    </p>

                    {isViewStep ? (
                      /* View step — manual Next button */
                      <button
                        onClick={advancePhase}
                        className="mt-3 w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-medium
                                   flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                      >
                        Next
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      /* Action step — instruction pill */
                      <div className="mt-2.5 flex items-center gap-1.5 text-sm text-foreground/60 bg-foreground/5 rounded-lg px-3 py-2">
                        <ArrowRight className="w-3 h-3 shrink-0" />
                        <span>{config.instruction}</span>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return null;
}
