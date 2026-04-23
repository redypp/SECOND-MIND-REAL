import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

/**
 * HomePage — the app's central hub at `/`.
 *
 * Shows three large tiles for Life, Archive, and Profile. The logo /
 * home button throughout the app navigates back here, so this is the
 * single jumping-off point for every top-level section.
 */

type Tile = { id: string; path: string; label: string; meta: string };

const TILES: Tile[] = [
  { id: 'life',    path: '/life',    label: 'Life',    meta: 'Daily plan · to-dos · habits · journal' },
  { id: 'archive', path: '/archive', label: 'Archive', meta: 'Your collections' },
  { id: 'self',    path: '/self',    label: 'Profile', meta: 'You & your spaces' },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 flex flex-col bg-background safe-area-top-ios overflow-hidden">
      <div className="flex items-center justify-center pt-6 pb-2 flex-shrink-0">
        <span
          className="uppercase tracking-[0.4em] text-[0.65rem] text-foreground/50"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Second Mind
        </span>
      </div>

      <main
        className="flex-1 min-h-0 grid grid-rows-3 gap-2 px-2 pt-2"
        style={{ paddingBottom: 'calc(var(--app-safe-bottom, 0px) + 10px)' }}
      >
        {TILES.map((tile, i) => (
          <motion.button
            key={tile.id}
            className="w-full h-full relative overflow-hidden rounded-xl life-section-card text-left"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.985 }}
            onClick={() => navigate(tile.path)}
            aria-label={`Open ${tile.label}`}
          >
            <div className="absolute inset-0 flex flex-col justify-end p-6">
              <p
                className="font-display tracking-[-0.045em] leading-[0.88] uppercase life-section-label"
                style={{ fontSize: 'clamp(2.8rem, 12vw, 5rem)', fontWeight: 800 }}
              >
                {tile.label}
              </p>
              <p className="text-[10px] uppercase tracking-[0.24em] font-medium life-section-meta opacity-70 mt-2">
                {tile.meta}
              </p>
            </div>
          </motion.button>
        ))}
      </main>
    </div>
  );
}
