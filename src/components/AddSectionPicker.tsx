import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Sparkles } from 'lucide-react';
import { CATEGORY_ORDER } from '@/lib/smartTitle';

interface AddSectionPickerProps {
  isOpen: boolean;
  existingLabels: string[];
  onConfirm: (label: string) => void;
  onClose: () => void;
}

export function AddSectionPicker({ isOpen, existingLabels, onConfirm, onClose }: AddSectionPickerProps) {
  const [customValue, setCustomValue] = useState('');

  const existingLower = new Set(existingLabels.map(l => l.toLowerCase()));
  const presets = CATEGORY_ORDER.filter(label => !existingLower.has(label.toLowerCase()));

  const customTrimmed = customValue.trim();
  const customCollides = customTrimmed.length > 0 && existingLower.has(customTrimmed.toLowerCase());
  const canConfirmCustom = customTrimmed.length > 0 && !customCollides;

  const handleConfirmCustom = () => {
    if (!canConfirmCustom) return;
    onConfirm(customTrimmed);
    setCustomValue('');
  };

  const handleClose = () => {
    setCustomValue('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10001] flex flex-col justify-end"
        >
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={handleClose}
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
                <div className="text-sm font-semibold text-foreground">Add a section</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Pick a smart heading or write your own.
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-1 rounded-lg hover:bg-secondary transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {presets.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3 h-3 text-primary/70" />
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Smart headings
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[40vh] overflow-y-auto">
                  {presets.map(label => (
                    <button
                      key={label}
                      onClick={() => onConfirm(label)}
                      className="inline-flex items-center px-3 py-1.5 rounded-full bg-secondary/60 hover:bg-secondary active:bg-secondary/80 text-[12px] font-medium text-foreground transition-colors touch-manipulation"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                Custom heading
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmCustom();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleClose();
                    }
                  }}
                  placeholder="e.g. Weekend Reads"
                  maxLength={40}
                  className="flex-1 bg-secondary/60 border border-border/40 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={handleConfirmCustom}
                  disabled={!canConfirmCustom}
                  className={`
                    inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all touch-manipulation
                    ${
                      canConfirmCustom
                        ? 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.97]'
                        : 'bg-secondary/50 text-muted-foreground/60 cursor-not-allowed'
                    }
                  `}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
              {customCollides && (
                <div className="text-[11px] text-destructive mt-1.5">
                  A section with that name already exists.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
