import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Sparkles } from 'lucide-react';
import { ArchiveGroup } from '@/types';

interface GroupPickerSheetProps {
  isOpen: boolean;
  groups: ArchiveGroup[];
  defaultLabel: string;
  onConfirm: (label: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

/**
 * Bottom-sheet picker shown at item-add time when the archive is organized.
 * Highlights the classifier's best guess but requires an explicit tap before
 * Confirm is enabled — the user always has to acknowledge the destination.
 */
export function GroupPickerSheet({
  isOpen,
  groups,
  defaultLabel,
  onConfirm,
  onClose,
  title = 'Add to section',
  subtitle = 'Tap a section to place this item.',
}: GroupPickerSheetProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // Reset selection whenever the sheet is re-opened for a fresh item.
  // Using defaultLabel as the key so React unmounts/remounts between opens.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key={`sheet-${defaultLabel}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10001] flex flex-col justify-end"
        >
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative bg-background border-t border-border rounded-t-2xl shadow-2xl p-4 pb-[max(1.5rem,var(--app-safe-bottom))]"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-secondary transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
              {groups.map((g) => {
                const isSelected = selected === g.label;
                const isSuggested = !selected && g.label === defaultLabel;
                return (
                  <button
                    key={g.label}
                    onClick={() => setSelected(g.label)}
                    className={`
                      flex items-center justify-between px-4 py-3 rounded-xl transition-colors text-left touch-manipulation
                      ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : isSuggested
                          ? 'bg-secondary border border-primary/40'
                          : 'bg-secondary/50 hover:bg-secondary active:bg-secondary/80'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelected ? (
                        <Check className="w-4 h-4 shrink-0" />
                      ) : isSuggested ? (
                        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                      ) : null}
                      <span
                        className={`text-sm font-medium capitalize truncate ${
                          isSelected ? '' : 'text-foreground'
                        }`}
                      >
                        {g.label}
                      </span>
                      {isSuggested && (
                        <span className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold shrink-0">
                          Suggested
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs tabular-nums shrink-0 ${
                        isSelected ? 'opacity-80' : 'text-muted-foreground'
                      }`}
                    >
                      {g.item_ids.length}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors touch-manipulation"
              >
                Cancel
              </button>
              <button
                onClick={() => selected && onConfirm(selected)}
                disabled={!selected}
                className={`
                  px-5 py-2.5 rounded-xl text-sm font-semibold transition-all touch-manipulation
                  ${
                    selected
                      ? 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.97]'
                      : 'bg-secondary/50 text-muted-foreground/60 cursor-not-allowed'
                  }
                `}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
