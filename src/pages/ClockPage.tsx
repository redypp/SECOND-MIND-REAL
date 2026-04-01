import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSpaces } from '@/contexts/SpacesContext';
import { useTutorial } from '@/contexts/TutorialContext';
import { processQueue } from '@/lib/syncQueue';
import { X, ChevronLeft, ChevronRight, Calendar, Plus, ArrowLeft } from 'lucide-react';
import { Item } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

import CircularTimeline from '@/components/CircularTimeline';
import { Button } from '@/components/ui/button';
import { BottomNavigation } from '@/components/BottomNavigation';
import { useCurrentDate } from '@/hooks/useCurrentDate';
import { format } from 'date-fns';
import { TimeWheelPicker } from '@/components/WheelPicker';

// Events now use grey shades only - no color mapping needed
// The CircularTimeline component handles grey shade assignment automatically

interface ClockPageProps {
  embedded?: boolean;
  onBack?: () => void;
}

export default function ClockPage({ embedded = false, onBack }: ClockPageProps) {
  const { items, updateItem, addItem, deleteItem } = useSpaces();
  const { reportTutorialAction } = useTutorial();
  const { today, todayString: currentTodayString, resetToToday } = useCurrentDate();
  // Flush pending saves when leaving the page or closing the tab
  useEffect(() => {
    const handleBeforeUnload = () => { processQueue(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      processQueue(); // flush on unmount (navigation away)
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
  
  // Track selected date (can be different from today when navigating)
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [isViewingToday, setIsViewingToday] = useState(true);
  
  // Auto-update selected date when today changes (midnight rollover)
  useEffect(() => {
    if (isViewingToday) {
      setSelectedDate(today);
    }
  }, [today, isViewingToday]);
  
  const [timeRange, setTimeRange] = useState<"24h" | "12h">("24h");
  const [clockPeriod, setClockPeriod] = useState<"AM" | "PM">(() => new Date().getHours() >= 12 ? 'PM' : 'AM');
  const [mantra, setMantra] = useState(() => localStorage.getItem('user-mantra') || '');
  const [isEditingMantra, setIsEditingMantra] = useState(false);
  const [showQuickAddDialog, setShowQuickAddDialog] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddStartHour, setQuickAddStartHour] = useState(() => {
    const h = new Date().getHours();
    return h === 0 ? 12 : h > 12 ? h - 12 : h;
  });
  const [quickAddStartMinute, setQuickAddStartMinute] = useState(() => Math.floor(new Date().getMinutes() / 15) * 15);
  const [quickAddStartPeriod, setQuickAddStartPeriod] = useState<'AM' | 'PM'>(() => new Date().getHours() >= 12 ? 'PM' : 'AM');
  const [quickAddEndHour, setQuickAddEndHour] = useState(() => {
    const h = new Date().getHours() + 1;
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h12 > 12 ? h12 - 12 : h12;
  });
  const [quickAddEndMinute, setQuickAddEndMinute] = useState(() => Math.floor(new Date().getMinutes() / 15) * 15);
  const [quickAddEndPeriod, setQuickAddEndPeriod] = useState<'AM' | 'PM'>(() => new Date().getHours() >= 11 ? 'PM' : 'AM');
  const [quickAddError, setQuickAddError] = useState('');
  const mantraInputRef = useRef<HTMLTextAreaElement>(null);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Helper to convert 12h to 24h
  const to24Hour = (hour12: number, period: 'AM' | 'PM') => {
    if (period === 'AM') {
      return hour12 === 12 ? 0 : hour12;
    } else {
      return hour12 === 12 ? 12 : hour12 + 12;
    }
  };

  // Helper to format time for display (12h format)
  const formatTime12h = (hour24: number, minute: number) => {
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
  };

  // Format date label based on relation to today
  const getDateLabel = () => {
    const todayMidnight = new Date(today);
    todayMidnight.setHours(0, 0, 0, 0);
    const current = new Date(selectedDate);
    current.setHours(0, 0, 0, 0);
    
    const diffTime = current.getTime() - todayMidnight.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    
    return selectedDate.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      year: selectedDate.getFullYear() !== todayMidnight.getFullYear() ? "numeric" : undefined
    });
  };
  
  const dateLabel = getDateLabel();
  // Use local timezone date string for filtering items
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  const navigateDay = (direction: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + direction);
    setSelectedDate(newDate);
    
    // Check if we're back to today
    const newDateStr = format(newDate, 'yyyy-MM-dd');
    setIsViewingToday(newDateStr === currentTodayString);
  };

  // Jump back to today
  const goToToday = useCallback(() => {
    resetToToday();
    setSelectedDate(today);
    setIsViewingToday(true);
  }, [resetToToday, today]);

  // Convert items with scheduled times to timeline blocks (includes calendar events)
  const scheduleBlocks = useMemo(() => {
    const parseTimeToHour = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return (Number.isFinite(h) ? h : 0) + ((Number.isFinite(m) ? m : 0) / 60);
    };

    const extractEndHourFromBlocks = (blocks: Item['blocks']): number | null => {
      const endBlock = blocks.find(
        (b) => b.type === 'text' && /^End:\s*\d{1,2}:\d{2}\b/i.test(b.content)
      );
      if (!endBlock || endBlock.type !== 'text') return null;

      const match = endBlock.content.match(/^End:\s*(\d{1,2}):(\d{2})\b/i);
      if (!match) return null;

      const h = Number(match[1]);
      const m = Number(match[2]);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h + m / 60;
    };

    const scheduledItems = items.filter((item) => {
      if (item.scheduledDate === selectedDateStr && item.scheduledTime) return true;
      if (item.subCategory === 'scheduling' && item.scheduledDate === selectedDateStr) return true;
      if (item.subCategory === 'scheduling' && !item.scheduledDate) {
        const itemDate = new Date(item.createdAt).toISOString().split('T')[0];
        return itemDate === selectedDateStr;
      }
      return false;
    });

    return scheduledItems.map((item, index) => {
      let startHour = 9;
      if (item.scheduledTime) {
        startHour = parseTimeToHour(item.scheduledTime);
      } else if (item.subCategory === 'scheduling') {
        startHour = 9 + index * 2;
      }

      const endHour = extractEndHourFromBlocks(item.blocks);
      const duration = endHour !== null && endHour > startHour ? endHour - startHour : 1;

      // Color is no longer used - CircularTimeline assigns grey shades automatically
      const timelineColor = 'grey';

      let label = item.title || '';
      if (!label && item.blocks.length > 0) {
        const textBlock = item.blocks.find(
          (b) => b.type === 'text' && !/^End:\s*\d{1,2}:\d{2}\b/i.test(b.content)
        );
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
        duration,
        color: timelineColor,
        isCalendarEvent: item.subCategory === 'scheduling',
      };
    });
  }, [items, selectedDateStr]);

  // Handle adding events from the clock
  const handleAddEvent = (startHour: number, endHour: number, data: { title: string; type: 'event' | 'todo' }) => {
    const startHours = Math.floor(startHour);
    const startMinutes = Math.round((startHour % 1) * 60);
    const startTimeStr = `${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}`;
    
    const endHours = Math.floor(endHour);
    const endMinutes = Math.round((endHour % 1) * 60);
    const endTimeStr = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
    
    addItem({
      subCategory: 'scheduling',
      title: data.title,
      blocks: [{ id: `text-${Date.now()}`, type: 'text', content: `End: ${endTimeStr}` }],
      scheduledDate: selectedDateStr,
      scheduledTime: startTimeStr,
    });

  };

  // Handle updating event time/duration from clock drag
  const handleUpdateEvent = (itemId: string, updates: { startHour?: number; duration?: number; label?: string }) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const parseTimeToHour = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return (Number.isFinite(h) ? h : 0) + ((Number.isFinite(m) ? m : 0) / 60);
    };

    const hourToTimeString = (hour: number) => {
      const totalMinutes = Math.round(hour * 60);
      const hh = Math.max(0, Math.min(23, Math.floor(totalMinutes / 60)));
      const mm = Math.max(0, Math.min(59, totalMinutes % 60));
      return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
    };

    const currentStartHour = item.scheduledTime ? parseTimeToHour(item.scheduledTime) : 9;
    const nextStartHour = updates.startHour ?? currentStartHour;

    const updateData: Partial<Item> = {};

    if (updates.label !== undefined) {
      updateData.title = updates.label || undefined;
    }

    if (updates.startHour !== undefined) {
      updateData.scheduledTime = hourToTimeString(nextStartHour);
    }

    if (updates.duration !== undefined) {
      const nextEndHour = nextStartHour + updates.duration;
      const endTimeStr = hourToTimeString(nextEndHour);

      const blocks = Array.isArray(item.blocks) ? [...item.blocks] : [];
      const endIdx = blocks.findIndex(
        (b) => b.type === 'text' && typeof b.content === 'string' && /^End:\s*\d{1,2}:\d{2}\b/i.test(b.content)
      );

      if (endIdx >= 0) {
        const existing = blocks[endIdx];
        if (existing.type === 'text') {
          blocks[endIdx] = { ...existing, content: `End: ${endTimeStr}` };
        }
      } else {
        blocks.push({ id: `text-${Date.now()}`, type: 'text', content: `End: ${endTimeStr}` });
      }

      updateData.blocks = blocks;
    }

    if (Object.keys(updateData).length > 0) {
      updateItem(itemId, updateData);
    }
  };

  // Handle deleting event from clock
  const handleDeleteEvent = useCallback((itemId: string) => {
    deleteItem(itemId);
  }, [deleteItem]);

  // Memoize the preview block to avoid unnecessary CircularTimeline re-renders
  const previewBlock = useMemo(() => {
    if (!showQuickAddDialog) return undefined;
    return {
      startHour: to24Hour(quickAddStartHour, quickAddStartPeriod) + quickAddStartMinute / 60,
      endHour: to24Hour(quickAddEndHour, quickAddEndPeriod) + quickAddEndMinute / 60,
      label: quickAddTitle.trim() || undefined,
    };
  }, [showQuickAddDialog, quickAddStartHour, quickAddStartPeriod, quickAddStartMinute, quickAddEndHour, quickAddEndPeriod, quickAddEndMinute, quickAddTitle]);

  // Handle quick add submit
  const handleQuickAddSubmit = useCallback(() => {
    if (!quickAddTitle.trim()) {
      setQuickAddError('Please enter an event name');
      return;
    }

    // Convert to 24-hour for storage
    const start24 = to24Hour(quickAddStartHour, quickAddStartPeriod);
    const end24 = to24Hour(quickAddEndHour, quickAddEndPeriod);
    
    const startTotal = start24 * 60 + quickAddStartMinute;
    const endTotal = end24 * 60 + quickAddEndMinute;
    
    if (endTotal <= startTotal) {
      setQuickAddError('End time must be after start time');
      return;
    }

    const startTimeStr = `${start24.toString().padStart(2, '0')}:${quickAddStartMinute.toString().padStart(2, '0')}`;
    const endTimeStr = `${end24.toString().padStart(2, '0')}:${quickAddEndMinute.toString().padStart(2, '0')}`;

    addItem({
      subCategory: 'scheduling',
      title: quickAddTitle.trim(),
      blocks: [{ id: `text-${Date.now()}`, type: 'text', content: `End: ${endTimeStr}` }],
      scheduledDate: selectedDateStr,
      scheduledTime: startTimeStr,
    });

    // Show user-friendly time in toast
    const startDisplay = formatTime12h(start24, quickAddStartMinute);
    const endDisplay = formatTime12h(end24, quickAddEndMinute);
    setShowQuickAddDialog(false);
    setQuickAddTitle('');
    setQuickAddError('');
    reportTutorialAction('add-event');
  }, [quickAddTitle, quickAddStartHour, quickAddStartMinute, quickAddStartPeriod, quickAddEndHour, quickAddEndMinute, quickAddEndPeriod, addItem, selectedDateStr, reportTutorialAction]);

  const handleCloseQuickAdd = useCallback(() => {
    setShowQuickAddDialog(false);
    setQuickAddTitle('');
    setQuickAddError('');
  }, []);

  const rootClassName = `${embedded ? 'relative w-full h-full' : 'fixed inset-0'} flex flex-col bg-background overflow-hidden ${!embedded ? 'safe-area-top-ios' : ''}`;

  return (
    <div
      className={rootClassName}
      style={{ overscrollBehavior: 'none', touchAction: 'pan-x' }}
    >
      
      
      {/* Header */}
      <header className="pt-4 pb-3 px-4 flex items-center justify-between">
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
          <h1 className="text-2xl font-display font-bold tracking-[-0.04em] uppercase text-foreground">Daily Plan</h1>
        </div>
        
        <div className="flex items-center gap-1">
          {/* Add Event Button */}
          <motion.button
            data-tutorial="add-event"
            onClick={() => {
              setQuickAddTitle('');
              setQuickAddError('');
              const now = new Date();
              const currentHour = now.getHours();
              const hour12 = currentHour === 0 ? 12 : currentHour > 12 ? currentHour - 12 : currentHour;
              setQuickAddStartHour(hour12);
              setQuickAddStartMinute(Math.floor(now.getMinutes() / 15) * 15);
              setQuickAddStartPeriod(currentHour >= 12 ? 'PM' : 'AM');
              const nextHour = currentHour + 1;
              const endHour12 = nextHour === 0 ? 12 : nextHour > 12 ? nextHour - 12 : nextHour;
              setQuickAddEndHour(nextHour > 24 ? 12 : endHour12 > 12 ? endHour12 - 12 || 12 : endHour12);
              setQuickAddEndMinute(Math.floor(now.getMinutes() / 15) * 15);
              setQuickAddEndPeriod(nextHour >= 12 && nextHour < 24 ? 'PM' : 'AM');
              setShowQuickAddDialog(true);
              setTimeout(() => quickAddInputRef.current?.focus(), 100);
            }}
            className="p-3.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200"
            aria-label="Add event"
          >
            <Plus className="w-5 h-5" />
          </motion.button>
        </div>
      </header>

      {/* Clock Content */}
      <main className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden pb-20">
        {/* Date Navigation - positioned higher with larger text */}
        <div className="flex items-center gap-3 mb-6 -mt-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => navigateDay(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[120px]">
            <p className="text-2xl font-bold text-foreground">{dateLabel}</p>
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

        {/* Circular Timeline - larger for better visibility */}
        <div 
          className="relative flex-shrink-0 w-[min(85vw,380px)] h-[min(85vw,380px)]"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <CircularTimeline
            blocks={scheduleBlocks}
            todos={[]}
            timeRange={timeRange}
            clockPeriod={clockPeriod}
            compact
            previewBlock={previewBlock}
            onAddEvent={handleAddEvent}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
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
          className="flex-shrink-0 mt-10 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          {timeRange} view
        </button>

        {/* AM/PM Toggle for 12h mode - below the view toggle */}
        {timeRange === "12h" && (
          <div className="flex gap-1 bg-muted/60 backdrop-blur-sm rounded-full p-0.5 border border-border mt-3">
            <button
              onClick={() => setClockPeriod('AM')}
              className={`px-4 py-1.5 text-sm font-bold rounded-full transition-all ${
                clockPeriod === 'AM'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              AM
            </button>
            <button
              onClick={() => setClockPeriod('PM')}
              className={`px-4 py-1.5 text-sm font-bold rounded-full transition-all ${
                clockPeriod === 'PM'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              PM
            </button>
          </div>
        )}
      </main>

       {/* Quick Add Event Dialog - Centered Modal Style */}
      <AnimatePresence>
        {showQuickAddDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
             className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ touchAction: 'auto' }}
            onClick={handleCloseQuickAdd}
          >
             {/* Overlay */}
             <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

            <motion.div
               initial={{ scale: 0.9, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.9, opacity: 0, y: 20 }}
               transition={{ type: "spring", damping: 25, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
               className="relative bg-card border border-border rounded-lg shadow-2xl p-5 w-[300px] max-w-[90%]"
              style={{ touchAction: 'auto' }}
            >
               {/* Header */}
               <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                   <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                     <Calendar className="w-5 h-5 text-primary" />
                  </div>
                   <p className="text-base font-semibold text-foreground">Add Event</p>
                </div>
                 <button
                   onClick={handleCloseQuickAdd}
                   className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                   aria-label="Close"
                 >
                   <X className="w-4 h-4" />
                 </button>
               </div>

               {/* Title Input */}
               <div className="mb-4">
                 <label className="text-xs font-medium text-muted-foreground mb-2 block">Event Title</label>
                 <input
                   ref={quickAddInputRef}
                   type="text"
                   value={quickAddTitle}
                   onChange={(e) => {
                     setQuickAddTitle(e.target.value);
                     if (quickAddError) setQuickAddError('');
                   }}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       e.preventDefault();
                       handleQuickAddSubmit();
                     }
                     if (e.key === 'Escape') {
                       handleCloseQuickAdd();
                     }
                   }}
                   placeholder="Event name..."
                   className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                 />
               </div>

               {/* Start Time */}
               <div className="mb-3">
                 <label className="text-xs font-medium text-muted-foreground mb-2 block">Start Time</label>
                 <TimeWheelPicker
                   hour={quickAddStartHour}
                   minute={quickAddStartMinute}
                   period={quickAddStartPeriod}
                   onHourChange={(newHour) => {
                     setQuickAddStartHour(newHour);
                     // Auto-adjust end time if needed
                     const newStart24 = to24Hour(newHour, quickAddStartPeriod);
                     const currentEnd24 = to24Hour(quickAddEndHour, quickAddEndPeriod);
                     if (newStart24 >= currentEnd24) {
                       const newEnd24 = Math.min(newStart24 + 1, 23);
                       const newEndHour12 = newEnd24 === 0 ? 12 : newEnd24 > 12 ? newEnd24 - 12 : newEnd24;
                       setQuickAddEndHour(newEndHour12);
                       setQuickAddEndPeriod(newEnd24 >= 12 ? 'PM' : 'AM');
                     }
                     if (quickAddError) setQuickAddError('');
                   }}
                   onMinuteChange={(newMinute) => {
                     setQuickAddStartMinute(newMinute);
                     if (quickAddError) setQuickAddError('');
                   }}
                   onPeriodChange={(newPeriod) => {
                     setQuickAddStartPeriod(newPeriod);
                     // Auto-adjust end period if same hour selected
                     const newStart24 = to24Hour(quickAddStartHour, newPeriod);
                     const currentEnd24 = to24Hour(quickAddEndHour, quickAddEndPeriod);
                     if (newStart24 >= currentEnd24) {
                       setQuickAddEndPeriod(newPeriod);
                       if (quickAddStartHour >= quickAddEndHour) {
                         const newEnd24 = Math.min(newStart24 + 1, 23);
                         const newEndHour12 = newEnd24 === 0 ? 12 : newEnd24 > 12 ? newEnd24 - 12 : newEnd24;
                         setQuickAddEndHour(newEndHour12);
                         setQuickAddEndPeriod(newEnd24 >= 12 ? 'PM' : 'AM');
                       }
                     }
                     if (quickAddError) setQuickAddError('');
                   }}
                 />
               </div>

               {/* End Time */}
               <div className="mb-4">
                 <label className="text-xs font-medium text-muted-foreground mb-2 block">End Time</label>
                 <TimeWheelPicker
                   hour={quickAddEndHour}
                   minute={quickAddEndMinute}
                   period={quickAddEndPeriod}
                   onHourChange={(newHour) => {
                     setQuickAddEndHour(newHour);
                     if (quickAddError) setQuickAddError('');
                   }}
                   onMinuteChange={(newMinute) => {
                     setQuickAddEndMinute(newMinute);
                     if (quickAddError) setQuickAddError('');
                   }}
                   onPeriodChange={(newPeriod) => {
                     setQuickAddEndPeriod(newPeriod);
                     if (quickAddError) setQuickAddError('');
                   }}
                 />
               </div>

               {/* Error Message */}
               {quickAddError && (
                 <p className="text-xs text-destructive mb-3">{quickAddError}</p>
               )}

               {/* Action Buttons */}
               <div className="flex gap-2">
                 <button
                   onClick={handleCloseQuickAdd}
                   className="flex-1 py-2.5 rounded-md bg-secondary text-foreground/80 hover:text-foreground text-sm font-medium transition-colors"
                 >
                   Cancel
                 </button>
                 <button
                   onClick={handleQuickAddSubmit}
                   className="flex-1 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                 >
                   Add Event
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!embedded && <BottomNavigation />}
    </div>
  );
}
