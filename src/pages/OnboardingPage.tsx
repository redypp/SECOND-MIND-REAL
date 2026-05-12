import { useState, useEffect, useRef, useCallback } from 'react';

import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Calendar, MapPin, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { z } from 'zod';

const AGE_MIN = 13;
const AGE_MAX = 100;
const DEFAULT_AGE = 25;

// Approximates a birthday from an age. We don't ask for an exact date — Jan 1
// of the inferred birth year is a stable, reproducible stand-in that's close
// enough for the features that key off birthday (age math, milestone hints).
const ageToBirthday = (age: number): string => {
  const year = new Date().getFullYear() - age;
  return `${year}-01-01`;
};

const birthdayToAge = (birthday: string): number => {
  const yyyy = parseInt(birthday.slice(0, 4), 10);
  if (Number.isNaN(yyyy)) return DEFAULT_AGE;
  const age = new Date().getFullYear() - yyyy;
  return Math.min(Math.max(age, AGE_MIN), AGE_MAX);
};

const onboardingSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  birthday: z.string().min(1, 'Birthday is required'),
  location: z.string().trim().min(2, 'Please enter a city or location').max(100, 'Location is too long'),
});

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState<number>(DEFAULT_AGE);
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();

  // Pre-fill with existing data if available
  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
    if (profile?.birthday) setAge(birthdayToAge(profile.birthday));
    if (profile?.location) setLocation(profile.location);
  }, [profile]);

  const birthday = ageToBirthday(age);

  const handleNext = () => {
    if (step === 1) {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setErrors({ fullName: 'Please enter your full name (at least 2 characters)' });
        return;
      }
      setErrors({});
      setStep(2);
    } else if (step === 2) {
      // Age is always defined (slider has a default); no validation needed.
      setErrors({});
      setStep(3);
    }
  };

  const handleComplete = async () => {
    setErrors({});

    const result = onboardingSchema.safeParse({ fullName, birthday, location });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await updateProfile({
        full_name: fullName.trim(),
        birthday,
        location: location.trim(),
      });

      if (error) {
        showErrorPopup(error.message);
      } else {
        navigate('/');
      }
    } catch (err) {
      showErrorPopup('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getFirstName = () => {
    return fullName.split(' ')[0] || 'there';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12 safe-area-top-ios">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 w-12 rounded-full transition-colors ${
              s <= step ? 'bg-primary' : 'bg-secondary'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-sm text-center"
          >
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <User className="w-8 h-8 text-primary" />
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">
              What's your name?
            </h1>
            <p className="text-muted-foreground text-[15px] mb-8">
              We'll personalize your Second Mind experience
            </p>

            <div className="space-y-4">
              <div>
                <Input
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                  className="text-center text-lg"
                  autoFocus
                />
                {errors.fullName && (
                  <p className="text-destructive text-sm mt-2">{errors.fullName}</p>
                )}
              </div>

              <Button
                onClick={handleNext}
                disabled={!fullName.trim()}
                className="w-full bg-primary hover:bg-primary/90"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-sm text-center"
          >
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-8 h-8 text-primary" />
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">
              How old are you, {getFirstName()}?
            </h1>
            <p className="text-muted-foreground text-[15px] mb-8">
              Drag the bar — close enough is fine.
            </p>

            <div className="space-y-8">
              <AgeBar age={age} onChange={setAge} min={AGE_MIN} max={AGE_MAX} />

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-sm text-center"
          >
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <MapPin className="w-8 h-8 text-primary" />
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">
              Where are you based?
            </h1>
            <p className="text-muted-foreground text-[15px] mb-8">
              Second Mind uses your location to surface relevant events, news, and opportunities near you
            </p>

            <div className="space-y-4">
              <div>
                <Input
                  type="text"
                  placeholder="City, State or Country"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && location.trim().length >= 2 && handleComplete()}
                  className="text-center text-lg"
                  autoFocus
                />
                {errors.location && (
                  <p className="text-destructive text-sm mt-2">{errors.location}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleComplete}
                  disabled={!location.trim() || isLoading}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <>
                      Let's go
                      <Sparkles className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative element */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="absolute bottom-8 left-0 right-0 text-center"
      >
        <span className="text-xs text-muted-foreground/50">Second Mind</span>
      </motion.div>
    </div>
  );
}

/* ───────────────────────── AgeBar ───────────────────────── */

interface AgeBarProps {
  age: number;
  onChange: (age: number) => void;
  min: number;
  max: number;
}

/**
 * AgeBar — a custom horizontal age picker. Big animated number above a
 * gradient-filled track with decade tick marks. The bar is draggable
 * from any point: tap-to-jump, drag-to-scrub. Designed to match the
 * profile/portal aesthetic instead of looking like a stock UI slider.
 */
function AgeBar({ age, onChange, min, max }: AgeBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  const valueFromClientX = useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el) return age;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(min + ratio * (max - min));
  }, [age, min, max]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onChange(valueFromClientX(e.clientX));
  }, [onChange, valueFromClientX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    onChange(valueFromClientX(e.clientX));
  }, [onChange, valueFromClientX]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(min, age - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(max, age + 1)); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(min); }
    else if (e.key === 'End') { e.preventDefault(); onChange(max); }
  }, [age, min, max, onChange]);

  const fillPct = ((age - min) / (max - min)) * 100;

  // Decade tick marks (every 10) — visually structures the bar
  const ticks: number[] = [];
  const firstDecade = Math.ceil(min / 10) * 10;
  for (let v = firstDecade; v <= max; v += 10) ticks.push(v);

  return (
    <div className="select-none">
      {/* Big animated number readout */}
      <div className="flex items-end justify-center gap-2 mb-6">
        <motion.span
          key={age}
          initial={{ scale: 0.95, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="text-7xl font-bold tabular-nums leading-none tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.045em' }}
        >
          {age}
        </motion.span>
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2">
          {age === 1 ? 'year' : 'years'}
        </span>
      </div>

      {/* The bar itself */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={age}
        aria-label="Age"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className="relative h-12 rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 touch-none"
        style={{
          background: 'hsl(var(--secondary) / 0.6)',
          border: '1px solid hsl(var(--border) / 0.6)',
          boxShadow: 'inset 0 1px 0 hsl(0 0% 100% / 0.04), inset 0 -1px 0 hsl(0 0% 0% / 0.2)',
        }}
      >
        {/* Filled portion — gradient that follows the handle */}
        <div
          className="absolute top-0 bottom-0 left-0 rounded-full pointer-events-none"
          style={{
            width: `${fillPct}%`,
            background:
              'linear-gradient(90deg, hsl(var(--primary) / 0.85) 0%, hsl(var(--primary)) 100%)',
            boxShadow: '0 0 24px hsl(var(--primary) / 0.35)',
            transition: isDraggingRef.current ? 'none' : 'width 0.12s ease-out',
          }}
        />

        {/* Decade ticks — drawn over both filled and unfilled portions */}
        <div className="absolute inset-0 flex items-center pointer-events-none">
          {ticks.map((v) => {
            const left = ((v - min) / (max - min)) * 100;
            const isPast = v <= age;
            return (
              <div
                key={v}
                className="absolute flex flex-col items-center"
                style={{ left: `calc(${left}% )`, transform: 'translateX(-50%)' }}
              >
                <div
                  className="w-px h-3"
                  style={{
                    background: isPast ? 'hsl(var(--primary-foreground) / 0.5)' : 'hsl(var(--foreground) / 0.2)',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Handle */}
        <div
          className="absolute top-1/2 pointer-events-none"
          style={{
            left: `${fillPct}%`,
            transform: 'translate(-50%, -50%)',
            transition: isDraggingRef.current ? 'none' : 'left 0.12s ease-out',
          }}
        >
          <div
            className="w-9 h-9 rounded-full bg-background border-2 border-primary flex items-center justify-center"
            style={{
              boxShadow:
                '0 8px 18px -6px hsl(var(--primary) / 0.55), 0 2px 6px -2px hsl(0 0% 0% / 0.3), inset 0 1px 0 hsl(0 0% 100% / 0.12)',
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full bg-primary"
              style={{ boxShadow: '0 0 8px hsl(var(--primary))' }}
            />
          </div>
        </div>
      </div>

      {/* Decade labels under the bar */}
      <div className="relative h-5 mt-2">
        {ticks.map((v) => {
          const left = ((v - min) / (max - min)) * 100;
          return (
            <span
              key={v}
              className="absolute text-[10px] uppercase tracking-[0.18em] font-semibold tabular-nums text-muted-foreground/55"
              style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
            >
              {v}
            </span>
          );
        })}
      </div>
    </div>
  );
}
