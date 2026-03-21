import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CollectionCard } from '@/components/CollectionCard';
import { AddSpaceDialog } from '@/components/AddSpaceDialog';
import { useSpaces } from '@/contexts/SpacesContext';
import { useTheme } from '@/contexts/ThemeContext';
import { X, FolderOpen, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Sun, Moon, Calendar, CheckSquare, Plus, MoreHorizontal } from 'lucide-react';
import { RadialMenu } from '@/components/RadialMenu';
import { Space, Item } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

import CircularTimeline from '@/components/CircularTimeline';
import { Button } from '@/components/ui/button';
import { FloatingTodoBubbles } from '@/components/FloatingTodoBubbles';
import { NotificationBell } from '@/components/NotificationBell';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';
import { FocusNudge } from '@/components/FocusNudge';
// Color mapping for spaces to timeline colors
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

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { spaces, items, updateItem, addItem, deleteItem } = useSpaces();
  const { theme, toggleTheme } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeRange, setTimeRange] = useState<"24h" | "12h">("24h");
  const [activeScreen, setActiveScreen] = useState<'clock' | 'collections'>('clock');
  const [mantra, setMantra] = useState(() => localStorage.getItem('user-mantra') || '');
  const [isEditingMantra, setIsEditingMantra] = useState(false);
  const [showQuickAddDialog, setShowQuickAddDialog] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddType, setQuickAddType] = useState<'todo' | 'event'>('todo');
  const [quickAddStep, setQuickAddStep] = useState<'type' | 'time' | 'details'>('type');
  const [quickAddHour, setQuickAddHour] = useState(() => new Date().getHours());
  const [quickAddMinute, setQuickAddMinute] = useState(() => Math.floor(new Date().getMinutes() / 15) * 15);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mantraInputRef = useRef<HTMLTextAreaElement>(null);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const hasScrolledToScreen = useRef(false);

  // Handle URL screen parameter on mount
  useEffect(() => {
    const screenParam = searchParams.get('screen');
    if (screenParam === 'collections' && !hasScrolledToScreen.current) {
      hasScrolledToScreen.current = true;
      // Small delay to ensure the scroll container is mounted
      setTimeout(() => {
        if (scrollContainerRef.current) {
          const screenWidth = scrollContainerRef.current.clientWidth;
          scrollContainerRef.current.scrollTo({
            left: screenWidth,
            behavior: 'auto' // Use 'auto' for instant scroll on load
          });
          setActiveScreen('collections');
        }
        // Clear the URL parameter after scrolling
        setSearchParams({}, { replace: true });
      }, 50);
    }
  }, [searchParams, setSearchParams]);

  // Format date label based on relation to today
  const getDateLabel = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const current = new Date(currentDate);
    current.setHours(0, 0, 0, 0);
    
    const diffTime = current.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    
    return currentDate.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      year: currentDate.getFullYear() !== today.getFullYear() ? "numeric" : undefined
    });
  };
  
  const dateLabel = getDateLabel();
  const todayStr = currentDate.toISOString().split('T')[0];

  // Get all items for today (scheduled or with today's date)
  const todayItems = useMemo(() => {
    return items.filter(item => {
      if (item.scheduledDate === todayStr) return true;
      const itemDate = new Date(item.createdAt).toISOString().split('T')[0];
      return itemDate === todayStr;
    });
  }, [items, todayStr]);

  const navigateDay = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction);
    setCurrentDate(newDate);
  };

  // Convert items with scheduled times to timeline blocks (includes calendar events)
  const scheduleBlocks = useMemo(() => {
    const scheduledItems = items.filter(item => {
      // Include items with scheduled date/time for today
      if (item.scheduledDate === todayStr && item.scheduledTime) return true;
      // Include calendar/scheduling items for today
      if (item.subCategory === 'scheduling' && item.scheduledDate === todayStr) return true;
      // Include scheduling items created today that don't have a specific date
      if (item.subCategory === 'scheduling' && !item.scheduledDate) {
        const itemDate = new Date(item.createdAt).toISOString().split('T')[0];
        return itemDate === todayStr;
      }
      return false;
    });

    return scheduledItems.map((item, index) => {
      // Parse time - default to 9am if no time specified
      let startHour = 9;
      if (item.scheduledTime) {
        const [hours, minutes] = item.scheduledTime.split(':').map(Number);
        startHour = hours + minutes / 60;
      } else if (item.subCategory === 'scheduling') {
        // For calendar events without specific time, space them out
        startHour = 9 + (index * 2);
      }
      
      // Use item color or default - events are stored separately from sections
      const itemColor = item.color || '';
      const timelineColor = spaceColorToTimeline[itemColor] || defaultColors[index % defaultColors.length];

      // Get title from blocks or legacy content
      let label = item.title || '';
      if (!label && item.blocks.length > 0) {
        const textBlock = item.blocks.find(b => b.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          label = textBlock.content.slice(0, 20) + (textBlock.content.length > 20 ? '...' : '');
        }
      }
      if (!label) {
        label = item.subCategory === 'scheduling' ? 'Event' : 'Task';
      }

      return {
        id: index + 1,
        itemId: item.id,
        label,
        startHour,
        duration: 1, // Default 1 hour duration
        color: timelineColor,
        isCalendarEvent: item.subCategory === 'scheduling',
      };
    });
  }, [items, todayStr]);

  // Get todos for today as floating bubbles
  const todoBubbles = useMemo(() => {
    const todoItems = items.filter(item => {
      if (item.subCategory !== 'todo') return false;
      // Include todos scheduled for today or created today
      if (item.scheduledDate === todayStr) return true;
      const itemDate = new Date(item.createdAt).toISOString().split('T')[0];
      return itemDate === todayStr;
    });

    return todoItems.map((item, index) => {
      // Use item color or default - todos are stored separately from sections
      const itemColor = item.color || '';
      const timelineColor = spaceColorToTimeline[itemColor] || defaultColors[index % defaultColors.length];

      // Get label (title)
      let label = item.title || '';
      
      // Check for checklist items first to get label
      const checklistBlock = item.blocks.find(b => b.type === 'checklist');
      if (!label && checklistBlock && checklistBlock.type === 'checklist') {
        const uncheckedItems = checklistBlock.items.filter(i => !i.checked);
        if (uncheckedItems.length > 0) {
          label = uncheckedItems[0].text;
        } else if (checklistBlock.items.length > 0) {
          label = checklistBlock.items[0].text;
        }
      }
      
      // Fall back to text block if no label
      if (!label) {
        const textBlock = item.blocks.find(b => b.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          label = textBlock.content.slice(0, 25) + (textBlock.content.length > 25 ? '...' : '');
        }
      }
      
      // Fall back to list block
      if (!label) {
        const listBlock = item.blocks.find(b => b.type === 'list');
        if (listBlock && listBlock.type === 'list' && listBlock.items.length > 0) {
          label = listBlock.items[0];
        }
      }
      
      if (!label) label = 'Todo';

      // Check if completed
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
      };
    });
  }, [items, todayStr]);

  // Handle toggling a todo's completion status
  // On the main clock experience, completing a todo removes it entirely.
  const handleToggleTodo = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    deleteItem(itemId);
  };

  // Handle adding events from the clock double-tap
  const handleAddEvent = (startHour: number, endHour: number, data: { title: string; type: 'event' | 'todo' }) => {
    // Convert hours to time strings
    const startHours = Math.floor(startHour);
    const startMinutes = Math.round((startHour % 1) * 60);
    const startTimeStr = `${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}`;
    
    const endHours = Math.floor(endHour);
    const endMinutes = Math.round((endHour % 1) * 60);
    const endTimeStr = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
    
    // Todos and events are stored separately - no space connection needed
    addItem({
      subCategory: data.type === 'todo' ? 'todo' : 'scheduling',
      title: data.title,
      blocks: data.type === 'todo' 
        ? [{ id: `checklist-${Date.now()}`, type: 'checklist', items: [{ id: `check-${Date.now()}`, text: data.title, checked: false }] }]
        : [{ id: `text-${Date.now()}`, type: 'text', content: `End: ${endTimeStr}` }],
      scheduledDate: todayStr,
      scheduledTime: startTimeStr,
    });

  };

  // Handle updating event time/duration from clock drag
  const handleUpdateEvent = (itemId: string, updates: { startHour?: number; duration?: number }) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const updateData: Partial<Item> = {};

    if (updates.startHour !== undefined) {
      const hours = Math.floor(updates.startHour);
      const minutes = Math.round((updates.startHour % 1) * 60);
      updateData.scheduledTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Duration would require a new field - for now we can store it but the UI won't fully use it
    // This would need schema changes to fully support

    if (Object.keys(updateData).length > 0) {
      updateItem(itemId, updateData);
    }
  };

  // Handle deleting event from clock
  const handleDeleteEvent = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    deleteItem(itemId);
  };

  // Handle updating todo label
  const handleUpdateTodo = (itemId: string, updates: { label: string }) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    updateItem(itemId, { title: updates.label });
  };

  // Handle deleting todo
  const handleDeleteTodo = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    deleteItem(itemId);
  };


  // Handle quick add submit
  const handleQuickAddSubmit = useCallback(() => {
    if (!quickAddTitle.trim()) {
      setShowQuickAddDialog(false);
      setQuickAddStep('type');
      return;
    }

    // Todos and events are stored separately - no space connection needed
    const timeStr = `${quickAddHour.toString().padStart(2, '0')}:${quickAddMinute.toString().padStart(2, '0')}`;

    addItem({
      subCategory: quickAddType === 'todo' ? 'todo' : 'scheduling',
      title: quickAddTitle.trim(),
      blocks: quickAddType === 'todo' 
        ? [{ id: `checklist-${Date.now()}`, type: 'checklist', items: [{ id: `check-${Date.now()}`, text: quickAddTitle.trim(), checked: false }] }]
        : [{ id: `text-${Date.now()}`, type: 'text', content: '' }],
      scheduledDate: todayStr,
      scheduledTime: quickAddType === 'event' ? timeStr : undefined,
    });

    setShowQuickAddDialog(false);
    setQuickAddTitle('');
    setQuickAddStep('type');
  }, [quickAddTitle, quickAddType, quickAddHour, quickAddMinute, addItem, todayStr]);

  // Handle closing the quick add dialog
  const handleCloseQuickAdd = useCallback(() => {
    setShowQuickAddDialog(false);
    setQuickAddTitle('');
    setQuickAddStep('type');
  }, []);

  // Handle type selection in quick add
  const handleQuickAddTypeSelect = useCallback((type: 'todo' | 'event') => {
    setQuickAddType(type);
    if (type === 'event') {
      // Go to time selection step for events
      setQuickAddStep('time');
    } else {
      // Go directly to details for todos
      setQuickAddStep('details');
      setTimeout(() => quickAddInputRef.current?.focus(), 100);
    }
  }, []);

  // Handle time confirmation
  const handleQuickAddTimeConfirm = useCallback(() => {
    setQuickAddStep('details');
    setTimeout(() => quickAddInputRef.current?.focus(), 100);
  }, []);

  const stats = useMemo(() => {
    const categoryTotals: Record<string, number> = {
      focus: 0,
      creative: 0,
      meetings: 0,
      building: 0,
    };

    scheduleBlocks.forEach(block => {
      if (block.color === 'timeline-teal') categoryTotals.focus += block.duration;
      else if (block.color === 'timeline-rose') categoryTotals.creative += block.duration;
      else if (block.color === 'timeline-amber') categoryTotals.meetings += block.duration;
      else if (block.color === 'timeline-blue') categoryTotals.building += block.duration;
    });

    return {
      focus: { hours: Math.floor(categoryTotals.focus), minutes: Math.round((categoryTotals.focus % 1) * 60) },
      creative: { hours: Math.floor(categoryTotals.creative), minutes: Math.round((categoryTotals.creative % 1) * 60) },
      meetings: { hours: Math.floor(categoryTotals.meetings), minutes: Math.round((categoryTotals.meetings % 1) * 60) },
      building: { hours: Math.floor(categoryTotals.building), minutes: Math.round((categoryTotals.building % 1) * 60) },
    };
  }, [scheduleBlocks]);

  const totalHours = scheduleBlocks.reduce((acc, block) => acc + block.duration, 0);



  const hasSpaces = spaces.length > 0;

  // Handle scroll snap detection — throttled to avoid rapid state updates
  const scrollRafRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!scrollContainerRef.current) return;
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const screenWidth = scrollContainerRef.current.clientWidth;
      const newScreen = scrollLeft > screenWidth / 2 ? 'collections' : 'clock';
      setActiveScreen(prev => prev === newScreen ? prev : newScreen);
    });
  }, []);

  // Scroll to screen
  const scrollToScreen = (screen: 'clock' | 'collections') => {
    if (!scrollContainerRef.current) return;
    const screenWidth = scrollContainerRef.current.clientWidth;
    scrollContainerRef.current.scrollTo({
      left: screen === 'clock' ? 0 : screenWidth,
      behavior: 'smooth'
    });
    setActiveScreen(screen);
  };

  return (
    <div 
      className="h-[100dvh] flex flex-col bg-background overflow-hidden page-transition safe-area-top-ios"
      style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'none' }}
    >
      

      {/* Focus Nudge Banner */}
      <FocusNudge />

      {/* Floating Todo Bubbles - can float anywhere on screen */}
      {activeScreen === 'clock' && (
        <FloatingTodoBubbles
          todos={todoBubbles}
          onToggleTodo={handleToggleTodo}
          onUpdateTodo={handleUpdateTodo}
          onDeleteTodo={handleDeleteTodo}
        />
      )}
      
      {/* Minimal Header */}
      <header className="flex-shrink-0 pt-4 pb-3 px-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <SyncStatusIndicator />
        </div>
        
        <div className="flex items-center gap-1 relative">
          {/* Asterisk Radial Menu */}
          <RadialMenu pageIndex={activeScreen === 'collections' ? 1 : 0} />
        </div>
      </header>

      {/* ON/OFF style screen toggle */}
      <div className="flex-shrink-0 flex items-center justify-center py-2">
        <div
          className="relative flex items-center w-48 h-10 rounded-full bg-foreground/90 cursor-pointer select-none"
          onClick={() => scrollToScreen(activeScreen === 'clock' ? 'collections' : 'clock')}
        >
          {/* Sliding pill */}
          <motion.div
            className="absolute top-1 h-8 w-[calc(50%-4px)] rounded-full bg-background shadow-md"
            animate={{ left: activeScreen === 'clock' ? 4 : 'calc(50%)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
          {/* Labels */}
          <span className={`relative z-10 flex-1 text-center text-sm font-semibold transition-colors duration-200 ${
            activeScreen === 'clock' ? 'text-foreground' : 'text-muted-foreground/60'
          }`}>
            LIFE
          </span>
          <span className={`relative z-10 flex-1 text-center text-sm font-semibold transition-colors duration-200 ${
            activeScreen === 'collections' ? 'text-foreground' : 'text-muted-foreground/60'
          }`}>
            ARCHIVE
          </span>
        </div>
      </div>

      {/* Swipeable Screen Container */}
      {(
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex flex-1 min-h-0 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none', 
            WebkitOverflowScrolling: 'touch',
            overflowY: 'hidden',
            overscrollBehavior: 'none'
          }}
        >
          {/* Clock Screen - Full height */}
          <div
            className="flex-shrink-0 w-full snap-center h-full flex flex-col items-center justify-center"
            style={{ overflowY: 'hidden' }}
          >
            {/* Date Navigation */}
            <div className="flex items-center gap-3 mb-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => navigateDay(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[120px]">
                <p className="text-lg font-medium text-foreground">{dateLabel}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => navigateDay(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Circular Timeline - Responsive size */}
            <div 
              className="relative flex-shrink-0 w-[min(75vw,320px)] h-[min(75vw,320px)]"
              onTouchStart={(e) => {
                // Prevent swipe navigation when touching the clock
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                // Prevent swipe navigation when dragging on the clock
                e.stopPropagation();
              }}
            >
              <CircularTimeline 
                blocks={scheduleBlocks} 
                todos={[]}
                timeRange={timeRange} 
                compact 
                onToggleTodo={handleToggleTodo}
                onAddEvent={handleAddEvent}
                onUpdateEvent={handleUpdateEvent}
                onDeleteEvent={handleDeleteEvent}
                onUpdateTodo={handleUpdateTodo}
                onDeleteTodo={handleDeleteTodo}
              />

              {/* Center Content - Mantra */}
              <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none" 
                style={{ width: '55%', height: '55%', left: '22.5%', top: '22.5%' }}
              >
                {isEditingMantra ? (
                  <textarea
                    ref={mantraInputRef}
                    value={mantra}
                    onChange={(e) => setMantra(e.target.value)}
                    onBlur={() => {
                      setIsEditingMantra(false);
                      localStorage.setItem('user-mantra', mantra);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        setIsEditingMantra(false);
                        localStorage.setItem('user-mantra', mantra);
                      }
                    }}
                    placeholder="Your mantra..."
                    className="w-full max-h-full bg-transparent text-center text-foreground text-sm leading-relaxed resize-none focus:outline-none placeholder:text-muted-foreground/50 pointer-events-auto"
                    style={{ height: 'auto', minHeight: '2.5rem' }}
                    autoFocus
                  />
                ) : (
                  <motion.button
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    onClick={() => {
                      setIsEditingMantra(true);
                      setTimeout(() => mantraInputRef.current?.focus(), 50);
                    }}
                    className="text-center flex items-center justify-center p-2 pointer-events-auto"
                  >
                    {mantra ? (
                      <p 
                        className="text-sm text-primary font-bold leading-relaxed"
                        style={{ 
                          textShadow: '0 0 20px hsl(0 85% 50% / 0.6), 0 0 40px hsl(0 85% 50% / 0.4), 0 0 60px hsl(0 85% 50% / 0.2)' 
                        }}
                      >
                        {mantra}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground/50">
                        Tap to add your mantra
                      </p>
                    )}
                  </motion.button>
                )}
              </div>
            </div>

            {/* Time range toggle */}
            <button
              onClick={() => setTimeRange(timeRange === "24h" ? "12h" : "24h")}
              className="flex-shrink-0 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {timeRange} view
            </button>
          </div>

          {/* Collections Screen */}
          <div
            className="flex-shrink-0 w-full snap-center h-full flex flex-col"
          >
            <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-24 pt-4" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
              
              {!hasSpaces ? (
                /* Empty state - Blank slate for new users */
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-16 px-6"
                >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex items-center justify-center w-20 h-20 border-2 border-dashed border-border rounded-2xl mb-6"
                  >
                    <Plus className="w-8 h-8 text-muted-foreground/50" />
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      Create your first section
                    </h3>
                    <p className="text-muted-foreground text-sm max-w-[280px] mx-auto mb-8 leading-relaxed">
                     Sections help you organize your thoughts, ideas, and hobbies into meaningful collections.
                    </p>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <AddSpaceDialog variant="button" navigateAfterCreate />
                  </motion.div>
                  
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-8 text-xs text-muted-foreground/50"
                  >
                   Try: Finance, Cooking, Surfing, Music...
                  </motion.p>
                </motion.div>
              ) : (
                /* Grid view */
                <div className="grid grid-cols-2 gap-0">
                  {spaces.map((space) => (
                    <div key={space.id}>
                      <CollectionCard space={space} selectedId={selectedCollectionId} onSelect={setSelectedCollectionId} />
                    </div>
                  ))}
                </div>
              )}
            </main>
          </div>
        </div>
      )}




      {/* Quick Add Dialog - Multi-step */}
      <AnimatePresence>
        {showQuickAddDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={handleCloseQuickAdd}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-[hsl(var(--overlay))] backdrop-blur-sm" />

            {/* Card */}
            <motion.div
              initial={{ y: 12, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 12, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", damping: 26, stiffness: 420 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[360px] rounded-2xl border border-border bg-card shadow-elevated overflow-hidden"
            >
              <div className="p-4">
                {/* Step 1: Type Selection */}
                {quickAddStep === 'type' && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-base font-semibold text-foreground">What do you want to add?</p>
                      <button
                        onClick={handleCloseQuickAdd}
                        className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Type Selection Cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleQuickAddTypeSelect('todo')}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-background hover:bg-secondary hover:border-primary/30 transition-all"
                      >
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <CheckSquare className="h-6 w-6 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">Todo</span>
                        <span className="text-[11px] text-muted-foreground">Task to complete</span>
                      </button>
                      <button
                        onClick={() => handleQuickAddTypeSelect('event')}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-background hover:bg-secondary hover:border-primary/30 transition-all"
                      >
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Calendar className="h-6 w-6 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">Event</span>
                        <span className="text-[11px] text-muted-foreground">Scheduled time</span>
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Time Selection (Events only) */}
                {quickAddStep === 'time' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setQuickAddStep('type')}
                          className="w-9 h-9 rounded-lg bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4 text-foreground" />
                        </button>
                        <div>
                          <p className="text-base font-semibold text-foreground">Select Time</p>
                          <p className="text-xs text-muted-foreground">When is this event?</p>
                        </div>
                      </div>
                      <button
                        onClick={handleCloseQuickAdd}
                        className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Time Picker */}
                    <div className="mb-4">
                      <div className="flex items-center justify-center gap-2 p-4 rounded-xl bg-muted/30 border border-border">
                        {/* Hour selector */}
                        <div className="flex flex-col items-center">
                          <button
                            onClick={() => setQuickAddHour((prev) => (prev + 1) % 24)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                          >
                            <ChevronUp className="w-5 h-5" />
                          </button>
                          <div className="w-16 h-14 flex items-center justify-center bg-background border border-border rounded-xl">
                            <span className="text-2xl font-bold text-foreground tabular-nums">
                              {quickAddHour.toString().padStart(2, '0')}
                            </span>
                          </div>
                          <button
                            onClick={() => setQuickAddHour((prev) => (prev - 1 + 24) % 24)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                          >
                            <ChevronDown className="w-5 h-5" />
                          </button>
                          <span className="text-xs text-muted-foreground mt-1">Hour</span>
                        </div>

                        <span className="text-2xl font-bold text-muted-foreground">:</span>

                        {/* Minute selector */}
                        <div className="flex flex-col items-center">
                          <button
                            onClick={() => setQuickAddMinute((prev) => (prev + 15) % 60)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                          >
                            <ChevronUp className="w-5 h-5" />
                          </button>
                          <div className="w-16 h-14 flex items-center justify-center bg-background border border-border rounded-xl">
                            <span className="text-2xl font-bold text-foreground tabular-nums">
                              {quickAddMinute.toString().padStart(2, '0')}
                            </span>
                          </div>
                          <button
                            onClick={() => setQuickAddMinute((prev) => (prev - 15 + 60) % 60)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                          >
                            <ChevronDown className="w-5 h-5" />
                          </button>
                          <span className="text-xs text-muted-foreground mt-1">Min</span>
                        </div>
                      </div>
                    </div>

                    {/* Confirm Button */}
                    <button
                      onClick={handleQuickAddTimeConfirm}
                      className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Continue
                    </button>
                  </motion.div>
                )}

                {/* Step 3: Details */}
                {quickAddStep === 'details' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setQuickAddStep(quickAddType === 'event' ? 'time' : 'type')}
                          className="w-9 h-9 rounded-lg bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4 text-foreground" />
                        </button>
                        <div>
                          <p className="text-base font-semibold text-foreground">
                            {quickAddType === 'todo' ? 'Add Todo' : 'Add Event'}
                          </p>
                          {quickAddType === 'event' && (
                            <p className="text-xs text-muted-foreground">
                              At {quickAddHour.toString().padStart(2, '0')}:{quickAddMinute.toString().padStart(2, '0')}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={handleCloseQuickAdd}
                        className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Title Input */}
                    <input
                      ref={quickAddInputRef}
                      type="text"
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuickAddSubmit();
                        }
                        if (e.key === 'Escape') {
                          handleCloseQuickAdd();
                        }
                      }}
                      placeholder={quickAddType === 'todo' ? 'What needs to be done?' : 'Event name...'}
                      className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    />

                    {/* Actions */}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={handleCloseQuickAdd}
                        className="h-11 rounded-xl bg-secondary text-foreground/80 hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleQuickAddSubmit}
                        disabled={!quickAddTitle.trim()}
                        className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {quickAddType === 'todo' ? 'Add Todo' : 'Add Event'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
