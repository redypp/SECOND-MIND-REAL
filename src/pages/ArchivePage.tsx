import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';
import { AddSpaceDialog } from '@/components/AddSpaceDialog';
import type { Space } from '@/types';

/**
 * ArchivePage — a vertical stack of folder-style cards.
 *
 * Each archive is a short rounded rectangle with a small category icon + label
 * up top and the archive name + entry count below. Cards overlap slightly so
 * the page reads as a tidy stack of folders, like flipping through a wallet
 * or a Rolodex.
 *
 * No header — just a tiny floating PortalReturn so the user can get home.
 */

interface ArchivePageProps {
  embedded?: boolean;
  onNavigateToSpace?: (spaceId: string) => void;
}

type Spread =
  | { kind: 'space'; space: Space; section: 'pinned' | 'recent' | 'shared' }
  | { kind: 'new' };

// Muted, earthy palette inspired by the reference. Used as a fallback when a
// space has no color of its own; cycles by index, ordered so adjacent cards
// alternate light/dark and warm/cool for high contrast at every position in
// the stack — the cycle of 18 means a user has to add 19+ archives before
// any color repeats.
const FOLDER_PALETTE: { bg: string; fg: string; meta: string }[] = [
  { bg: 'hsl(36 28% 88%)',  fg: 'hsl(20 14% 12%)',  meta: 'hsl(20 14% 38%)' }, // cream
  { bg: 'hsl(20 18% 38%)',  fg: 'hsl(36 28% 96%)',  meta: 'hsl(36 28% 78%)' }, // brown
  { bg: 'hsl(45 70% 68%)',  fg: 'hsl(20 14% 12%)',  meta: 'hsl(20 14% 28%)' }, // mustard
  { bg: 'hsl(8 58% 52%)',   fg: 'hsl(36 28% 96%)',  meta: 'hsl(36 28% 86%)' }, // terracotta
  { bg: 'hsl(220 6% 58%)',  fg: 'hsl(20 14% 12%)',  meta: 'hsl(20 14% 28%)' }, // slate
  { bg: 'hsl(95 22% 48%)',  fg: 'hsl(36 28% 96%)',  meta: 'hsl(36 28% 86%)' }, // sage
  { bg: 'hsl(195 20% 78%)', fg: 'hsl(20 14% 12%)',  meta: 'hsl(20 14% 32%)' }, // dusty sky
  { bg: 'hsl(15 35% 28%)',  fg: 'hsl(36 28% 96%)',  meta: 'hsl(36 28% 76%)' }, // espresso
  { bg: 'hsl(340 22% 78%)', fg: 'hsl(20 14% 14%)',  meta: 'hsl(20 14% 34%)' }, // dusty rose
  { bg: 'hsl(160 22% 32%)', fg: 'hsl(36 28% 96%)',  meta: 'hsl(36 28% 80%)' }, // forest
  { bg: 'hsl(28 75% 60%)',  fg: 'hsl(20 14% 12%)',  meta: 'hsl(20 14% 28%)' }, // burnt orange
  { bg: 'hsl(255 18% 32%)', fg: 'hsl(36 28% 96%)',  meta: 'hsl(36 28% 80%)' }, // plum
  { bg: 'hsl(50 32% 82%)',  fg: 'hsl(20 14% 12%)',  meta: 'hsl(20 14% 32%)' }, // sand
  { bg: 'hsl(205 30% 32%)', fg: 'hsl(36 28% 96%)',  meta: 'hsl(36 28% 80%)' }, // ink blue
  { bg: 'hsl(75 30% 52%)',  fg: 'hsl(20 14% 12%)',  meta: 'hsl(20 14% 24%)' }, // olive
  { bg: 'hsl(355 35% 42%)', fg: 'hsl(36 28% 96%)',  meta: 'hsl(36 28% 84%)' }, // wine
  { bg: 'hsl(180 15% 78%)', fg: 'hsl(20 14% 12%)',  meta: 'hsl(20 14% 32%)' }, // pale teal
  { bg: 'hsl(25 22% 22%)',  fg: 'hsl(36 28% 96%)',  meta: 'hsl(36 28% 78%)' }, // walnut
];

export default function ArchivePage({ embedded = false, onNavigateToSpace }: ArchivePageProps) {
  const navigate = useNavigate();
  const { spaces, sharedSpaces } = useSpaces();

  const spreads = useMemo<Spread[]>(() => {
    const pinned = spaces
      .filter(s => s.isPinned)
      .sort((a, b) => (b.pinnedAt?.getTime() ?? 0) - (a.pinnedAt?.getTime() ?? 0));
    const recent = spaces
      .filter(s => !s.isPinned)
      .sort((a, b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0));

    const arr: Spread[] = [];
    // "New archive" sits at the TOP of the stack so it's always one tap
    // away, even when the user is buried in dozens of archives.
    arr.push({ kind: 'new' });
    pinned.forEach(space => arr.push({ kind: 'space', space, section: 'pinned' }));
    recent.forEach(space => arr.push({ kind: 'space', space, section: 'recent' }));
    sharedSpaces.forEach(space => arr.push({ kind: 'space', space, section: 'shared' }));
    return arr;
  }, [spaces, sharedSpaces]);

  const enterSpace = useCallback((spaceId: string) => {
    if (onNavigateToSpace) onNavigateToSpace(spaceId);
    else navigate(`/space/${spaceId}`);
  }, [onNavigateToSpace, navigate]);

  return (
    <div
      className={`${embedded ? 'relative w-full h-full' : 'fixed inset-0 safe-area-top-ios'} flex flex-col bg-background overflow-hidden`}
      style={{ overscrollBehavior: 'contain' }}
    >
      {/* Back to home is handled globally by HoldToGoHome (long-press). */}

      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 pt-6 scrollbar-hide"
        style={{
          WebkitOverflowScrolling: 'touch',
          // Push past the home-indicator safe area so the last folder is
          // fully tappable even on a long scroll list. Calc so the padding
          // grows on devices that report a non-zero safe-area-inset-bottom.
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)',
          // Belt-and-suspenders: explicit overscroll behavior so scroll
          // momentum doesn't bounce out of the container into the page.
          overscrollBehaviorY: 'contain',
        }}
      >
        <div className="flex flex-col w-full">
          {spreads.map((spread, i) =>
            spread.kind === 'new' ? (
              <NewFolderCard
                key="__new__"
                index={i}
                onNavigateToSpace={onNavigateToSpace}
              />
            ) : (
              <FolderCard
                key={spread.space.id}
                index={i}
                space={spread.space}
                onClick={() => enterSpace(spread.space.id)}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Folder card ───────────────────────── */

// Shared layout constants so FolderCard and NewFolderCard render at the
// exact same dimensions — the "new" tile reads as just another folder in
// the stack instead of a different-shaped attachment.
//
// Sizing rationale:
//   pt-6 + title (1.85rem * 1.05 line-height) ≈ 3.45rem (title bottom from
//     card's top edge)
//   visible portion above the next card = (pt + title + pb) - overlap
//                                       = (1.5 + 1.94 + 3.5) - 2.75 = 4.19rem
//   → title bottom (3.45rem) sits ~0.74rem inside the visible 4.19rem,
//     so the next card never clips the title.
const CARD_RADIUS = '30px';
const CARD_PADDING_X = 'px-7';
const CARD_PADDING_TOP = 'pt-6';
const CARD_PADDING_BOTTOM = 'pb-14';
const CARD_OVERLAP = '-2.75rem';
const CARD_TITLE_SIZE = '1.85rem';

function FolderCard({
  index,
  space,
  onClick,
}: {
  index: number;
  space: Space;
  onClick: () => void;
}) {
  const palette = FOLDER_PALETTE[index % FOLDER_PALETTE.length];
  const bg = space.color ?? palette.bg;
  const { fg, meta } = palette;
  const itemCount = typeof space.itemCount === 'number' ? space.itemCount : 0;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.04, 0.4) }}
      whileTap={{ scale: 0.985 }}
      className={`relative w-full text-left ${CARD_PADDING_X} ${CARD_PADDING_TOP} ${CARD_PADDING_BOTTOM} flex items-baseline justify-between gap-3 focus:outline-none touch-manipulation`}
      style={{
        background: bg,
        borderRadius: CARD_RADIUS,
        // Aggressive overlap so the cards visibly sit ON each other like a
        // wallet/folder stack — only the top portion (with the title) of
        // each card is visible until the last one. zIndex puts later cards
        // on top of earlier ones.
        marginTop: index === 0 ? 0 : CARD_OVERLAP,
        zIndex: index + 1,
        boxShadow:
          '0 -2px 0 hsl(220 15% 4% / 0.04), 0 18px 32px -14px hsl(220 15% 4% / 0.32), 0 8px 14px -6px hsl(220 15% 4% / 0.18)',
      }}
      aria-label={`Open ${space.name}`}
    >
      <span
        className="min-w-0 flex-1"
        style={{
          color: fg,
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: CARD_TITLE_SIZE,
          letterSpacing: '-0.02em',
          lineHeight: 1.05,
          // Wrap rather than truncate so the user always sees the full title.
          wordBreak: 'break-word',
        }}
      >
        {space.name}
      </span>
      {itemCount > 0 && (
        <span
          className="shrink-0 tabular-nums"
          style={{
            color: meta,
            fontFamily: 'var(--font-sans)',
            fontSize: '0.95rem',
            fontWeight: 500,
          }}
        >
          {itemCount}
        </span>
      )}
    </motion.button>
  );
}

/* ───────────────────────── "New archive" card ───────────────────────── */

function NewFolderCard({
  index,
  onNavigateToSpace,
}: {
  index: number;
  onNavigateToSpace?: (spaceId: string) => void;
}) {
  // Whole card IS the trigger — pass it to AddSpaceDialog so tapping
  // anywhere on the tile opens the dialog. Same dimensions as FolderCard
  // so it reads as just another folder in the stack.
  const trigger = (
    <motion.button
      type="button"
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.04, 0.4) }}
      whileTap={{ scale: 0.985 }}
      className={`relative w-full text-left ${CARD_PADDING_X} ${CARD_PADDING_TOP} ${CARD_PADDING_BOTTOM} flex items-baseline justify-between gap-3 focus:outline-none touch-manipulation bg-background border-2 border-dashed border-foreground/25`}
      style={{
        borderRadius: CARD_RADIUS,
        marginTop: index === 0 ? 0 : CARD_OVERLAP,
        zIndex: index + 1,
      }}
      aria-label="Start a new archive"
    >
      <span
        className="min-w-0 flex-1 text-foreground"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: CARD_TITLE_SIZE,
          letterSpacing: '-0.02em',
          lineHeight: 1.05,
        }}
      >
        Start new archive
      </span>
      <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground/10">
        <Plus className="w-4 h-4 text-foreground/70" />
      </span>
    </motion.button>
  );

  return (
    <AddSpaceDialog
      trigger={trigger}
      navigateAfterCreate={!onNavigateToSpace}
      onAfterCreate={onNavigateToSpace}
    />
  );
}

