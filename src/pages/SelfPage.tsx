import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Settings as SettingsIcon, Send, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSpaces } from '@/contexts/SpacesContext';
import { useIntelligentCapture } from '@/hooks/useIntelligentCapture';
import { useSelfRecommendations, Recommendation } from '@/hooks/useSelfRecommendations';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { PortalReturn } from '@/components/PortalReturn';

/**
 * SelfPage — clean personal hub.
 *
 * One ink color (with opacity-only variation), one font family (inherited
 * from the global stack), one weight (inherited from the 700 body baseline),
 * four sizes (from --text-hero / --text-title / --text-body / --text-label),
 * consistent gap spacing. No decorative cards, shadows, or gradients —
 * sections are separated by a single hairline rule.
 */
export default function SelfPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { spaces } = useSpaces();
  const { capture, isProcessing } = useIntelligentCapture();
  const { recommendations, isLoading: recsLoading, refresh } = useSelfRecommendations();

  const [captureText, setCaptureText] = useState('');
  const [lastResult, setLastResult] = useState<null | { where: string }>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const displayName = profile?.full_name?.trim() || user?.email?.split('@')[0] || 'You';
  const firstName = displayName.split(' ')[0];
  const archiveCount = spaces.length;
  const totalEntries = useMemo(
    () => spaces.reduce((acc, s) => acc + (s.itemCount ?? 0), 0),
    [spaces]
  );

  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, []);

  const handleCapture = useCallback(async () => {
    const text = captureText.trim();
    if (!text || isProcessing) return;
    const res = await capture(text);
    if (!res) {
      showErrorPopup("Couldn't save that just now. Try again in a moment.");
      return;
    }
    const targetSpace =
      spaces.find(s => res.result.suggested_space_id === s.id) ??
      spaces.find(s => s.name.toLowerCase() === res.result.suggested_space.toLowerCase());
    setLastResult({ where: targetSpace?.name ?? res.result.suggested_space ?? 'your archives' });
    setCaptureText('');
    autosize(textareaRef.current);
    setTimeout(() => setLastResult(null), 4500);
  }, [captureText, isProcessing, capture, spaces, autosize]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleCapture();
    }
  }, [handleCapture]);

  const openRecommendation = useCallback((rec: Recommendation) => {
    if (!rec.related_archive) return;
    const match = spaces.find(s => s.name.toLowerCase() === rec.related_archive.toLowerCase());
    if (match) navigate(`/space/${match.id}`);
  }, [spaces, navigate]);

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground safe-area-top-ios overflow-y-auto">
      {/* Header — pinned tight to the top of the safe area, no tall padding. */}
      <header className="sticky safe-sticky-top z-20 bg-background/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-1">
          <PortalReturn />
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              className="inline-flex items-center justify-center w-9 h-9"
            >
              <Bell className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/settings')}
              aria-label="Settings"
              className="inline-flex items-center justify-center w-9 h-9"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 flex flex-col gap-6 max-w-2xl w-full mx-auto">
        {/* Identity */}
        <section className="pt-3">
          <span className="uppercase tracking-[0.3em] opacity-70" style={{ fontSize: 'var(--text-label)' }}>
            {greeting()}
          </span>
          <h1
            className="uppercase leading-[0.88] mt-2"
            style={{ fontSize: 'var(--text-hero)', letterSpacing: '-0.04em' }}
          >
            {firstName}
          </h1>
          {(profile?.location || profile?.birthday || user?.created_at) && (
            <div
              className="flex flex-wrap gap-x-5 gap-y-1 mt-4 opacity-70"
              style={{ fontSize: 'var(--text-body)' }}
            >
              {profile?.location && <span>{profile.location}</span>}
              {profile?.birthday && <span>{formatBirthday(profile.birthday)}</span>}
              {user?.created_at && <span>Since {formatMonthYear(user.created_at)}</span>}
            </div>
          )}
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-4 pt-4 border-t border-foreground/15">
          <Stat label="Archives" value={archiveCount} />
          <Stat label="Entries" value={totalEntries} />
        </section>

        {/* Quick capture */}
        <section className="pt-4 border-t border-foreground/15">
          <div className="flex items-center justify-between mb-3">
            <span className="uppercase tracking-[0.3em] opacity-70" style={{ fontSize: 'var(--text-label)' }}>
              Quick capture
            </span>
            {isProcessing && (
              <span
                className="inline-flex items-center gap-1.5 uppercase tracking-[0.25em] opacity-70"
                style={{ fontSize: 'var(--text-label)' }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Routing
              </span>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={captureText}
            onChange={(e) => {
              setCaptureText(e.target.value);
              autosize(textareaRef.current);
            }}
            onKeyDown={handleKeyDown}
            placeholder={`What's on your mind, ${firstName}?`}
            rows={2}
            className="w-full bg-transparent resize-none focus:outline-none placeholder:opacity-50"
            style={{ fontSize: 'var(--text-body)' }}
          />

          <div className="mt-3 flex items-center justify-between">
            <span
              className="uppercase tracking-[0.25em] opacity-50"
              style={{ fontSize: 'var(--text-label)' }}
            >
              Tap send — I'll route it
            </span>
            <button
              onClick={handleCapture}
              disabled={!captureText.trim() || isProcessing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full uppercase tracking-[0.25em] bg-primary text-primary-foreground disabled:opacity-40"
              style={{ fontSize: 'var(--text-label)' }}
            >
              {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send
            </button>
          </div>

          <AnimatePresence>
            {lastResult && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="mt-3 inline-flex items-center gap-2"
                style={{ fontSize: 'var(--text-label)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved to <span className="uppercase tracking-[0.2em]">{lastResult.where}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <section className="pt-4 border-t border-foreground/15">
            <div className="flex items-center justify-between mb-3">
              <span
                className="uppercase tracking-[0.3em] opacity-70"
                style={{ fontSize: 'var(--text-label)' }}
              >
                Worth a look today
              </span>
              <button
                onClick={refresh}
                disabled={recsLoading}
                aria-label="Refresh"
                className="inline-flex items-center justify-center w-7 h-7 disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${recsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <ul className="flex flex-col gap-4">
              {recommendations.slice(0, 4).map((rec, i) => (
                <li key={i}>
                  <button
                    onClick={() => openRecommendation(rec)}
                    disabled={!rec.related_archive}
                    className="text-left w-full disabled:cursor-default"
                  >
                    <div
                      className="uppercase leading-[1.05]"
                      style={{ fontSize: 'var(--text-title)', letterSpacing: '-0.03em' }}
                    >
                      {rec.title}
                    </div>
                    <div
                      className="opacity-70 mt-1"
                      style={{ fontSize: 'var(--text-body)' }}
                    >
                      {rec.rationale}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

/* ───────────────────────── Helpers ───────────────────────── */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="tabular-nums leading-none" style={{ fontSize: 'var(--text-title)' }}>
        {value}
      </div>
      <div
        className="uppercase tracking-[0.3em] mt-1 opacity-70"
        style={{ fontSize: 'var(--text-label)' }}
      >
        {label}
      </div>
    </div>
  );
}

function formatBirthday(birthday: string): string {
  const d = new Date(birthday);
  if (Number.isNaN(d.getTime())) return birthday;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Late night';
}
