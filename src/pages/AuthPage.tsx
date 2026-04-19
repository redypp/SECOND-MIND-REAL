import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_AUTH_STORAGE_KEY } from '@/integrations/supabase/app-client';
import { z } from 'zod';
import splashLogo from '@/assets/splash-logo.png';

/**
 * Synchronous check for a valid cached session.
 * Runs before the component renders any UI so the login screen is never
 * drawn when the user is already signed in (e.g., iOS/Capacitor resume,
 * direct navigation to /auth, browser restoring the last URL). Without
 * this, AuthPage would render, the onAuthStateChange event would fire,
 * and the useEffect would navigate away — producing the login flash.
 */
function hasValidCachedSession(): boolean {
  try {
    const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return (
      typeof parsed?.user?.id === 'string' &&
      typeof parsed?.expires_at === 'number' &&
      parsed.expires_at * 1000 > Date.now()
    );
  } catch {
    return false;
  }
}

/* ── Validation ────────────────────────────────────────────────────── */
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

/* ── Input field ───────────────────────────────────────────────────── */
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
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: error ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.11)',
            color: '#fff',
          }}
          className={`w-full px-4 py-3.5 rounded-2xl text-base placeholder:text-white/30 focus:outline-none transition-colors ${right ? 'pr-12' : ''}`}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
          onBlur={e => (e.currentTarget.style.borderColor = error ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.11)')}
        />
        {right && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{right}</div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs px-1">{error}</p>}
    </div>
  );
}

/* ── OAuth button ──────────────────────────────────────────────────── */
function OAuthButton({
  onClick, loading, children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.11)',
        color: '#fff',
      }}
      className="flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-medium hover:bg-white/10 active:scale-[0.97] transition-all disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
}

/* ── Google SVG ────────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

/* ── Apple SVG ─────────────────────────────────────────────────────── */
function AppleIcon() {
  return (
    <svg width="16" height="19" viewBox="0 0 17 20" fill="white">
      <path d="M13.545 10.239c-.022-2.234 1.823-3.306 1.906-3.358-.037-.054-1.494-2.292-2.418-2.836-1.014-.58-2.063-.648-2.508-.66-.127-.013-.258-.02-.389-.02-1.007 0-1.947.375-2.586.375-.675 0-1.531-.355-2.409-.355h-.046C3.492 3.407 1.912 4.49 1.05 6.195c-1.773 3.41-.454 8.463 1.274 11.23.844 1.355 1.852 2.876 3.173 2.822.611-.026 1.045-.222 1.497-.222.418 0 .85.222 1.535.222h.048c1.342-.022 2.225-1.38 3.06-2.738.47-.755.832-1.525 1.072-2.142-1.458-.632-2.164-2.338-2.164-4.128zM11.147 2.574C11.856 1.72 12.305.577 12.18 0c-.96.046-2.123.68-2.812 1.534-.619.755-1.159 1.96-1.013 3.114 1.073.082 2.168-.578 2.792-2.074z"/>
    </svg>
  );
}

/* ── Main ──────────────────────────────────────────────────────────── */
export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logoReady, setLogoReady] = useState(false);
  const [logoSettled, setLogoSettled] = useState(false);

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  // Synchronous session check — cached once per render so we don't re-read
  // localStorage on every re-render. If a valid session is present at mount,
  // we'll redirect below (after all hooks have run, to respect the Rules of
  // Hooks).
  const [hasCachedSession] = useState(hasValidCachedSession);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const t = setTimeout(() => setLogoReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // After entrance animation finishes, switch to looping idle state
  useEffect(() => {
    if (!logoReady) return;
    const t = setTimeout(() => setLogoSettled(true), 1600);
    return () => clearTimeout(t);
  }, [logoReady]);

  // Redirect synchronously on first render if a session already exists —
  // prevents the login screen from flashing when the app opens with URL /auth
  // while a valid session is cached (iOS resume, browser restoring last URL,
  // or a ProtectedRoute race during cold start). Runs after all hooks so the
  // Rules of Hooks are respected.
  if (user || hasCachedSession) {
    return <Navigate to="/" replace />;
  }

  const handleOAuth = async (provider: 'google' | 'apple') => {
    const setProviderLoading = provider === 'google' ? setGoogleLoading : setAppleLoading;
    setProviderLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) showErrorPopup(error.message);
    } catch {
      showErrorPopup('OAuth sign-in failed. Please try again.');
    } finally {
      setProviderLoading(false);
    }
  };

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
    // Always dark — auth is a brand-first screen regardless of user theme
    <div
      className="min-h-screen flex flex-col overflow-hidden safe-area-top-ios"
      style={{ background: '#080808' }}
    >
      {/* ── Hero ── */}
      <div className="flex-1 flex flex-col items-center justify-center pt-16 pb-6 px-6">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.3 }}
          animate={logoReady ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-8"
        >
          {/* Entrance: outer pulse ring (fires once) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={logoReady ? { opacity: [0, 0.3, 0], scale: [0.5, 1.8, 2.2] } : {}}
            transition={{ delay: 0.45, duration: 1.5, ease: 'easeOut' }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          />
          {/* Entrance: inner pulse ring (fires once) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={logoReady ? { opacity: [0, 0.2, 0], scale: [0.6, 1.4, 1.7] } : {}}
            transition={{ delay: 0.55, duration: 1.1, ease: 'easeOut' }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          />
          {/* Idle: ambient glow that breathes forever after entrance */}
          <motion.div
            initial={{ opacity: 0, scale: 1 }}
            animate={logoSettled ? { opacity: [0, 0.18, 0], scale: [1, 1.45, 1] } : { opacity: 0 }}
            transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.6 }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ background: 'rgba(230,225,210,0.5)', filter: 'blur(12px)' }}
          />
          {/* Logo — entrance blur+scale, then slow breathe */}
          <motion.img
            src={splashLogo}
            alt="Second Mind"
            initial={{ opacity: 0, scale: 0.4, filter: 'blur(14px)' }}
            animate={
              logoSettled
                ? { opacity: 1, scale: [1, 1.04, 1], filter: 'blur(0px)' }
                : logoReady
                ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
                : {}
            }
            transition={
              logoSettled
                ? { scale: { duration: 4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.6 } }
                : { duration: 0.85, ease: [0.16, 1, 0.3, 1] }
            }
            className="w-24 h-24 rounded-full relative z-10"
          />
        </motion.div>

        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={logoReady ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold tracking-widest uppercase" style={{ color: '#fff' }}>
            Second Mind
          </h1>
          <p className="text-xs tracking-wider mt-1 uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>
            A digital extension of your brain
          </p>
        </motion.div>
      </div>

      {/* ── Form panel ── */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={logoReady ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.65, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="px-5 pb-12 space-y-4"
      >
        {/* OAuth buttons */}
        <div className="flex gap-3">
          <OAuthButton onClick={() => handleOAuth('google')} loading={googleLoading}>
            <GoogleIcon />
            <span>Google</span>
          </OAuthButton>
          <OAuthButton onClick={() => handleOAuth('apple')} loading={appleLoading}>
            <AppleIcon />
            <span>Apple</span>
          </OAuthButton>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>or</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </div>

        {/* Tab switch */}
        <div className="flex items-center justify-center gap-6">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className="text-sm font-semibold pb-1 border-b-2 transition-all"
              style={{
                color: mode === m ? '#fff' : 'rgba(255,255,255,0.3)',
                borderColor: mode === m ? '#fff' : 'transparent',
              }}
            >
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Fields */}
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
                <Field label="Full name" value={fullName} onChange={setFullName} error={errors.fullName} />
                <Field label="Phone number (optional)" type="tel" value={phoneNumber} onChange={setPhoneNumber} error={errors.phoneNumber} />
              </motion.div>
            )}
          </AnimatePresence>

          <Field label="Email address" type="email" value={email} onChange={setEmail} error={errors.email} />

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
                className="transition-colors"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-4 mt-1 rounded-2xl text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-50"
            style={{ background: '#fff', color: '#080808' }}
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
