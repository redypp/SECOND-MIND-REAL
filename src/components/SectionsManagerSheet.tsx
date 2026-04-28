import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, Sparkles } from 'lucide-react';
import { CATEGORY_ORDER } from '@/lib/smartTitle';

export interface SectionGroup {
  label: string;
  item_ids: string[];
}

interface SectionsManagerSheetProps {
  isOpen: boolean;
  groups: SectionGroup[];
  onClose: () => void;
  onChange: (groups: SectionGroup[]) => void;
}

export function SectionsManagerSheet({ isOpen, groups, onClose, onChange }: SectionsManagerSheetProps) {
  const [renamingLabel, setRenamingLabel] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setRenamingLabel(null);
      setRenameValue('');
      setNewLabel('');
      setConfirmDelete(null);
    }
  }, [isOpen]);

  const existingLower = new Set(groups.map(g => g.label.toLowerCase()));
  const presets = CATEGORY_ORDER.filter(label => !existingLower.has(label.toLowerCase())).slice(0, 12);

  const commitRename = () => {
    if (!renamingLabel) return;
    const next = renameValue.trim();
    if (!next || next === renamingLabel) {
      setRenamingLabel(null);
      return;
    }
    if (groups.some(g => g.label.toLowerCase() === next.toLowerCase() && g.label !== renamingLabel)) {
      setRenamingLabel(null);
      return;
    }
    onChange(groups.map(g => (g.label === renamingLabel ? { ...g, label: next } : g)));
    setRenamingLabel(null);
  };

  const moveGroup = (label: string, dir: -1 | 1) => {
    const idx = groups.findIndex(g => g.label === label);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const deleteGroup = (label: string) => {
    onChange(groups.filter(g => g.label !== label));
    setConfirmDelete(null);
  };

  const addGroup = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (existingLower.has(trimmed.toLowerCase())) return;
    onChange([...groups, { label: trimmed, item_ids: [] }]);
    setNewLabel('');
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
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative bg-background border-t border-border rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-4 pt-4 pb-2 border-b border-border/40">
              <div>
                <div className="text-sm font-semibold text-foreground">Sections</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Reorder, rename, or delete archive headers.
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-secondary transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 pb-[max(1rem,var(--app-safe-bottom))]">
              {/* Existing sections */}
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                  Your sections ({groups.length})
                </div>
                {groups.length === 0 ? (
                  <div className="text-xs text-muted-foreground/70 italic px-2 py-3">
                    No saved sections yet — items group themselves automatically. Add one below to take over.
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {groups.map((group, idx) => {
                      const isRenaming = renamingLabel === group.label;
                      const isConfirmingDelete = confirmDelete === group.label;
                      return (
                        <li
                          key={group.label}
                          className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-secondary/40"
                        >
                          {/* Drag-style reorder controls */}
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button
                              onClick={() => moveGroup(group.label, -1)}
                              disabled={idx === 0}
                              className="w-6 h-5 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              aria-label="Move up"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveGroup(group.label, 1)}
                              disabled={idx === groups.length - 1}
                              className="w-6 h-5 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              aria-label="Move down"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Label / inline rename */}
                          <div className="flex-1 min-w-0">
                            {isRenaming ? (
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitRename();
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setRenamingLabel(null);
                                  }
                                }}
                                maxLength={40}
                                className="w-full bg-background border border-primary/40 rounded-md px-2 py-1 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingLabel(group.label);
                                  setRenameValue(group.label);
                                }}
                                className="text-left text-sm font-medium text-foreground hover:text-primary transition-colors truncate w-full"
                              >
                                {group.label}
                              </button>
                            )}
                            <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                              {group.item_ids.length} {group.item_ids.length === 1 ? 'item' : 'items'}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            {isConfirmingDelete ? (
                              <>
                                <button
                                  onClick={() => deleteGroup(group.label)}
                                  className="px-2 py-1 rounded-md bg-destructive text-destructive-foreground text-[11px] font-semibold"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-2 py-1 rounded-md text-[11px] text-muted-foreground"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : isRenaming ? (
                              <button
                                onClick={commitRename}
                                className="w-7 h-7 rounded-md flex items-center justify-center text-primary hover:bg-secondary"
                                aria-label="Save rename"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setRenamingLabel(group.label);
                                    setRenameValue(group.label);
                                  }}
                                  className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                  aria-label="Rename section"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(group.label)}
                                  className="w-7 h-7 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                                  aria-label="Delete section"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Add new */}
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                  Add section
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addGroup(newLabel);
                      }
                    }}
                    placeholder="e.g. Weekend Reads"
                    maxLength={40}
                    className="flex-1 bg-secondary/60 border border-border/40 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    onClick={() => addGroup(newLabel)}
                    disabled={!newLabel.trim() || existingLower.has(newLabel.trim().toLowerCase())}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:bg-secondary/50 disabled:text-muted-foreground/60 disabled:cursor-not-allowed touch-manipulation"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
                {presets.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 mt-3 mb-2">
                      <Sparkles className="w-3 h-3 text-primary/70" />
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Smart suggestions
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {presets.map(label => (
                        <button
                          key={label}
                          onClick={() => addGroup(label)}
                          className="inline-flex items-center px-3 py-1.5 rounded-full bg-secondary/60 hover:bg-secondary text-[12px] font-medium text-foreground transition-colors touch-manipulation"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border/40 flex justify-end">
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground touch-manipulation"
              >
                <Check className="w-4 h-4" />
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
