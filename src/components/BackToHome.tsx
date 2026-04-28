import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

/**
 * BackToHome — a small fixed top-left arrow that returns to the EntryPortal at "/".
 *
 * Replaces the prior global long-press gesture. Rendered once at the app shell.
 *
 * Hidden on:
 *  - "/" itself (already home)
 *  - routes that already render their own top-left back button (Settings,
 *    Notifications, People, /space/:id, /item/:id) — so we don't stack two
 *    arrows in the same corner.
 */

const SKIP_PREFIXES = ['/space/', '/item/'];
const SKIP_EXACT = new Set(['/', '/settings', '/notifications', '/people']);

export function BackToHome() {
  const navigate = useNavigate();
  const location = useLocation();

  const path = location.pathname;
  if (SKIP_EXACT.has(path)) return null;
  if (SKIP_PREFIXES.some(p => path.startsWith(p))) return null;

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/', { replace: true })}
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Back to home"
      className="fixed left-3 z-[99999] w-9 h-9 rounded-full bg-background/70 backdrop-blur-md border border-border/50 shadow-sm flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-background/90 active:bg-background touch-manipulation"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
      }}
    >
      <ArrowLeft className="w-4 h-4" />
    </motion.button>
  );
}

export default BackToHome;
