import { useState } from 'react';

import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Calendar, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { z } from 'zod';

const onboardingSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  birthday: z.string().min(1, 'Birthday is required'),
});

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { profile, updateProfile, user } = useAuth();
  const navigate = useNavigate();

  // Pre-fill with existing data if available
  useState(() => {
    if (profile?.full_name) setFullName(profile.full_name);
    if (profile?.birthday) setBirthday(profile.birthday);
  });

  const handleNext = () => {
    if (step === 1) {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setErrors({ fullName: 'Please enter your full name (at least 2 characters)' });
        return;
      }
      setErrors({});
      setStep(2);
    }
  };

  const handleComplete = async () => {
    setErrors({});
    
    const result = onboardingSchema.safeParse({ fullName, birthday });
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
      });

      if (error) {
        showErrorPopup(error.message);
      } else {
        // Navigate to main app — the interactive tutorial will show if needed
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
        {[1, 2].map((s) => (
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
            <p className="text-muted-foreground text-sm mb-8">
              We'll personalize your Second Mind experience
            </p>

            <div className="space-y-4">
              <div>
                <Input
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="text-center text-lg"
                  autoFocus
                />
                {errors.fullName && (
                  <p className="text-destructive text-xs mt-2">{errors.fullName}</p>
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
              When's your birthday, {getFirstName()}?
            </h1>
            <p className="text-muted-foreground text-sm mb-8">
              We'll remember it and celebrate with you
            </p>

            <div className="space-y-4">
              <div>
                <Input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className="text-center text-lg"
                  max={new Date().toISOString().split('T')[0]}
                />
                {errors.birthday && (
                  <p className="text-destructive text-xs mt-2">{errors.birthday}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleComplete}
                  disabled={!birthday || isLoading}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <>
                      Complete
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
