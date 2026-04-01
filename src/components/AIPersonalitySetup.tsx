/**
 * AIPersonalitySetup — Onboarding screens for configuring AI personality.
 *
 * Replaces the old welcome slides. Three phases:
 *   ai-name  → Name your assistant
 *   ai-tone  → Pick a communication style
 *   ai-focus → Choose focus areas + verbosity
 *
 * State is local until the final screen, where everything is saved at once
 * via useAISettings().updateSettings().
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { useAISettings, AITone, AIVerbosity } from '@/contexts/AISettingsContext';
import { useTutorial, OnboardingPhase } from '@/contexts/TutorialContext';

// ─── Tone options ────────────────────────────────────────────────────────────

const TONE_OPTIONS: { value: AITone; label: string; description: string; example: string }[] = [
  {
    value: 'concise',
    label: 'Concise',
    description: 'Straight to the point, minimal fluff',
    example: '"You have 3 tasks due today. Start with the presentation."',
  },
  {
    value: 'friendly',
    label: 'Friendly',
    description: 'Warm and conversational, like a smart friend',
    example: '"Hey! Looks like you\'ve got a busy day — want to start with that presentation?"',
  },
  {
    value: 'professional',
    label: 'Professional',
    description: 'Structured and thorough, business-ready',
    example: '"Based on your schedule, I\'d recommend prioritizing the presentation deck first."',
  },
  {
    value: 'encouraging',
    label: 'Encouraging',
    description: 'Supportive and motivating, celebrates progress',
    example: '"You\'re on a roll! Three things on deck today — the presentation is a great place to start."',
  },
];

// ─── Focus area options ──────────────────────────────────────────────────────

const FOCUS_OPTIONS = [
  { value: 'productivity', label: 'Productivity' },
  { value: 'creativity', label: 'Creativity' },
  { value: 'reflection', label: 'Reflection' },
  { value: 'planning', label: 'Planning' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'learning', label: 'Learning' },
];

const VERBOSITY_OPTIONS: { value: AIVerbosity; label: string; hint: string }[] = [
  { value: 'brief', label: 'Brief', hint: 'Short and snappy' },
  { value: 'balanced', label: 'Balanced', hint: 'Just right' },
  { value: 'detailed', label: 'Detailed', hint: 'In-depth answers' },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  phase: OnboardingPhase;
}

export function AIPersonalitySetup({ phase }: Props) {
  const { updateSettings } = useAISettings();
  const { advancePhase } = useTutorial();

  // Local state — persisted on final screen
  const [name, setName] = useState('Second Mind');
  const [tone, setTone] = useState<AITone>('friendly');
  const [verbosity, setVerbosity] = useState<AIVerbosity>('balanced');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);

  const phaseIndex = phase === 'ai-name' ? 0 : phase === 'ai-tone' ? 1 : 2;

  const toggleFocus = (value: string) => {
    setFocusAreas(prev =>
      prev.includes(value)
        ? prev.filter(v => v !== value)
        : prev.length < 4
          ? [...prev, value]
          : prev
    );
  };

  const handleContinue = () => {
    if (phase === 'ai-focus') {
      // Save everything on the final screen
      updateSettings({
        assistantName: name.trim() || 'Second Mind',
        tone,
        verbosity,
        focusAreas,
      });
    }
    advancePhase();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 pt-safe pt-8 pb-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
              i === phaseIndex
                ? 'bg-foreground'
                : i < phaseIndex
                  ? 'bg-muted-foreground/40'
                  : 'bg-border'
            }`}
          />
        ))}
      </div>

      {/* Screen content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
            className="absolute inset-0 flex flex-col px-7 overflow-y-auto"
          >
            {phase === 'ai-name' && (
              <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                  className="w-14 h-14 rounded-2xl bg-foreground/5 flex items-center justify-center mb-6"
                >
                  <Sparkles className="w-6 h-6 text-foreground/60" />
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-2xl font-semibold text-foreground tracking-tight text-center mb-2"
                >
                  Name your assistant
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="text-sm text-muted-foreground text-center mb-8"
                >
                  Give your AI a name, or keep the default.
                </motion.p>
                <motion.input
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={30}
                  placeholder="Second Mind"
                  className="w-full text-center text-lg font-medium bg-muted/20 border border-border/30 rounded-2xl px-4 py-3.5 focus:outline-none focus:border-border/60 focus:bg-muted/30 transition-colors placeholder:text-muted-foreground/40"
                />
              </div>
            )}

            {phase === 'ai-tone' && (
              <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full py-8">
                <motion.h1
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-2xl font-semibold text-foreground tracking-tight text-center mb-2"
                >
                  How should I talk?
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-sm text-muted-foreground text-center mb-6"
                >
                  Pick a style. You can change this anytime.
                </motion.p>
                <div className="space-y-2.5">
                  {TONE_OPTIONS.map((opt, i) => (
                    <motion.button
                      key={opt.value}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.05 }}
                      onClick={() => setTone(opt.value)}
                      className={[
                        'w-full text-left rounded-2xl px-4 py-3.5 border transition-all active:scale-[0.985] touch-manipulation',
                        tone === opt.value
                          ? 'border-foreground/30 bg-foreground/5'
                          : 'border-border/20 bg-muted/15 hover:bg-muted/30',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[15px] font-medium text-foreground">{opt.label}</span>
                        {tone === opt.value && (
                          <Check className="w-4 h-4 text-foreground/60" strokeWidth={2.5} />
                        )}
                      </div>
                      <p className="text-[13px] text-muted-foreground/70 leading-snug mb-2">
                        {opt.description}
                      </p>
                      <p className="text-[12px] text-muted-foreground/50 italic leading-snug">
                        {opt.example}
                      </p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {phase === 'ai-focus' && (
              <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full py-8">
                <motion.h1
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-2xl font-semibold text-foreground tracking-tight text-center mb-2"
                >
                  What matters most?
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-sm text-muted-foreground text-center mb-6"
                >
                  Pick up to 4 areas to prioritize.
                </motion.p>

                {/* Focus pills */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="flex flex-wrap gap-2 justify-center mb-8"
                >
                  {FOCUS_OPTIONS.map(opt => {
                    const selected = focusAreas.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleFocus(opt.value)}
                        className={[
                          'px-4 py-2.5 rounded-full text-[14px] font-medium border transition-all active:scale-95 touch-manipulation',
                          selected
                            ? 'border-foreground/30 bg-foreground/8 text-foreground'
                            : 'border-border/25 bg-muted/15 text-muted-foreground/70 hover:bg-muted/30',
                        ].join(' ')}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </motion.div>

                {/* Verbosity */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  <p className="text-[13px] font-medium text-foreground/70 text-center mb-3">
                    Response length
                  </p>
                  <div className="flex gap-2">
                    {VERBOSITY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setVerbosity(opt.value)}
                        className={[
                          'flex-1 py-2.5 rounded-xl text-center border transition-all active:scale-95 touch-manipulation',
                          verbosity === opt.value
                            ? 'border-foreground/30 bg-foreground/5'
                            : 'border-border/20 bg-muted/15 hover:bg-muted/30',
                        ].join(' ')}
                      >
                        <span className="text-[14px] font-medium text-foreground block">{opt.label}</span>
                        <span className="text-[11px] text-muted-foreground/60">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CTA */}
      <div className="px-8 pb-10 pt-4">
        <button
          onClick={handleContinue}
          className="w-full py-3.5 rounded-xl bg-foreground text-background font-medium text-sm
                     transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {phase === 'ai-focus' ? 'Start exploring' : 'Continue'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
