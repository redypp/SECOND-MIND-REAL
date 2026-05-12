import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Settings as SettingsIcon, Send, Loader2, CheckCircle2, RefreshCw, ChevronRight, Sparkles, MapPin, Calendar, Cake } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSpaces } from '@/contexts/SpacesContext';
import { useIntelligentCapture } from '@/hooks/useIntelligentCapture';
import { useSelfRecommendations, Recommendation } from '@/hooks/useSelfRecommendations';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';

/**
 * SelfPage — the user's personal hub.
 *
 * Visual language follows the SELF tile in EntryPortal: deep blue-gray
 * atmosphere, cool blue accent, layered radial gradients, hairline
 * borders. Sections are real cards with content density (monogram hero,
 * activity heatmap, themed stats, quick capture, recommendations) so the
 * page feels like a dashboard, not a wireframe.
 */

const ACCENT = 'hsl(205 75% 66%)';
const ACCENT_SOFT = 'hsl(205 80% 64% / 0.18)';
const BORDER = 'hsl(210 20% 92% / 0.07)';
const PANEL_BG =
  'linear-gradient(180deg, hsl(220 14% 13%) 0%, hsl(220 14% 11%) 100%)';

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
  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'YO';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [displayName]);

  const archiveCount = spaces.length;
  const totalEntries = useMemo(
    () => spaces.reduce((acc, s) => acc + (s.itemCount ?? 0), 0),
    [spaces]
  );

  // ── Derived activity stats ────────────────────────────────────────────────
  const { heatmap, currentStreak, todayCount, weekCount, ageYears, daysSince } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const DAY = 24 * 60 * 60 * 1000;

    // Bucket items by day (last 28 days)
    const HEATMAP_DAYS = 28;
    const buckets = new Array(HEATMAP_DAYS).fill(0);
    items.forEach(i => {
      const t = i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt as any).getTime();
      const daysAgo = Math.floor((startOfToday - t) / DAY);
      if (daysAgo >= 0 && daysAgo < HEATMAP_DAYS) {
        buckets[HEATMAP_DAYS - 1 - daysAgo] += 1;
      }
    });

    // Today count is included for stats (use 0 offset)
    const today = items.filter(i => {
      const t = i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt as any).getTime();
      return t >= startOfToday;
    }).length;

    // 7-day window
    const startOfWeek = startOfToday - 6 * DAY;
    const week = items.filter(i => {
      const t = i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt as any).getTime();
      return t >= startOfWeek;
    }).length;

    // Streak — count back from today while bucket > 0. Today counts if any entries.
    let streak = 0;
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      if (buckets[i] > 0) streak++;
      else break;
    }

    // Age from birthday (rough — Jan 1 storage means it's just years since birth year)
    let age = 0;
    if (profile?.birthday) {
      const by = parseInt(profile.birthday.slice(0, 4), 10);
      if (!Number.isNaN(by)) age = Math.max(0, now.getFullYear() - by);
    }

    // Days since joining (member age) — uses user.created_at
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
    <div className="fixed inset-0 flex flex-col text-foreground safe-area-top-ios overflow-hidden">
      {/* Atmospheric background — cool blue gradient matching the SELF tile */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 60% at 10% -10%, hsl(210 35% 22% / 0.7) 0%, transparent 55%), radial-gradient(140% 80% at 110% 100%, hsl(220 18% 6%) 0%, transparent 60%), linear-gradient(180deg, hsl(220 14% 11%) 0%, hsl(220 14% 8%) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage: 'radial-gradient(hsl(0 0% 100%) 0.5px, transparent 0.5px)',
          backgroundSize: '3px 3px',
        }}
      />

      {/* Header */}
      <header className="relative z-20 sticky top-0 backdrop-blur-xl bg-background/30">
        <div className="flex items-center justify-between px-4 py-2 max-w-2xl mx-auto w-full">
          <span
            className="uppercase font-semibold tracking-[0.3em]"
            style={{ fontSize: '10px', color: 'hsl(210 25% 80% / 0.6)' }}
          >
            Profile
          </span>
          <div className="flex items-center gap-1">
            <IconBtn label="Notifications" onClick={() => navigate('/notifications')}>
              <Bell className="w-5 h-5" />
            </IconBtn>
            <IconBtn label="Settings" onClick={() => navigate('/settings')}>
              <SettingsIcon className="w-5 h-5" />
            </IconBtn>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 pb-24 pt-3 flex flex-col gap-3.5 max-w-2xl w-full mx-auto">
          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative rounded-3xl overflow-hidden"
            style={{
              background: PANEL_BG,
              boxShadow:
                '0 20px 50px -22px hsl(220 30% 2% / 0.55), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
            }}
          >
            <PanelDecorations accent={ACCENT_SOFT} border={BORDER} cornerGlowAt="top-right" />
            <div className="relative p-6 flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <Monogram initials={initials} accent={ACCENT} />
                <div className="flex-1 min-w-0 pt-1">
                  <div
                    className="uppercase font-semibold"
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.3em',
                      color: 'hsl(210 25% 80% / 0.6)',
                    }}
                  >
                    {greeting()}
                  </div>
                  <h1
                    className="leading-[0.9] mt-1 truncate"
                    style={{
                      fontSize: 'clamp(2rem, 8vw, 2.75rem)',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      letterSpacing: '-0.04em',
                    }}
                  >
                    {firstName}
                  </h1>
                </div>
              </div>

              {/* Identity pills */}
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
            </div>
          </motion.section>

          {/* ── Activity heatmap ─────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
            className="relative rounded-3xl overflow-hidden"
            style={{
              background: PANEL_BG,
              boxShadow:
                '0 20px 50px -22px hsl(220 30% 2% / 0.55), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
            }}
          >
            <PanelDecorations accent={ACCENT_SOFT} border={BORDER} cornerGlowAt="bottom-left" />
            <div className="relative p-5">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <div
                    className="uppercase font-semibold"
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.3em',
                      color: 'hsl(210 25% 80% / 0.6)',
                    }}
                  >
                    Activity · 28 days
                  </div>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span
                      className="tabular-nums"
                      style={{
                        fontSize: '2.25rem',
                        fontWeight: 700,
                        letterSpacing: '-0.04em',
                        color: 'hsl(0 0% 96%)',
                        fontFamily: 'var(--font-display)',
                        lineHeight: 1,
                      }}
                    >
                      {currentStreak}
                    </span>
                    <span
                      className="uppercase"
                      style={{
                        fontSize: '11px',
                        letterSpacing: '0.2em',
                        color: 'hsl(210 25% 80% / 0.7)',
                        fontWeight: 600,
                      }}
                    >
                      day{currentStreak === 1 ? '' : 's'} streak
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="tabular-nums"
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: ACCENT,
                    }}
                  >
                    +{weekCount}
                  </div>
                  <div
                    className="uppercase"
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.2em',
                      color: 'hsl(210 25% 80% / 0.55)',
                      fontWeight: 600,
                    }}
                  >
                    this week
                  </div>
                </div>
              </div>

              {/* Heatmap grid — 4 weeks × 7 days */}
              <div className="grid grid-cols-[repeat(28,1fr)] gap-[3px]">
                {heatmap.map((count, i) => {
                  const intensity = count === 0 ? 0 : Math.min(1, 0.25 + (count / heatmapMax) * 0.75);
                  return (
                    <div
                      key={i}
                      className="aspect-square rounded-[3px]"
                      style={{
                        background: count === 0
                          ? 'hsl(210 20% 92% / 0.05)'
                          : `hsl(205 75% 60% / ${intensity})`,
                        border: count === 0
                          ? `1px solid hsl(210 20% 92% / 0.05)`
                          : `1px solid hsl(205 75% 70% / ${Math.min(1, intensity + 0.1)})`,
                      }}
                      title={`${count} ${count === 1 ? 'entry' : 'entries'}`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 font-semibold tabular-nums">
                <span>28d ago</span>
                <div className="flex items-center gap-1">
                  <span>less</span>
                  {[0.15, 0.4, 0.65, 0.9].map(o => (
                    <span
                      key={o}
                      className="w-2 h-2 rounded-[2px]"
                      style={{ background: `hsl(205 75% 60% / ${o})` }}
                    />
                  ))}
                  <span>more</span>
                </div>
                <span>today</span>
              </div>
            </div>
          </motion.section>

          {/* ── Stat grid ────────────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="grid grid-cols-2 gap-3"
          >
            <StatCard label="Archives" value={archiveCount} accent={ACCENT} />
            <StatCard label="Entries" value={totalEntries} accent={ACCENT} />
            <StatCard label="Today" value={todayCount} accent={ACCENT} />
            <StatCard label="Streak" value={currentStreak} suffix={currentStreak === 1 ? 'day' : 'days'} accent={ACCENT} />
          </motion.section>

          {/* ── Quick capture ────────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="relative rounded-3xl overflow-hidden"
            style={{
              background: PANEL_BG,
              boxShadow:
                '0 20px 50px -22px hsl(220 30% 2% / 0.55), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
            }}
          >
            <PanelDecorations accent={ACCENT_SOFT} border={BORDER} cornerGlowAt="top-right" />
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                  <span
                    className="uppercase font-semibold"
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.3em',
                      color: 'hsl(210 25% 80% / 0.65)',
                    }}
                  >
                    Quick capture
                  </span>
                </div>
                {isProcessing && (
                  <span
                    className="inline-flex items-center gap-1.5 uppercase font-semibold"
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.2em',
                      color: ACCENT,
                    }}
                  >
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
                <span
                  className="uppercase tabular-nums"
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.2em',
                    color: 'hsl(210 25% 80% / 0.5)',
                    fontWeight: 600,
                  }}
                >
                  AI routes it for you
                </span>
                <button
                  onClick={handleCapture}
                  disabled={!captureText.trim() || isProcessing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full uppercase font-semibold disabled:opacity-40 transition-opacity"
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.22em',
                    background: ACCENT,
                    color: 'hsl(220 14% 8%)',
                  }}
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
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                    style={{
                      fontSize: '11px',
                      background: ACCENT_SOFT,
                      color: 'hsl(205 80% 88%)',
                    }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Saved to <span className="uppercase font-semibold tracking-[0.18em]">{lastResult.where}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>

          {/* ── Recommendations ──────────────────────────────────────────── */}
          {recommendations.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="relative rounded-3xl overflow-hidden"
              style={{
                background: PANEL_BG,
                boxShadow:
                  '0 20px 50px -22px hsl(220 30% 2% / 0.55), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
              }}
            >
              <PanelDecorations accent={ACCENT_SOFT} border={BORDER} cornerGlowAt="bottom-left" />
              <div className="relative p-5">
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="uppercase font-semibold"
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.3em',
                      color: 'hsl(210 25% 80% / 0.65)',
                    }}
                  >
                    Worth a look today
                  </span>
                  <button
                    onClick={refresh}
                    disabled={recsLoading}
                    aria-label="Refresh"
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-foreground/5 disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${recsLoading ? 'animate-spin' : ''}`} style={{ color: ACCENT }} />
                  </button>
                </div>

                <ul className="flex flex-col gap-2">
                  {recommendations.slice(0, 4).map((rec, i) => (
                    <li key={i}>
                      <button
                        onClick={() => openRecommendation(rec)}
                        disabled={!rec.related_archive}
                        className="text-left w-full flex items-start gap-3 px-3 py-3 rounded-2xl transition-colors hover:bg-foreground/5 disabled:cursor-default"
                        style={{ border: `1px solid ${BORDER}` }}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: ACCENT_SOFT, color: ACCENT }}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className="leading-snug"
                            style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              letterSpacing: '-0.01em',
                              color: 'hsl(0 0% 96%)',
                            }}
                          >
                            {rec.title}
                          </div>
                          <div
                            className="mt-1"
                            style={{
                              fontSize: '12px',
                              lineHeight: 1.45,
                              color: 'hsl(210 25% 80% / 0.7)',
                            }}
                          >
                            {rec.rationale}
                          </div>
                        </div>
                        {rec.related_archive && (
                          <ChevronRight className="w-4 h-4 shrink-0 mt-1" style={{ color: 'hsl(210 25% 80% / 0.4)' }} />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.section>
          )}
        </div>
      </main>
    </div>
  );
}

/* ───────────────────────── Sub-components ───────────────────────── */

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-full text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors"
    >
      {children}
    </button>
  );
}

function Monogram({ initials, accent }: { initials: string; accent: string }) {
  return (
    <div
      className="relative w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
      style={{
        background:
          `linear-gradient(140deg, ${accent} 0%, hsl(205 60% 38%) 70%, hsl(220 30% 18%) 100%)`,
        boxShadow:
          'inset 0 1px 0 hsl(0 0% 100% / 0.18), 0 8px 20px -10px hsl(205 80% 50% / 0.45)',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(80% 100% at 30% 20%, hsl(0 0% 100% / 0.5), transparent 60%)',
        }}
      />
      <span
        className="relative tabular-nums"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '22px',
          letterSpacing: '-0.03em',
          color: 'hsl(220 30% 12%)',
        }}
      >
        {initials}
      </span>
    </div>
  );
}

function Pill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        background: 'hsl(0 0% 100% / 0.045)',
        border: `1px solid ${BORDER}`,
        fontSize: '11px',
        fontWeight: 600,
        color: 'hsl(210 25% 90% / 0.85)',
      }}
    >
      <span style={{ color: 'hsl(210 25% 80% / 0.6)' }}>{icon}</span>
      {text}
    </span>
  );
}

function StatCard({ label, value, suffix, accent }: { label: string; value: number; suffix?: string; accent: string }) {
  return (
    <div
      className="relative rounded-2xl p-4 overflow-hidden"
      style={{
        background: PANEL_BG,
        boxShadow:
          '0 12px 24px -16px hsl(220 30% 2% / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
        border: `1px solid ${BORDER}`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          background: `radial-gradient(80% 60% at 100% 0%, ${ACCENT_SOFT}, transparent 70%)`,
        }}
      />
      <div className="relative">
        <div
          className="uppercase font-semibold"
          style={{
            fontSize: '10px',
            letterSpacing: '0.28em',
            color: 'hsl(210 25% 80% / 0.6)',
          }}
        >
          {label}
        </div>
        <div className="flex items-baseline gap-1.5 mt-1.5">
          <span
            className="tabular-nums"
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              fontFamily: 'var(--font-display)',
              color: 'hsl(0 0% 96%)',
              lineHeight: 1,
            }}
          >
            {value.toLocaleString()}
          </span>
          {suffix && (
            <span
              className="uppercase"
              style={{
                fontSize: '10px',
                letterSpacing: '0.18em',
                fontWeight: 600,
                color: 'hsl(210 25% 80% / 0.55)',
              }}
            >
              {suffix}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelDecorations({ accent, border, cornerGlowAt }: { accent: string; border: string; cornerGlowAt: 'top-right' | 'bottom-left' }) {
  const glow =
    cornerGlowAt === 'top-right'
      ? `radial-gradient(60% 80% at 95% 5%, ${accent}, transparent 70%)`
      : `radial-gradient(60% 80% at 5% 95%, ${accent}, transparent 70%)`;
  return (
    <>
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: glow }} />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none rounded-3xl"
        style={{ boxShadow: `inset 0 0 0 1px ${border}` }}
      />
    </>
  );
}

/* ───────────────────────── Helpers ───────────────────────── */

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Late night';
}
