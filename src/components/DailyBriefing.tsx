import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isTutorialCompleted } from '@/contexts/TutorialContext';

const BRIEFING_STORAGE_KEY = 'secondmind_daily_briefing_date';

interface FocusItem {
  icon: string;
  label: string;
}

interface BriefingData {
  greeting: string;
  focusItems: FocusItem[];
  insight: string;
  encouragement: string;
}

export function DailyBriefing() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!user) return;
    if (!isTutorialCompleted()) { setShow(false); return; }
    const lastShown = localStorage.getItem(BRIEFING_STORAGE_KEY);
    if (lastShown === today) { setShow(false); return; }
    setShow(true);
    fetchBriefing();
  }, [user, today]);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-briefing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );
      if (!response.ok) throw new Error('Failed to fetch briefing');
      setBriefing(await response.json());
    } catch (e) {
      console.error('Daily briefing error:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissing(true);
    localStorage.setItem(BRIEFING_STORAGE_KEY, today);
    // Don't hide yet — let the exit animation play
  }, [today]);

  if (!show || !user) return null;

  return (
    <AnimatePresence onExitComplete={() => setShow(false)}>
      {!dismissing && (
        <motion.div
          key="briefing-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ backgroundColor: '#FAFAFA' }}
        >
          {/* Close */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            onClick={handleDismiss}
            className="absolute top-4 right-4 safe-area-top-ios p-2 rounded-full transition-colors z-10"
            style={{ color: '#8E8E93' }}
            aria-label="Close briefing"
          >
            <X className="w-5 h-5" />
          </motion.button>

          <div className="flex-1 flex flex-col items-center justify-center px-8 max-w-md mx-auto w-full">
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState onRetry={fetchBriefing} onDismiss={handleDismiss} />
            ) : briefing ? (
              <BriefingContent briefing={briefing} onDismiss={handleDismiss} />
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LoadingState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
        className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-6"
        style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
      >
        <Sparkles className="w-5 h-5" style={{ color: '#8E8E93' }} />
      </motion.div>
      <p className="text-[13px]" style={{ color: '#8E8E93' }}>Preparing your day...</p>
    </motion.div>
  );
}

function ErrorState({ onRetry, onDismiss }: { onRetry: () => void; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center"
    >
      <p className="text-[13px] mb-4" style={{ color: '#8E8E93' }}>Couldn't load your briefing</p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={onRetry}
          className="px-4 py-2 text-[13px] font-medium rounded-xl transition-colors"
          style={{ color: '#1A1A1A' }}
        >
          Try again
        </button>
        <button
          onClick={onDismiss}
          className="px-4 py-2 text-[13px] font-medium rounded-xl transition-colors"
          style={{ color: '#8E8E93' }}
        >
          Skip
        </button>
      </div>
    </motion.div>
  );
}

function BriefingContent({ briefing, onDismiss }: { briefing: BriefingData; onDismiss: () => void }) {
  const [pressed, setPressed] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6 }}
        className="text-center mb-10"
      >
        <h1
          className="text-[28px] font-light tracking-tight leading-tight"
          style={{ color: '#1A1A1A' }}
        >
          {briefing.greeting}
        </h1>
      </motion.div>

      {/* Focus items — clean list */}
      {briefing.focusItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="mb-10"
        >
          <p
            className="text-[12px] font-medium uppercase tracking-[0.15em] mb-5 text-center"
            style={{ color: '#8E8E93' }}
          >
            Today's Focus
          </p>
          <div className="space-y-3">
            {briefing.focusItems.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 + i * 0.1, duration: 0.4 }}
                className="flex items-start gap-3 px-1"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full mt-[7px] shrink-0"
                  style={{ backgroundColor: '#1A1A1A', opacity: 0.25 }}
                />
                <span
                  className="text-[15px] leading-relaxed font-light"
                  style={{ color: '#1A1A1A' }}
                >
                  {item.label}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Insight */}
      {briefing.insight && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.5 }}
          className="text-center mb-12 px-2"
        >
          <p
            className="text-[14px] leading-relaxed font-light italic"
            style={{ color: '#8E8E93' }}
          >
            {briefing.insight}
          </p>
        </motion.div>
      )}

      {/* Start your day button */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.5 }}
        className="text-center"
      >
        <motion.button
          onClick={() => {
            setPressed(true);
            setTimeout(onDismiss, 100);
          }}
          whileTap={{ scale: 0.96 }}
          animate={pressed ? {
            scale: [1, 1.02, 0.98, 1],
            opacity: [1, 0.9, 0.7, 0],
          } : {}}
          transition={pressed ? {
            duration: 0.5,
            ease: [0.4, 0, 0.2, 1],
          } : {}}
          className="w-full py-4 rounded-2xl text-[15px] font-medium transition-colors"
          style={{
            backgroundColor: '#1A1A1A',
            color: '#FAFAFA',
          }}
        >
          Start your day
        </motion.button>

        {briefing.encouragement && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="text-[13px] mt-5 font-normal"
            style={{ color: '#8E8E93' }}
          >
            {briefing.encouragement}
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  );
}

/** Standalone modal version — can be opened manually from Settings */
export function DailyBriefingModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!isOpen) { setDismissing(false); return; }
    setBriefing(null);
    setLoading(true);
    setError(false);
    fetchData();
  }, [isOpen]);

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-briefing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );
      if (!response.ok) throw new Error('Failed');
      setBriefing(await response.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = useCallback(() => {
    setDismissing(true);
  }, []);

  if (!isOpen) return null;

  return (
    <AnimatePresence onExitComplete={onClose}>
      {!dismissing && (
        <motion.div
          key="briefing-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ backgroundColor: '#FAFAFA' }}
        >
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onClick={handleClose}
            className="absolute top-4 right-4 safe-area-top-ios p-2 rounded-full transition-colors z-10"
            style={{ color: '#8E8E93' }}
            aria-label="Close briefing"
          >
            <X className="w-5 h-5" />
          </motion.button>

          <div className="flex-1 flex flex-col items-center justify-center px-8 max-w-md mx-auto w-full">
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState onRetry={fetchData} onDismiss={handleClose} />
            ) : briefing ? (
              <BriefingContent briefing={briefing} onDismiss={handleClose} />
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
