import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Cake, Loader2, Send, RefreshCw, Sparkles,
  CheckCircle2, MapPinned, Pencil, BookOpen, UserRound, Compass, Users, Leaf,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSpaces } from '@/contexts/SpacesContext';
import { useIntelligentCapture } from '@/hooks/useIntelligentCapture';
import { useSelfRecommendations, Recommendation, RecommendationCategory } from '@/hooks/useSelfRecommendations';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { PortalReturn } from '@/components/PortalReturn';

/**
 * SelfPage — the user's personal hub.
 *
 * Three bands, top to bottom:
 *   1. Identity — name, location, birthday/age, how long they've been here
 *   2. Quick capture — a single tap-to-write field. Text is routed via the
 *      intelligent_capture AI so it lands in the right archive automatically.
 *   3. Recommendations — AI-curated, varied suggestions tied to profile +
 *      archives. Refreshable. Tapping one opens the related archive when
 *      the AI surfaced a real archive, otherwise it's informational.
 */

export default function SelfPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { spaces } = useSpaces();
  const { capture, isProcessing } = useIntelligentCapture();
  const { recommendations, isLoading: recsLoading, error: recsError, refresh } = useSelfRecommendations();

  const [captureText, setCaptureText] = useState('');
  const [lastCaptureResult, setLastCaptureResult] = useState<null | { where: string; itemId: string }>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const age = useMemo(() => computeAge(profile?.birthday), [profile?.birthday]);
  const displayName = profile?.full_name?.trim() || user?.email?.split('@')[0] || 'You';
  const firstName = displayName.split(' ')[0];
  const memberSince = useMemo(() => formatMonthYear(user?.created_at), [user?.created_at]);

  const archiveCount = spaces.length;
  const totalEntries = useMemo(
    () => spaces.reduce((acc, s) => acc + (s.itemCount ?? 0), 0),
    [spaces]
  );

  // Keep the textarea height in step with content for a calm, expanding feel.
  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 280) + 'px';
  }, []);

  const handleCapture = useCallback(async () => {
    const text = captureText.trim();
    if (!text || isProcessing) return;

    const res = await capture(text);
    if (!res) {
      showErrorPopup("Couldn't save that just now. Try again in a moment.");
      return;
    }
    const targetSpace = spaces.find(s => res.result.suggested_space_id === s.id) ??
      spaces.find(s => s.name.toLowerCase() === res.result.suggested_space.toLowerCase());
    setLastCaptureResult({
      where: targetSpace?.name ?? res.result.suggested_space ?? 'your archives',
      itemId: res.itemId,
    });
    setCaptureText('');
    autosize(textareaRef.current);

    // Clear the confirmation chip after a beat.
    setTimeout(() => setLastCaptureResult(null), 4500);
  }, [captureText, isProcessing, capture, spaces, autosize]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘/Ctrl + Enter sends; plain Enter adds a newline.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleCapture();
    }
  }, [handleCapture]);

  // Open the recommendation's related archive if the AI tagged one that exists.
  const openRecommendation = useCallback((rec: Recommendation) => {
    if (!rec.related_archive) return;
    const match = spaces.find(s => s.name.toLowerCase() === rec.related_archive.toLowerCase());
    if (match) navigate(`/space/${match.id}`);
  }, [spaces, navigate]);

  // On very first mount, focus nothing — we want the hub to feel calm, not
  // demanding. Users tap the capture field when they're ready.
  useEffect(() => { /* no autofocus intentionally */ }, []);

  return (
    <div className="fixed inset-0 bg-background overflow-y-auto safe-area-top-ios">
      {/* Masthead */}
      <header className="sticky safe-sticky-top z-20 bg-background/90 backdrop-blur-xl border-b border-foreground/10">
        <div className="flex items-center justify-between px-5 py-4">
          <PortalReturn />
          <span
            className="tilt-xs leading-none"
            style={{
              fontFamily: 'var(--font-display)',
              fontVariationSettings: '"SOFT" 70, "WONK" 1, "opsz" 144',
              fontWeight: 900,
              fontSize: 'clamp(1.4rem, 4.5vw, 1.9rem)',
              letterSpacing: '-0.03em',
            }}
          >
            Self
          </span>
          <button
            onClick={() => navigate('/settings')}
            className="text-[0.65rem] uppercase tracking-[0.3em] text-foreground/55 hover:text-foreground/90 transition-colors px-2 py-1"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Settings
          </button>
        </div>
      </header>

      <main className="px-5 pt-5 pb-32 max-w-2xl mx-auto flex flex-col gap-7">
        <IdentityCard
          firstName={firstName}
          displayName={displayName}
          location={profile?.location ?? null}
          birthday={profile?.birthday ?? null}
          age={age}
          memberSince={memberSince}
          archiveCount={archiveCount}
          totalEntries={totalEntries}
        />

        <QuickCaptureCard
          value={captureText}
          onChange={(v) => { setCaptureText(v); autosize(textareaRef.current); }}
          onSend={handleCapture}
          isProcessing={isProcessing}
          lastResult={lastCaptureResult}
          textareaRef={textareaRef}
          onKeyDown={handleKeyDown}
          onAutosize={() => autosize(textareaRef.current)}
          firstName={firstName}
        />

        <RecommendationsSection
          recommendations={recommendations}
          isLoading={recsLoading}
          error={recsError}
          onRefresh={refresh}
          onOpen={openRecommendation}
          hasProfileSignal={Boolean(profile?.location || profile?.birthday || archiveCount > 0)}
        />
      </main>
    </div>
  );
}

/* ───────────────────────── Identity card ───────────────────────── */

function IdentityCard({
  firstName,
  displayName,
  location,
  birthday,
  age,
  memberSince,
  archiveCount,
  totalEntries,
}: {
  firstName: string;
  displayName: string;
  location: string | null;
  birthday: string | null;
  age: number | null;
  memberSince: string | null;
  archiveCount: number;
  totalEntries: number;
}) {
  return (
    <section
      className="relative rounded-3xl overflow-hidden px-6 pt-7 pb-6 bg-card border border-foreground/10"
      style={{ boxShadow: '0 8px 28px -8px hsl(20 14% 8% / 0.08)' }}
    >
      {/* Decorative off-grid greeting */}
      <span
        className="absolute -top-3 left-5 uppercase text-[0.6rem] tracking-[0.35em] text-foreground/40 bg-card px-2"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {greeting()}
      </span>

      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col min-w-0">
          <span
            className="uppercase leading-[0.88] tilt-l"
            style={{
              fontFamily: 'var(--font-display)',
              fontVariationSettings: '"SOFT" 70, "WONK" 1, "opsz" 144',
              fontWeight: 900,
              fontSize: 'clamp(2.4rem, 11vw, 4rem)',
              letterSpacing: '-0.04em',
              color: 'hsl(20 14% 8%)',
              wordBreak: 'break-word',
            }}
          >
            {firstName}
          </span>
          {displayName !== firstName && (
            <span className="mt-1 text-[0.75rem] uppercase tracking-[0.25em] text-foreground/50" style={{ fontFamily: 'var(--font-sans)' }}>
              {displayName}
            </span>
          )}
        </div>

        <div
          className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'hsl(24 55% 42%)' }}
        >
          <UserRound className="w-7 h-7 text-[hsl(36_33%_98%_/_0.92)]" strokeWidth={1.5} />
        </div>
      </div>

      {/* Identity facts — present only when data exists */}
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground/75" style={{ fontFamily: 'var(--font-sans)' }}>
        {location && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-foreground/55" />
            {location}
          </span>
        )}
        {birthday && (
          <span className="inline-flex items-center gap-1.5">
            <Cake className="w-3.5 h-3.5 text-foreground/55" />
            {formatBirthday(birthday)}{age != null ? ` · ${age}` : ''}
          </span>
        )}
        {memberSince && (
          <span className="inline-flex items-center gap-1.5">
            <Leaf className="w-3.5 h-3.5 text-foreground/55" />
            Since {memberSince}
          </span>
        )}
      </div>

      {/* Archive stats — small, quiet, meaningful */}
      <div className="mt-5 pt-5 border-t border-foreground/10 grid grid-cols-2 gap-4">
        <StatBlock label="Archives" value={archiveCount} />
        <StatBlock label="Entries saved" value={totalEntries} />
      </div>
    </section>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div
        className="tabular-nums"
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: '"SOFT" 60, "opsz" 96',
          fontWeight: 900,
          fontSize: 'clamp(1.8rem, 6vw, 2.4rem)',
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color: 'hsl(20 14% 8%)',
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[0.65rem] uppercase tracking-[0.3em] text-foreground/50" style={{ fontFamily: 'var(--font-sans)' }}>
        {label}
      </div>
    </div>
  );
}

/* ───────────────────────── Quick capture ───────────────────────── */

function QuickCaptureCard({
  value,
  onChange,
  onSend,
  isProcessing,
  lastResult,
  textareaRef,
  onKeyDown,
  onAutosize,
  firstName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isProcessing: boolean;
  lastResult: null | { where: string; itemId: string };
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onAutosize: () => void;
  firstName: string;
}) {
  return (
    <section className="relative rounded-3xl bg-card border border-foreground/10 px-5 pt-5 pb-4"
      style={{ boxShadow: '0 8px 28px -8px hsl(20 14% 8% / 0.08)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Pencil className="w-3.5 h-3.5 text-foreground/55" />
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-foreground/55" style={{ fontFamily: 'var(--font-sans)' }}>
            Quick capture
          </span>
        </div>
        {isProcessing && (
          <span className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.25em] text-foreground/55" style={{ fontFamily: 'var(--font-sans)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Routing…
          </span>
        )}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); onAutosize(); }}
        onKeyDown={onKeyDown}
        placeholder={`What's on your mind, ${firstName}?`}
        rows={2}
        className="w-full bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-foreground/40 resize-none focus:outline-none"
        style={{ fontFamily: 'var(--font-sans)' }}
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[0.65rem] tracking-[0.2em] uppercase text-foreground/40" style={{ fontFamily: 'var(--font-sans)' }}>
          Tap send — I'll put it where it belongs
        </span>
        <button
          onClick={onSend}
          disabled={!value.trim() || isProcessing}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3.5 py-1.5 text-[0.7rem] uppercase tracking-[0.25em] font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
          style={{ fontFamily: 'var(--font-sans)' }}
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
            className="mt-3 inline-flex items-center gap-2 text-[0.7rem] text-foreground/70"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            Saved to <strong className="font-semibold text-foreground">{lastResult.where}</strong>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ───────────────────────── Recommendations ───────────────────────── */

function RecommendationsSection({
  recommendations,
  isLoading,
  error,
  onRefresh,
  onOpen,
  hasProfileSignal,
}: {
  recommendations: Recommendation[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (rec: Recommendation) => void;
  hasProfileSignal: boolean;
}) {
  const hasRecs = recommendations.length > 0;
  const showInitialLoading = isLoading && !hasRecs;

  return (
    <section>
      <div className="flex items-end justify-between mb-3 px-1">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-[0.65rem] uppercase tracking-[0.3em] text-foreground/60" style={{ fontFamily: 'var(--font-sans)' }}>
              For you
            </span>
          </div>
          <h2
            className="mt-1 tilt-xs leading-[0.95]"
            style={{
              fontFamily: 'var(--font-display)',
              fontVariationSettings: '"SOFT" 65, "WONK" 1, "opsz" 96',
              fontWeight: 900,
              fontSize: 'clamp(1.5rem, 5vw, 2rem)',
              letterSpacing: '-0.03em',
            }}
          >
            Worth a look today
          </h2>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.25em] text-foreground/55 hover:text-foreground/90 transition-colors disabled:opacity-40"
          style={{ fontFamily: 'var(--font-sans)' }}
          aria-label="Refresh recommendations"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {showInitialLoading && <RecommendationsSkeleton />}

      {!showInitialLoading && !hasRecs && !error && (
        <div className="rounded-2xl border border-dashed border-foreground/20 px-5 py-7 text-center" style={{ fontFamily: 'var(--font-sans)' }}>
          <p className="text-sm text-foreground/70">
            {hasProfileSignal
              ? "We'll curate suggestions as we get to know you better."
              : "Add your location and a few archives — then we'll tailor suggestions to you."}
          </p>
        </div>
      )}

      {!showInitialLoading && error && !hasRecs && (
        <div className="rounded-2xl border border-foreground/10 bg-card px-5 py-6 flex flex-col items-start gap-3" style={{ fontFamily: 'var(--font-sans)' }}>
          <p className="text-sm text-foreground/80">Couldn't load recommendations just now.</p>
          <button
            onClick={onRefresh}
            className="text-xs uppercase tracking-[0.2em] font-semibold text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {hasRecs && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recommendations.map((rec, i) => (
            <RecommendationCard key={`${rec.category}-${i}`} rec={rec} onOpen={onOpen} indexOffset={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function RecommendationsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="h-32 rounded-2xl bg-card border border-foreground/10 animate-pulse"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

function RecommendationCard({ rec, onOpen, indexOffset }: { rec: Recommendation; onOpen: (rec: Recommendation) => void; indexOffset: number }) {
  const meta = CATEGORY_META[rec.category] ?? CATEGORY_META.explore;
  const Icon = meta.icon;
  const canOpen = rec.related_archive && rec.related_archive.trim().length > 0;

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(indexOffset, 6) * 0.05, ease: [0.16, 1, 0.3, 1] }}
      onClick={canOpen ? () => onOpen(rec) : undefined}
      disabled={!canOpen}
      className={`text-left rounded-2xl bg-card border border-foreground/10 px-4 pt-4 pb-4 flex flex-col gap-2.5 transition-all ${
        canOpen ? 'hover:border-foreground/25 active:scale-[0.985]' : 'cursor-default'
      }`}
      style={{ boxShadow: '0 4px 12px -4px hsl(20 14% 8% / 0.06)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.3em]"
          style={{ fontFamily: 'var(--font-sans)', color: meta.accent }}
        >
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
        {rec.related_archive && (
          <span className="text-[0.6rem] uppercase tracking-[0.25em] text-foreground/45" style={{ fontFamily: 'var(--font-sans)' }}>
            {rec.related_archive}
          </span>
        )}
      </div>

      <h3
        className="leading-[1.05]"
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: '"SOFT" 55, "WONK" 1, "opsz" 72',
          fontWeight: 800,
          fontSize: 'clamp(1.05rem, 3.5vw, 1.25rem)',
          letterSpacing: '-0.02em',
          color: 'hsl(20 14% 8%)',
        }}
      >
        {rec.title}
      </h3>

      <p className="text-[0.83rem] leading-relaxed text-foreground/70" style={{ fontFamily: 'var(--font-sans)' }}>
        {rec.rationale}
      </p>

      {rec.action_hint && (
        <span className="mt-1 inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-primary/90" style={{ fontFamily: 'var(--font-sans)' }}>
          → {rec.action_hint}
        </span>
      )}
    </motion.button>
  );
}

/* ───────────────────────── Data/meta helpers ───────────────────────── */

const CATEGORY_META: Record<RecommendationCategory, { label: string; icon: typeof Compass; accent: string }> = {
  local: { label: 'Nearby', icon: MapPinned, accent: 'hsl(8 78% 48%)' },
  capture: { label: 'Capture', icon: Pencil, accent: 'hsl(24 55% 42%)' },
  reflect: { label: 'Reflect', icon: BookOpen, accent: 'hsl(335 70% 42%)' },
  explore: { label: 'Explore', icon: Compass, accent: 'hsl(16 82% 55%)' },
  connect: { label: 'Connect', icon: Users, accent: 'hsl(348 78% 47%)' },
  habit: { label: 'Practice', icon: Leaf, accent: 'hsl(10 55% 32%)' },
};

function computeAge(birthday?: string | null): number | null {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function formatBirthday(birthday: string): string {
  const d = new Date(birthday);
  if (Number.isNaN(d.getTime())) return birthday;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMonthYear(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
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
