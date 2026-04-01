import { useState, useMemo, useRef, useCallback } from 'react';
import { useSpaces } from '@/contexts/SpacesContext';
import { useTutorial } from '@/contexts/TutorialContext';
import { Plus, X, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FloatingTodoBubbles } from '@/components/FloatingTodoBubbles';

// Color mapping for timeline colors
const spaceColorToTimeline: Record<string, string> = {
  '#10b981': 'timeline-teal',
  '#f59e0b': 'timeline-amber',
  '#3b82f6': 'timeline-blue',
  '#ef4444': 'timeline-rose',
  '#8b5cf6': 'timeline-purple',
  '#6b7280': 'timeline-muted',
  '#ec4899': 'timeline-rose',
  '#14b8a6': 'timeline-teal',
};

const defaultColors = ['timeline-teal', 'timeline-amber', 'timeline-blue', 'timeline-rose', 'timeline-purple'];

interface TodoPageProps {
  embedded?: boolean;
  onBack?: () => void;
}

export default function TodoPage({ embedded = false, onBack }: TodoPageProps) {
  const { items, addItem, deleteItem, updateItem, updateItemPosition } = useSpaces();
  const { reportTutorialAction } = useTutorial();
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [todoTitle, setTodoTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // Get todos as floating bubbles
  const todoBubbles = useMemo(() => {
    const todoItems = items.filter(item => item.subCategory === 'todo');

    return todoItems.map((item, index) => {
      const itemColor = item.color || '';
      const timelineColor = spaceColorToTimeline[itemColor] || defaultColors[index % defaultColors.length];

      let label = item.title || '';
      
      const checklistBlock = item.blocks.find(b => b.type === 'checklist');
      if (!label && checklistBlock && checklistBlock.type === 'checklist') {
        const uncheckedItems = checklistBlock.items.filter(i => !i.checked);
        if (uncheckedItems.length > 0) {
          label = uncheckedItems[0].text;
        } else if (checklistBlock.items.length > 0) {
          label = checklistBlock.items[0].text;
        }
      }
      
      if (!label) {
        const textBlock = item.blocks.find(b => b.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          label = textBlock.content.slice(0, 25) + (textBlock.content.length > 25 ? '...' : '');
        }
      }
      
      if (!label) {
        const listBlock = item.blocks.find(b => b.type === 'list');
        if (listBlock && listBlock.type === 'list' && listBlock.items.length > 0) {
          label = listBlock.items[0];
        }
      }
      
      if (!label) label = 'Todo';

      let completed = false;
      if (checklistBlock && checklistBlock.type === 'checklist') {
        completed = checklistBlock.items.length > 0 && checklistBlock.items.every(i => i.checked);
      }

      return {
        id: `todo-${item.id}`,
        itemId: item.id,
        label,
        completed,
        color: timelineColor,
        initialX: item.canvasX,
        initialY: item.canvasY,
        isImportant: item.color === 'important',
      };
    });
  }, [items]);

  const handleDeleteTodo = (itemId: string) => {
    deleteItem(itemId);
  };

  const handleUpdateTodo = (itemId: string, updates: { label: string }) => {
    updateItem(itemId, { title: updates.label });
  };

  const handleUpdatePosition = useCallback((itemId: string, position: { x: number; y: number }) => {
    updateItemPosition(itemId, position);
  }, [updateItemPosition]);

  const handleToggleImportant = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      // Toggle: if already important, remove it; otherwise mark as important
      const newColor = item.color === 'important' ? undefined : 'important';
      updateItem(itemId, { color: newColor });
    }
  }, [items, updateItem]);

  const handleAddTodo = useCallback(() => {
    if (!todoTitle.trim()) {
      setShowAddDialog(false);
      return;
    }

    addItem({
      subCategory: 'todo',
      title: todoTitle.trim(),
      blocks: [{ 
        id: `checklist-${Date.now()}`, 
        type: 'checklist', 
        items: [{ id: `check-${Date.now()}`, text: todoTitle.trim(), checked: false }] 
      }],
      scheduledDate: todayStr,
    });

    setShowAddDialog(false);
    setTodoTitle('');
    reportTutorialAction('add-todo');
  }, [todoTitle, addItem, todayStr, reportTutorialAction]);

  const handleCloseDialog = useCallback(() => {
    setShowAddDialog(false);
    setTodoTitle('');
  }, []);

  const rootClassName = `${embedded ? 'relative w-full h-full' : 'fixed inset-0'} flex flex-col bg-background overflow-hidden ${!embedded ? 'safe-area-top-ios' : ''}`;

  return (
    <div className={rootClassName} style={{ overscrollBehavior: 'none', touchAction: 'pan-x' }}>
      {/* Floating Todo Bubbles */}
      <FloatingTodoBubbles
        todos={todoBubbles}
        onDeleteTodo={handleDeleteTodo}
        onUpdateTodo={handleUpdateTodo}
        onUpdatePosition={handleUpdatePosition}
        onToggleImportant={handleToggleImportant}
      />
      
      {/* Header */}
      <header className="pt-4 pb-3 px-4 flex items-center justify-between relative z-30">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-3 -ml-2 rounded-lg hover:bg-secondary active:bg-secondary/80 transition-colors touch-manipulation shrink-0"
              style={{ minWidth: 44, minHeight: 44 }}
              aria-label="Back to Life"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className="text-2xl font-display font-bold tracking-[-0.04em] uppercase text-foreground">To-Do</h1>
        </div>
        
        {/* Add Todo Button - Crimson Red */}
        <motion.button
          data-tutorial="add-todo"
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setTodoTitle('');
            setShowAddDialog(true);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="p-3.5 rounded-full bg-red-crimson text-white hover:bg-red-crimson/90 transition-all duration-200"
          aria-label="Add todo"
        >
          <Plus className="w-5 h-5" />
        </motion.button>
      </header>

      {/* Empty state hint */}
      {todoBubbles.length === 0 && (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <p className="text-muted-foreground mb-4">No To-Dos yet</p>
            <p className="text-sm text-muted-foreground/60">
              Tap + to add a todo bubble
            </p>
          </motion.div>
        </div>
      )}

      {/* Add Todo Dialog */}
      <AnimatePresence>
        {showAddDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={handleCloseDialog}
          >
            <div className="absolute inset-0 bg-[hsl(var(--overlay))] backdrop-blur-sm" />

            <motion.div
              initial={{ y: 12, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 12, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", damping: 26, stiffness: 420 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[360px] rounded-2xl border border-border bg-card shadow-elevated overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-base font-semibold text-foreground">Add Todo</p>
                  <button
                    onClick={handleCloseDialog}
                    className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={todoTitle}
                  onChange={(e) => setTodoTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTodo();
                    }
                    if (e.key === 'Escape') {
                      handleCloseDialog();
                    }
                  }}
                  placeholder="What needs to be done?"
                  className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                />

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCloseDialog}
                    className="h-11 rounded-xl bg-secondary text-foreground/80 hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddTodo}
                    disabled={!todoTitle.trim()}
                    className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add Todo
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
