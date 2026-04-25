import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Users, Pin, FolderOpen } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';
import { AddSpaceDialog } from '@/components/AddSpaceDialog';
import { PortalReturn } from '@/components/PortalReturn';
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
// space has no color of its own; cycles by index so adjacent cards always
// contrast.
const FOLDER_PALETTE: { bg: string; fg: string; meta: string }[] = [
  { bg: 'hsl(36 28% 88%)', fg: 'hsl(20 14% 12%)', meta: 'hsl(20 14% 38%)' }, // cream
  { bg: 'hsl(20 18% 38%)', fg: 'hsl(36 28% 96%)', meta: 'hsl(36 28% 78%)' }, // brown
  { bg: 'hsl(45 70% 68%)', fg: 'hsl(20 14% 12%)', meta: 'hsl(20 14% 28%)' }, // mustard
  { bg: 'hsl(8 58% 52%)',  fg: 'hsl(36 28% 96%)', meta: 'hsl(36 28% 86%)' }, // terracotta
  { bg: 'hsl(220 6% 58%)', fg: 'hsl(20 14% 12%)', meta: 'hsl(20 14% 28%)' }, // slate
  { bg: 'hsl(95 22% 48%)', fg: 'hsl(36 28% 96%)', meta: 'hsl(36 28% 86%)' }, // sage
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
      {/* Floating back-to-portal button — replaces the old masthead. */}
      <div className="absolute top-3 left-3 z-30">
        <PortalReturn />
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-16 pb-12 scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex flex-col mx-auto w-full max-w-md">
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
                section={spread.section}
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

function categoryLabel(section: 'pinned' | 'recent' | 'shared'): string {
  if (section === 'pinned') return 'Pinned';
  if (section === 'shared') return 'Shared';
  return 'Archive';
}

function FolderCard({
  index,
  space,
  section,
  onClick,
}: {
  index: number;
  space: Space;
  section: 'pinned' | 'recent' | 'shared';
  onClick: () => void;
}) {
  const palette = FOLDER_PALETTE[index % FOLDER_PALETTE.length];
  const bg = space.color ?? palette.bg;
  const { fg, meta } = palette;
  const itemCount = typeof space.itemCount === 'number' ? space.itemCount : 0;
  const Icon = section === 'pinned' ? Pin : section === 'shared' ? Users : FolderOpen;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.04, 0.4) }}
      whileTap={{ scale: 0.985 }}
      className="relative w-full text-left rounded-[26px] px-5 pt-4 pb-7 flex flex-col gap-3 focus:outline-none touch-manipulation"
      style={{
        background: bg,
        // Aggressive overlap so the cards visibly sit ON each other like a
        // wallet/folder stack — only the top ~70% of each card is visible
        // until the last one in the list. zIndex puts later cards on top.
        marginTop: index === 0 ? 0 : '-2.25rem',
        zIndex: index + 1,
        boxShadow:
          '0 -2px 0 hsl(220 15% 4% / 0.04), 0 18px 32px -14px hsl(220 15% 4% / 0.32), 0 8px 14px -6px hsl(220 15% 4% / 0.18)',
      }}
      aria-label={`Open ${space.name}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-full"
          style={{ background: `${fg}1f` }}
        >
          <Icon className="w-3 h-3" style={{ color: fg }} />
        </span>
        <span
          className="text-[0.62rem] uppercase tracking-[0.28em]"
          style={{ color: meta, fontFamily: 'var(--font-sans)', fontWeight: 600 }}
        >
          {categoryLabel(section)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="truncate"
          style={{
            color: fg,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.5rem',
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
          }}
        >
          {space.name}
        </span>
        <span
          className="shrink-0 tabular-nums"
          style={{
            color: meta,
            fontFamily: 'var(--font-sans)',
            fontSize: '0.95rem',
            fontWeight: 500,
          }}
        >
          {itemCount} {itemCount === 1 ? 'entry' : 'entries'}
        </span>
      </div>
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
  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.04, 0.4) }}
      className="relative w-full rounded-[26px] px-5 pt-4 pb-7 flex flex-col gap-3 border-2 border-dashed border-foreground/25 bg-background"
      style={{
        marginTop: index === 0 ? 0 : '-2.25rem',
        zIndex: index + 1,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-foreground/10">
          <Plus className="w-3 h-3 text-foreground/70" />
        </span>
        <span
          className="text-[0.62rem] uppercase tracking-[0.28em] text-foreground/60"
          style={{ fontFamily: 'var(--font-sans)', fontWeight: 600 }}
        >
          New
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-foreground"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.5rem',
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
          }}
        >
          Start a new archive
        </span>
        <AddSpaceDialog
          variant="button"
          navigateAfterCreate={!onNavigateToSpace}
          onAfterCreate={onNavigateToSpace}
        />
      </div>
    </motion.div>
  );
}

