import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddSpaceDialog } from '@/components/AddSpaceDialog';
import { useSpaces } from '@/contexts/SpacesContext';
import { Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNavigation } from '@/components/BottomNavigation';
import { MarqueeHeader } from '@/components/MarqueeHeader';

interface CollectionsPageProps {
  embedded?: boolean;
  onNavigateToSpace?: (spaceId: string) => void;
}

// Each archive card is exactly 1/7 of usable viewport height — matching Life cards.
// Usable height = 100dvh minus: header (52px), bottom clearance (12px),
// and cumulative gap between 7 cards (6 × 4px = 24px) + safe bottom.
// Total fixed overhead = 88px = 5.5rem — cards fill the screen naturally with 7 archives
// and scroll gracefully beyond that.
const CARD_HEIGHT = 'calc((100dvh - 5.5rem - var(--app-safe-bottom, 0px)) / 7)';

export default function CollectionsPage({ embedded = false, onNavigateToSpace }: CollectionsPageProps) {
  const navigate = useNavigate();
  const { spaces, deleteSpace } = useSpaces();
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  const hasSpaces = spaces.length > 0;

  const sortedSpaces = useMemo(() =>
    [...spaces].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (a.isPinned && b.isPinned) {
        return (b.pinnedAt?.getTime() ?? 0) - (a.pinnedAt?.getTime() ?? 0);
      }
      return (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0);
    }),
    [spaces]
  );

  return (
    <div
      className={`${embedded ? 'relative w-full h-full' : 'fixed inset-0 safe-area-top-ios'} flex flex-col bg-background overflow-hidden max-w-full overflow-x-hidden`}
      style={{ overscrollBehavior: 'none' }}
    >
      {/* Header */}
      <header className="relative flex items-center pl-0 pr-0 flex-shrink-0 min-h-[52px]">
        <div className="flex-1 min-w-0 overflow-hidden">
          <MarqueeHeader text="ARCHIVE" />
        </div>
      </header>

      {/* Content */}
      <main
        className="flex-1 min-h-0 flex flex-col px-0 pb-[calc(var(--app-safe-bottom,0px)+12px)] overflow-y-auto"
        style={{ overscrollBehavior: 'none' }}
      >
        {!hasSpaces ? (
          /* ── Empty state ── */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center px-6 flex-1 flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center justify-center w-20 h-20 border-2 border-dashed border-border rounded-2xl mb-6"
            >
              <Plus className="w-8 h-8 text-muted-foreground/70" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-xl font-bold text-foreground mb-2">
                Create your first section
              </h3>
              <p className="text-muted-foreground text-[15px] max-w-[280px] mx-auto mb-8 leading-relaxed">
                Sections help you organize your thoughts, ideas, and hobbies into meaningful archives.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <AddSpaceDialog variant="button" navigateAfterCreate />
            </motion.div>
          </motion.div>
        ) : (
          <>
            {/* ── Archive cards — fixed height, never compressed ── */}
            <AnimatePresence initial={false}>
              {sortedSpaces.map((space) => (
                <motion.button
                  key={space.id}
                  layout
                  className="w-full text-left relative overflow-hidden flex-shrink-0"
                  style={{ height: CARD_HEIGHT }}
                  initial={{ opacity: 0, y: 16, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20, scale: 0.97, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                  whileTap={{ scale: 0.982 }}
                  onClick={() => {
                    if (selectedCollectionId === space.id) {
                      setSelectedCollectionId(null);
                    } else if (onNavigateToSpace) {
                      onNavigateToSpace(space.id);
                    } else {
                      navigate(`/space/${space.id}`);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedCollectionId(selectedCollectionId === space.id ? null : space.id);
                  }}
                >
                  {/* Background */}
                  <div className="absolute inset-0">
                    {space.image ? (
                      <>
                        <img
                          src={space.image}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent" />
                      </>
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{
                          background: space.color
                            ? `linear-gradient(145deg, ${space.color} 0%, ${space.color}cc 100%)`
                            : 'linear-gradient(145deg, #0d1b2a 0%, #1b1f3b 100%)',
                        }}
                      />
                    )}
                  </div>

                  {/* Title */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                    <span
                      className="text-white uppercase text-[clamp(1.8rem,7vw,2.8rem)] font-black tracking-tighter leading-none"
                      style={{ textShadow: '0 2px 16px rgba(0,0,0,0.5), 0 0 4px rgba(0,0,0,0.3)' }}
                    >
                      {space.name}
                    </span>
                  </div>

                  {/* Delete button — shown on long-press / context-menu */}
                  <AnimatePresence>
                    {selectedCollectionId === space.id && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteSpace(space.id);
                          setSelectedCollectionId(null);
                        }}
                        className="absolute z-10 flex items-center justify-center w-7 h-7 rounded-full bg-foreground/80 backdrop-blur-sm border border-background/20 shadow-md active:scale-90"
                        style={{ top: 8, right: 8 }}
                        aria-label={`Delete ${space.name}`}
                      >
                        <X className="w-4 h-4 text-background" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.button>
              ))}
            </AnimatePresence>

            {/* ── Add archive — subtle action row below the card list ── */}
            <motion.div
              layout
              className="flex items-center justify-center py-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05, duration: 0.25 }}
            >
              <AddSpaceDialog variant="button" navigateAfterCreate />
            </motion.div>
          </>
        )}
      </main>

      {!embedded && <BottomNavigation />}
    </div>
  );
}
