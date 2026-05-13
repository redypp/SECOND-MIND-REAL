import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Settings, Sparkles, Sunrise, HelpCircle, X, Plus, FlaskConical, MessageCircleQuestion, PenLine } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import secondMindLogo from '@/assets/secondmind-logo.jpg';
import { DailyBriefingModal } from '@/components/DailyBriefing';
import { OrganizeModal } from '@/components/OrganizeModal';
import { ChamberModal } from '@/components/ChamberModal';

const STORAGE_KEY = 'radial-menu-pos';
const BUTTON_SIZE = 56;
const DRAG_THRESHOLD = 8;

const SUGGESTIONS = [
  "Write down one thing you're grateful for",
  "Text someone you haven't spoken to in a while",
  "Go outside for 5 minutes",
  "Drink a glass of water right now",
  "Put your phone down for 10 minutes",
  "Write a note to your future self",
  "Clean one small area around you",
  "Take 3 deep breaths",
  "Save a link you've been meaning to read",
  "Move your body for 60 seconds",
  "Capture an idea before you forget it",
  "Look out a window for a moment",
  "Organize one space in your archive",
  "Write down what's on your mind",
  "Send a voice memo to yourself",
  "Delete something you no longer need",
];

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function savePosition(pos: { x: number; y: number }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
}

function clamp(pos: { x: number; y: number }) {
  const maxX = window.innerWidth - BUTTON_SIZE - 8;
  const maxY = window.innerHeight - BUTTON_SIZE - 8;
  return {
    x: Math.max(8, Math.min(maxX, pos.x)),
    y: Math.max(8, Math.min(maxY, pos.y)),
  };
}

interface RadialMenuProps {
  pageIndex?: number; // 0 = Life, 1 = Archive
}

export function RadialMenu({ pageIndex }: RadialMenuProps) {
  const [open, setOpen] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [showOrganize, setShowOrganize] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [showAsk, setShowAsk] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isArchive = pageIndex !== undefined ? pageIndex === 1 : (location.pathname === '/archive' || location.pathname.startsWith('/space/'));

  // Position state — default top-right
  const [pos, setPos] = useState(() => {
    const saved = loadPosition();
    if (saved) return clamp(saved);
    return { x: (window.innerWidth - BUTTON_SIZE) / 2, y: 28 };
  });

  // Drag refs
  const isDragging = useRef(false);
  const hasMoved = useRef(false);
  const startTouch = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });

  // Re-clamp on resize
  useEffect(() => {
    const onResize = () => setPos(p => clamp(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    isDragging.current = true;
    hasMoved.current = false;
    startTouch.current = { x: clientX, y: clientY };
    startPos.current = { ...pos };
  }, [pos]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const dx = clientX - startTouch.current.x;
    const dy = clientY - startTouch.current.y;
    if (!hasMoved.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    hasMoved.current = true;
    const newPos = clamp({ x: startPos.current.x + dx, y: startPos.current.y + dy });
    setPos(newPos);
  }, []);

  const handleEnd = useCallback(() => {
    if (hasMoved.current) {
      savePosition(pos);
    }
    isDragging.current = false;
  }, [pos]);

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (open) return; // don't drag when menu is open
    const t = e.touches[0];
    handleStart(t.clientX, t.clientY);
  }, [handleStart, open]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  }, [handleMove]);

  const onTouchEnd = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  // Pointer handlers (desktop)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (open) return;
    if (e.pointerType === 'touch') return; // handled by touch events
    handleStart(e.clientX, e.clientY);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [handleStart, open]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    handleMove(e.clientX, e.clientY);
  }, [handleMove]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    handleEnd();
  }, [handleEnd]);

  const handleClick = useCallback(() => {
    if (hasMoved.current) return; // was a drag, not a tap
    setOpen(o => !o);
  }, []);

  const items = useMemo(() => {
    const menuItems = [
      {
        icon: <MessageCircleQuestion className="w-5 h-5" />,
        label: 'Ask',
        onClick: () => { setOpen(false); setShowAsk(true); },
        className: 'bg-primary text-primary-foreground',
      },
      {
        icon: <Settings className="w-5 h-5" />,
        label: 'Settings',
        onClick: () => { setOpen(false); navigate('/settings'); },
        className: 'bg-secondary text-foreground',
      },
      {
        icon: <Sunrise className="w-5 h-5" />,
        label: 'Daily Briefing',
        onClick: () => { setOpen(false); setShowBriefing(true); },
        className: 'bg-secondary text-foreground',
      },
    ];
    return menuItems;
  }, [navigate]);

  // Smart menu positioning: compute direction toward most available space
  const ITEM_SIZE = 56;
  const GAP = 8; // min gap between items
  const RADIUS = 85; // distance from center of main button to center of item
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const btnCenter = { x: pos.x + BUTTON_SIZE / 2, y: pos.y + BUTTON_SIZE / 2 };

  // Calculate the angle pointing toward the most open space
  // Weight edges: the closer to an edge, the more we push away from it
  const spaceRight = screenW - btnCenter.x;
  const spaceLeft = btnCenter.x;
  const spaceBottom = screenH - btnCenter.y;
  const spaceTop = btnCenter.y;

  // Vector pointing toward available space (weighted)
  const dirX = spaceRight - spaceLeft;
  const dirY = spaceBottom - spaceTop;
  const baseAngle = Math.atan2(dirY, dirX);

  // Place 4 items in an arc, evenly spaced, centered on baseAngle
  const SPREAD = Math.PI / 4.5; // ~40° between items
  const rawPositions = items.map((_, i) => {
    const offset = (i - (items.length - 1) / 2) * SPREAD;
    const angle = baseAngle + offset;
    return {
      x: Math.cos(angle) * RADIUS,
      y: Math.sin(angle) * RADIUS,
    };
  });

  // Clamp each item so it stays on screen with padding
  const EDGE_PAD = 8;
  const menuPositions = rawPositions.map(p => {
    const absX = pos.x + p.x;
    const absY = pos.y + p.y;
    const clampedX = Math.max(EDGE_PAD - pos.x, Math.min(screenW - ITEM_SIZE - EDGE_PAD - pos.x, p.x));
    const clampedY = Math.max(EDGE_PAD - pos.y, Math.min(screenH - ITEM_SIZE - EDGE_PAD - pos.y, p.y));
    return { x: clampedX, y: clampedY };
  });

  // Labels go opposite to menu direction
  const labelSide = dirX < 0 ? 'right' : 'left';

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[59] backdrop-blur-sm bg-background/60"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <div
        className="fixed z-[60]"
        style={{
          left: pos.x,
          top: pos.y,
          touchAction: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="relative">
          <motion.button
            whileTap={hasMoved.current ? undefined : { scale: 0.9 }}
            onClick={handleClick}
            className={`relative z-50 w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-200 shadow-lg overflow-hidden ${
              open ? 'bg-background text-foreground' : 'bg-foreground text-background'
            }`}
            aria-label="Menu"
            style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
          >
            {open ? (
              <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <X className="w-6 h-6" />
              </motion.div>
            ) : (
              <img src={secondMindLogo} alt="" className="w-14 h-14 rounded-full object-cover pointer-events-none select-none" draggable={false} />
            )}
          </motion.button>

          <AnimatePresence>
            {open && items.map((item, i) => (
              <motion.button
                key={item.label}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
                animate={{
                  opacity: 1,
                  x: menuPositions[i].x,
                  y: menuPositions[i].y,
                  scale: 1,
                }}
                exit={{ opacity: 0, x: 0, y: 0, scale: 0.3, pointerEvents: 'none' as any }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 22,
                  delay: i * 0.04,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                }}
                className={`absolute z-50 top-0 left-0 w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${
                  (item.label === 'Organize' || item.label === 'Ask')
                    ? 'text-white'
                    : 'bg-foreground text-background'
                }`}
                style={(item.label === 'Organize' || item.label === 'Ask') ? { background: 'linear-gradient(135deg, #ff6b8a 0%, #e8305a 45%, #c0154a 100%)' } : undefined}
                aria-label={item.label}
              >
                {item.icon}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <DailyBriefingModal isOpen={showBriefing} onClose={() => setShowBriefing(false)} />
      <OrganizeModal isOpen={showOrganize} onClose={() => setShowOrganize(false)} />
      <ChamberModal isOpen={showCapture} onClose={() => setShowCapture(false)} initialMode="organize" />
      <ChamberModal isOpen={showAsk} onClose={() => setShowAsk(false)} initialMode="ask" lockMode />

      <AnimatePresence>
        {suggestion && (
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="fixed top-16 left-4 right-4 z-[70] pointer-events-auto"
            onClick={() => setSuggestion(null)}
          >
            <div className="bg-foreground text-background rounded-2xl px-5 py-4 shadow-2xl">
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.25em] opacity-50 block mb-1">
                Breaking news
              </span>
              <p className="text-base font-semibold leading-snug">
                {suggestion}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
