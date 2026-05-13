import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, CheckCircle2, RefreshCw, ChevronRight, Sparkles, MapPin, Calendar, Cake } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSpaces } from '@/contexts/SpacesContext';
import { useIntelligentCapture } from '@/hooks/useIntelligentCapture';
import { useSelfRecommendations, Recommendation } from '@/hooks/useSelfRecommendations';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';

/**
 * SelfPage — the user's personal hub.
 *
 * Minimal, editorial layout. No top chrome, no per-card gradients — uniform
 * cards using design-system tokens. Sections: identity, activity, stats,
 * quick capture, recommendations.
 */

export default function SelfPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { spaces, items } = useSpaces();
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

  const { heatmap, currentStreak, todayCount, weekCount, ageYears, daysSince } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const DAY = 24 * 60 * 60 * 1000;

    const HEATMAP_DAYS = 28;
    const buckets = new Array(HEATMAP_DAYS).fill(0);
    items.forEach(i => {
      const t = i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt as any).getTime();
      const daysAgo = Math.floor((startOfToday - t) / DAY);
      if (daysAgo >= 0 && daysAgo < HEATMAP_DAYS) {
        buckets[HEATMAP_DAYS - 1 - daysAgo] += 1;
      }
    });

    const today = items.filter(i => {
      const t = i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt as any).getTime();
      return t >= startOfToday;
    }).length;

    const startOfWeek = startOfToday - 6 * DAY;
    const week = items.filter(i => {
      const t = i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt as any).getTime();
      return t >= startOfWeek;
    }).length;

    let streak = 0;
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      if (buckets[i] > 0) streak++;
      else break;
    }

    let age = 0;
    if (profile?.birthday) {
      const by = parseInt(profile.birthday.slice(0, 4), 10);
      if (!Number.isNaN(by)) age = Math.max(0, now.getFullYear() - by);
    }

    let since = 0;
    if (user?.created_at) {
      const joined = new Date(user.created_at).getTime();
      if (!Number.isNaN(joined)) since = Math.max(1, Math.floor((Date.now() - joined) / DAY));
    }

    return { heatmap: buckets, currentStreak: streak, todayCount: today, weekCount: week, ageYears: age, daysSince: since };
  }, [items, profile, user]);

  const heatmapMax = Math.max(1, ...heatmap);

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
    <div
      className="fixed inset-0 flex flex-col bg-background text-foreground overflow-hidden"
      style={{ paddingTop: 'var(--app-safe-top, env(safe-area-inset-top, 0px))' }}
    >
      <main className="relative flex-1 overflow-y-auto overscroll-contain">
        <div className="px-5 pb-24 pt-8 flex flex-col gap-4 max-w-2xl w-full mx-auto">
          {/* ── Identity ─────────────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-3"
          >
            <span className="text-[10px] uppercase font-medium tracking-[0.32em] text-muted-foreground/70">
              Profile
            </span>
            <h1
              className="leading-[0.9] text-foreground"
              style={{
                fontSize: 'clamp(2.4rem, 9vw, 3.2rem)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                letterSpacing: '-0.05em',
              }}
            >
              {firstName}
            </h1>
            {(profile?.location || ageYears > 0 || daysSince > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {profile?.location && (
                  <Pill icon={<MapPin className="w-3 h-3" />} text={profile.location} />
                )}
                {ageYears > 0 && (
                  <Pill icon={<Cake className="w-3 h-3" />} text={`Age ${ageYears}`} />
                )}
                {daysSince > 0 && (
                  <Pill icon={<Calendar className="w-3 h-3" />} text={`Day ${daysSince.toLocaleString()}`} />
                )}
              </div>
            )}
          </motion.section>

          {/* ── Activity heatmap ─────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
            className="rounded-3xl bg-card border border-border/60 p-5"
          >
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="text-[10px] uppercase font-medium tracking-[0.28em] text-muted-foreground/70">
                  Activity · 28 days
                </div>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span
                    className="tabular-nums text-foreground"
                    style={{
                      fontSize: '2.25rem',
                      fontWeight: 700,
                      letterSpacing: '-0.04em',
                      fontFamily: 'var(--font-display)',
                      lineHeight: 1,
                    }}
                  >
                    {currentStreak}
                  </span>
                  <span className="text-[11px] uppercase font-medium tracking-[0.2em] text-muted-foreground/70">
                    day{currentStreak === 1 ? '' : 's'} streak
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className="tabular-nums text-foreground"
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                  }}
                >
                  +{weekCount}
                </div>
                <div className="text-[10px] uppercase font-medium tracking-[0.2em] text-muted-foreground/70">
                  this week
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[repeat(28,1fr)] gap-[3px]">
              {heatmap.map((count, i) => {
                const intensity = count === 0 ? 0 : Math.min(1, 0.25 + (count / heatmapMax) * 0.75);
                return (
                  <div
                    key={i}
                    className="aspect-square rounded-[3px]"
                    style={{
                      background: count === 0
                        ? 'hsl(var(--foreground) / 0.06)'
                        : `hsl(var(--foreground) / ${intensity * 0.85})`,
                    }}
                    title={`${count} ${count === 1 ? 'entry' : 'entries'}`}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-medium tabular-nums">
              <span>28d ago</span>
              <span>today</span>
            </div>
          </motion.section>

          {/* ── Stat grid ────────────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="grid grid-cols-2 gap-3"
          >
            <StatCard label="Archives" value={archiveCount} />
            <StatCard label="Entries" value={totalEntries} />
            <StatCard label="Today" value={todayCount} />
            <StatCard label="Streak" value={currentStreak} suffix={currentStreak === 1 ? 'day' : 'days'} />
          </motion.section>

          {/* ── Quick capture ────────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="rounded-3xl bg-card border border-border/60 p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span className="text-[10px] uppercase font-medium tracking-[0.28em] text-muted-foreground/70">
                  Quick capture
                </span>
              </div>
              {isProcessing && (
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase font-medium tracking-[0.18em] text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Routing
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
              className="w-full bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/40 text-foreground"
              style={{ fontSize: '15px', lineHeight: 1.5 }}
            />

            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-muted-foreground/60 tabular-nums">
                AI routes it
              </span>
              <button
                onClick={handleCapture}
                disabled={!captureText.trim() || isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] uppercase font-semibold tracking-[0.2em] bg-foreground text-background disabled:opacity-40 transition-opacity"
              >
                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Send
              </button>
            </div>

            <AnimatePresence>
              {lastResult && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/5 text-foreground/80 text-[11px]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Saved to <span className="uppercase font-semibold tracking-[0.16em]">{lastResult.where}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

          {/* ── Recommendations ──────────────────────────────────────────── */}
          {recommendations.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="rounded-3xl bg-card border border-border/60 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase font-medium tracking-[0.28em] text-muted-foreground/70">
                  Worth a look
                </span>
                <button
                  onClick={refresh}
                  disabled={recsLoading}
                  aria-label="Refresh"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-foreground/5 disabled:opacity-40 text-muted-foreground"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${recsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <ul className="flex flex-col gap-1">
                {recommendations.slice(0, 4).map((rec, i) => (
                  <li key={i}>
                    <button
                      onClick={() => openRecommendation(rec)}
                      disabled={!rec.related_archive}
                      className="text-left w-full flex items-start gap-3 px-3 py-3 rounded-2xl transition-colors hover:bg-foreground/5 disabled:cursor-default"
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-foreground/5 text-muted-foreground">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-foreground leading-snug tracking-[-0.01em]">
                          {rec.title}
                        </div>
                        <div className="text-[12px] text-muted-foreground/80 leading-relaxed mt-1">
                          {rec.rationale}
                        </div>
                      </div>
                      {rec.related_archive && (
                        <ChevronRight className="w-4 h-4 shrink-0 mt-1 text-muted-foreground/40" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </div>
      </main>
    </div>
  );
}

/* ───────────────────────── Sub-components ───────────────────────── */

function Pill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border/60 text-[11px] font-medium text-foreground/80">
      <span className="text-muted-foreground/70">{icon}</span>
      {text}
    </span>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-4">
      <div className="text-[10px] uppercase font-medium tracking-[0.28em] text-muted-foreground/70">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span
          className="tabular-nums text-foreground"
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            fontFamily: 'var(--font-display)',
            lineHeight: 1,
          }}
        >
          {value.toLocaleString()}
        </span>
        {suffix && (
          <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-muted-foreground/70">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
