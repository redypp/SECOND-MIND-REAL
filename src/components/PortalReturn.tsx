import { motion } from 'framer-motion';
import { openPortal } from './EntryPortal';

/**
 * PortalReturn — a small triple-circle glyph that mirrors the entry portal.
 * Tapping it reopens the portal so the user can flip between Life / Self /
 * Archive from anywhere in the app.
 *
 * Designed to sit inside page headers. Deliberately quiet: small, monochrome
 * at rest, regains color on hover/tap so it doesn't compete with page content.
 */
export function PortalReturn({ className = '' }: { className?: string }) {
  return (
    <motion.button
      type="button"
      onClick={openPortal}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      aria-label="Open portal"
      className={`group inline-flex items-center gap-1 p-2 -m-2 rounded-full touch-manipulation focus:outline-none ${className}`}
    >
      <span
        className="block w-2 h-2 rounded-full bg-foreground/25 group-hover:bg-[hsl(8_78%_48%)] transition-colors"
        style={{ transform: 'translateY(-0.5px) rotate(-12deg)' }}
      />
      <span
        className="block w-2.5 h-2.5 rounded-full bg-foreground/30 group-hover:bg-[hsl(24_55%_42%)] transition-colors"
      />
      <span
        className="block w-2 h-2 rounded-full bg-foreground/25 group-hover:bg-[hsl(20_14%_10%)] transition-colors"
        style={{ transform: 'translateY(0.5px) rotate(12deg)' }}
      />
    </motion.button>
  );
}
