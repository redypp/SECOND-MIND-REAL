import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { z } from 'zod';
import splashLogo from '@/assets/splash-logo.png';

/* ── Validation ───────────────────────────────────────────────────────── */
const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phoneNumber: z.string().trim().regex(/^\+?[0-9\s\-().]{7,20}$/, 'Invalid phone number').optional().or(z.literal('')),
});

const signInSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/* ── Field ────────────────────────────────────────────────────────────── */
function Field({
  label, type = 'text', value, onChange, error, right,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          type={type}
          placeholder={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-4 py-3.5 rounded-2xl text-sm bg-white/[0.06] border ${
            error ? 'border-red-500/60' : 'border-white/10'
          } text-foreground placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors ${
            right ? 'pr-12' : ''
          }`}
        />
        {right && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{right}</div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs px-1">{error}</p>}
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────── */
export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logoReady, setLogoReady] = useState(false);

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  // Trigger logo animation after a short delay so it feels intentional
  useEffect(() => {
    const t = setTimeout(() => setLogoReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const result = signUpSchema.safeParse({ fullName, email, password, phoneNumber });
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => {
            if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
          });
          setErrors(fieldErrors);
          setIsLoading(false);
          return;
        }
        const { error, session } = await signUp(email, password, fullName, phoneNumber || undefined);
        if (error) {
          showErrorPopup(error.message);
        } else if (session) {
          navigate('/onboarding');
        } else {
          showErrorPopup('Account created! Check your email to confirm your address, then sign in.');
        }
      } else {
        const result = signInSchema.safeParse({ email, password });
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => {
            if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
          });
          setErrors(fieldErrors);
          setIsLoading(false);
          return;
        }
        const { error } = await signIn(email, password);
        if (error) {
          const msg = error.message?.toLowerCase() || '';
          if (msg.includes('invalid') && msg.includes('credentials')) {
            showErrorPopup('Invalid login credentials. If you signed up with Google or Apple, please use that option instead.');
          } else {
            showErrorPopup(error.message);
          }
        }
      }
    } catch {
      showErrorPopup('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setErrors({});
  };

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden safe-area-top-ios">

      {/* ── Hero ── */}
      <div className="flex-1 flex flex-col items-center justify-center pt-16 pb-8 px-6">

        {/* Glow behind logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.2 }}
          animate={logoReady ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-8"
        >
          {/* Outer pulse ring — fires once then fades */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={logoReady ? { opacity: [0, 0.35, 0], scale: [0.6, 1.6, 2] } : {}}
            transition={{ delay: 0.5, duration: 1.4, ease: 'easeOut' }}
            className="absolute inset-0 rounded-full bg-foreground/20 pointer-events-none"
          />
          {/* Inner pulse ring */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={logoReady ? { opacity: [0, 0.2, 0], scale: [0.7, 1.3, 1.5] } : {}}
            transition={{ delay: 0.6, duration: 1.1, ease: 'easeOut' }}
            className="absolute inset-0 rounded-full bg-foreground/20 pointer-events-none"
          />

          {/* Logo */}
          <motion.img
            src={splashLogo}
            alt="Second Mind"
            initial={{ opacity: 0, scale: 0.4, filter: 'blur(12px)' }}
            animate={logoReady ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : {}}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="w-24 h-24 rounded-full relative z-10"
          />
        </motion.div>

        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={logoReady ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.55, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold tracking-widest text-foreground uppercase">
            Second Mind
          </h1>
          <p className="text-white/40 text-xs tracking-wider mt-1 uppercase">
            A digital extension of your brain
          </p>
        </motion.div>
      </div>

      {/* ── Form panel ── */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={logoReady ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.7, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="px-5 pb-10 space-y-4"
      >
        {/* Tab switch */}
        <div className="flex items-center justify-center gap-6 mb-2">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`text-sm font-semibold pb-1 border-b-2 transition-all ${
                mode === m
                  ? 'text-foreground border-foreground'
                  : 'text-white/30 border-transparent hover:text-white/60'
              }`}
            >
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <AnimatePresence initial={false}>
            {mode === 'signup' && (
              <motion.div
                key="signup-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="space-y-3 overflow-hidden"
              >
                <Field
                  label="Full name"
                  value={fullName}
                  onChange={setFullName}
                  error={errors.fullName}
                />
                <Field
                  label="Phone number (optional)"
                  type="tel"
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  error={errors.phoneNumber}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <Field
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            error={errors.email}
          />

          <Field
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            error={errors.password}
            right={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-white/30 hover:text-white/70 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-4 mt-2 rounded-2xl bg-foreground text-background text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
