import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTutorial, TUTORIAL_STEP_CONFIGS, TutorialStep } from '@/contexts/TutorialContext';
import { useAuth } from '@/contexts/AuthContext';

export function InteractiveTutorial() {
  const { currentStep, isActive, advanceStep, completeTutorial, actionCompleted } = useTutorial();
  const { user } = useAuth();

  if (!isActive || !user) return null;

  const config = TUTORIAL_STEP_CONFIGS[currentStep];

  return (
    <AnimatePresence mode="wait">
      {currentStep === 'welcome-1' && <WelcomeStep onContinue={advanceStep} />}
      {currentStep === 'complete' && <FinishStep onComplete={completeTutorial} />}
      {config && 'targetSelector' in config && (
        <SpotlightStep
          key={currentStep}
          stepId={currentStep}
          config={config}
          actionCompleted={actionCompleted}
          onExit={completeTutorial}
        />
      )}
    </AnimatePresence>
  );
}

// ── Spotlight Step — navigates to route, waits for element, requires action completion ──
function SpotlightStep({
  stepId,
  config,
  actionCompleted,
  onExit,
}: {
  stepId: TutorialStep;
  config: typeof TUTORIAL_STEP_CONFIGS[string];
  actionCompleted: boolean;
  onExit: () => void;
}) {
  const navigate = useNavigate();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    if (config.route) {
      navigate(config.route, { replace: true });
    }
  }, [config.route, navigate]);

  useEffect(() => {
    const startTime = Date.now();
    const poll = () => {
      const el = document.querySelector(config.targetSelector!);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setTargetRect(rect);
          setReady(true);
          return;
        }
      }
      if (Date.now() - startTime > 8000) {
        // Element not found — skip gracefully
        return;
      }
    };

    const delay = setTimeout(() => {
      poll();
      pollRef.current = setInterval(poll, 200);
    }, 600);

    return () => {
      clearTimeout(delay);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [config.targetSelector]);

  // Keep tracking element position
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      const el = document.querySelector(config.targetSelector!);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setTargetRect(rect);
        }
      }
    }, 300);
    return () => clearInterval(interval);
  }, [ready, config.targetSelector]);

  if (!ready || !targetRect) {
    return (
      <motion.div
        key="transit"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99] pointer-events-none"
      />
    );
  }

  const PADDING = 10;
  const cutout = {
    top: targetRect.top - PADDING,
    left: targetRect.left - PADDING,
    width: targetRect.width + PADDING * 2,
    height: targetRect.height + PADDING * 2,
  };
  const cutoutBottom = cutout.top + cutout.height;
  const cutoutRight = cutout.left + cutout.width;
  const spaceBelow = window.innerHeight - cutoutBottom;
  const isTop = spaceBelow < 160;
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 10000,
    maxWidth: 300,
    ...(isTop
      ? {
          bottom: window.innerHeight - cutout.top + 16,
          left: Math.max(16, Math.min(cutout.left, window.innerWidth - 316)),
        }
      : {
          top: cutoutBottom + 16,
          left: Math.max(16, Math.min(cutout.left, window.innerWidth - 316)),
        }),
  };

  return (
    <motion.div
      key={stepId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[9998]"
      style={{ pointerEvents: 'none' }}
    >
      {/* Overlay: 4 regions around the cutout — block interaction outside */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.max(0, cutout.top), background: 'rgba(0,0,0,0.6)', pointerEvents: 'auto' }} />
      <div style={{ position: 'absolute', top: cutoutBottom, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', pointerEvents: 'auto' }} />
      <div style={{ position: 'absolute', top: cutout.top, left: 0, width: Math.max(0, cutout.left), height: cutout.height, background: 'rgba(0,0,0,0.6)', pointerEvents: 'auto' }} />
      <div style={{ position: 'absolute', top: cutout.top, left: cutoutRight, right: 0, height: cutout.height, background: 'rgba(0,0,0,0.6)', pointerEvents: 'auto' }} />

      {/* Cutout area — allow pointer events through so user can interact */}
      <div
        style={{
          position: 'absolute',
          top: cutout.top,
          left: cutout.left,
          width: cutout.width,
          height: cutout.height,
          pointerEvents: 'none', // pass through to elements below
        }}
      />

      {/* Spotlight ring with pulse animation */}
      <motion.div
        animate={actionCompleted ? { borderColor: 'rgba(34,197,94,0.6)' } : {
          boxShadow: [
            '0 0 0 0 rgba(255,255,255,0.15)',
            '0 0 0 8px rgba(255,255,255,0)',
          ],
        }}
        transition={actionCompleted ? { duration: 0.3 } : {
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeOut',
        }}
        style={{
          position: 'absolute',
          top: cutout.top - 2,
          left: cutout.left - 2,
          width: cutout.width + 4,
          height: cutout.height + 4,
          borderRadius: 16,
          border: actionCompleted ? '2px solid rgba(34,197,94,0.6)' : '2px solid rgba(255,255,255,0.3)',
          pointerEvents: 'none',
        }}
      />

      {/* Tooltip */}
      <motion.div
        initial={{ opacity: 0, y: isTop ? 8 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.25 }}
        style={{ ...tooltipStyle, pointerEvents: 'auto' }}
      >
        <div className="bg-card border border-border rounded-2xl shadow-lg p-4 relative">
          <button
            onClick={onExit}
            className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-full"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
            Step {config.stepNumber} of {config.totalSteps}
          </span>
          <h3 className="text-sm font-semibold text-foreground mt-1 mb-1">{config.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">{config.description}</p>
          
          <AnimatePresence mode="wait">
            {actionCompleted ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 py-2 text-green-600"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">Done — moving on</span>
              </motion.div>
            ) : (
              <motion.div
                key="instruction"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 py-2"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-primary shrink-0"
                />
                <span className="text-xs font-medium text-foreground">{config.instruction}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Welcome ───────────────────────────────────────────────────
function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || '';

  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center px-8"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 180 }}
        className="text-center max-w-sm"
      >
        <motion.h1
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-semibold text-foreground mb-6 tracking-tight"
        >
          {firstName ? `Welcome, ${firstName}` : 'Welcome'}
        </motion.h1>

        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground text-[15px] leading-[1.7] mb-4"
        >
          A calm, private space for everything in your life. Save anything and everything. Clear your mind. Your second mind grows with you, the more you use it the more it understands you.
        </motion.p>

        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-muted-foreground/70 text-xs leading-relaxed mb-12"
        >
          We will walk you through each feature. You will need to try each one before moving on.
        </motion.p>

        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <motion.button
            onClick={onContinue}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full h-14 text-base font-medium rounded-2xl bg-foreground text-background flex items-center justify-center gap-2 transition-colors"
          >
            Enter your Second Mind
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ── Finish ────────────────────────────────────────────────────
function FinishStep({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      key="finish"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center px-6"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="text-center max-w-sm"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.15 }}
          className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </motion.div>

        <h2 className="text-xl font-bold text-foreground mb-2">You're all set</h2>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          Your second mind is ready. Everything you save organizes itself.
        </p>

        <Button onClick={onComplete} className="w-full h-12 text-base font-medium rounded-xl">
          Start using the app
        </Button>
      </motion.div>
    </motion.div>
  );
}
