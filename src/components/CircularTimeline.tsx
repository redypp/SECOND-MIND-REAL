import { useState, useCallback, useRef, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Calendar, CheckSquare, Clock, ChevronUp, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface TimeBlock {
  id: number;
  label: string;
  startHour: number;
  duration: number;
  color: string;
  itemId?: string;
  isCalendarEvent?: boolean;
}

interface TodoBubble {
  id: string;
  itemId: string;
  label: string;
  description?: string;
  completed: boolean;
  color: string;
}

interface PreviewBlock {
  startHour: number;
  endHour: number;
  label?: string;
}

interface CircularTimelineProps {
  blocks: TimeBlock[];
  todos?: TodoBubble[];
  timeRange: "24h" | "12h";
  clockPeriod?: "AM" | "PM";
  compact?: boolean;
  previewBlock?: PreviewBlock;
  onToggleTodo?: (itemId: string) => void;
  onAddEvent?: (startHour: number, endHour: number, data: { title: string; type: 'event' | 'todo' }) => void;
  onUpdateEvent?: (itemId: string, updates: { startHour?: number; duration?: number; label?: string }) => void;
  onDeleteEvent?: (itemId: string) => void;
  onUpdateTodo?: (itemId: string, updates: { label: string }) => void;
  onDeleteTodo?: (itemId: string) => void;
}

// Minimal color scheme - monochrome grey shades only
// Generate unique grey shades for each event based on index
const getEventColors = (index: number) => {
  // Cycle through different grey lightness values (25% to 50% in steps)
  const greyShades = [25, 32, 38, 45, 28, 35, 42, 30, 37, 48];
  const lightness = greyShades[index % greyShades.length];
  return {
    fill: `hsl(0 0% ${lightness}% / 0.9)`,
    stroke: `hsl(0 0% ${lightness + 10}%)`,
    solid: `hsl(0 0% ${lightness + 5}%)`,
  };
};

const CircularTimeline = ({ blocks, todos = [], timeRange, clockPeriod: clockPeriodProp, compact = false, previewBlock, onToggleTodo, onAddEvent, onUpdateEvent, onDeleteEvent, onUpdateTodo, onDeleteTodo }: CircularTimelineProps) => {
  const isMobile = useIsMobile();
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [selectedTodo, setSelectedTodo] = useState<TodoBubble | null>(null);
  const [showEditTodoDialog, setShowEditTodoDialog] = useState(false);
  const [editTodoLabel, setEditTodoLabel] = useState("");
  const [dragMode, setDragMode] = useState<'move' | 'resize-end' | null>(null);
  const [dragStartHour, setDragStartHour] = useState<number>(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addDialogStartHour, setAddDialogStartHour] = useState<number>(9);
  const [addDialogStartMinute, setAddDialogStartMinute] = useState<number>(0);
  const [addDialogStartPeriod, setAddDialogStartPeriod] = useState<'AM' | 'PM'>('AM');
  const [addDialogEndHour, setAddDialogEndHour] = useState<number>(10);
  const [addDialogEndMinute, setAddDialogEndMinute] = useState<number>(0);
  const [addDialogEndPeriod, setAddDialogEndPeriod] = useState<'AM' | 'PM'>('AM');
  const [addDialogTitle, setAddDialogTitle] = useState("");
  const [addDialogType, setAddDialogType] = useState<'event' | 'todo'>('event');
  // Single-step dialog - no multi-step needed
  const [addDialogTimeError, setAddDialogTimeError] = useState<string>("");
  const [editEventLabel, setEditEventLabel] = useState("");
  // Use prop if provided, otherwise default based on current time
  const clockPeriod = clockPeriodProp ?? (new Date().getHours() >= 12 ? 'PM' : 'AM');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [draggingTodo, setDraggingTodo] = useState<string | null>(null);
  const [todoPositions, setTodoPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [holdingBlock, setHoldingBlock] = useState<TimeBlock | null>(null);
  const [completingTodos, setCompletingTodos] = useState<Set<string>>(new Set());
  const [showEventDetail, setShowEventDetail] = useState<TimeBlock | null>(null);
  const [editingEventTime, setEditingEventTime] = useState(false);
  const [editStartHour, setEditStartHour] = useState(0);
  const [editStartMinute, setEditStartMinute] = useState(0);
  const [editDurationHours, setEditDurationHours] = useState(1);
  const [editDurationMinutes, setEditDurationMinutes] = useState(0);
  const tooltipTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const size = compact ? 280 : 380;
  const center = size / 2;
  const outerRadius = compact ? 125 : 165;
  const innerRadius = compact ? 75 : 100;
  const segmentGap = 0.3; // Small gap between segments in degrees
  const hoursInDay = timeRange === "24h" ? 24 : 12;

  // Convert hour to angle (0 is at top, clockwise)
  const hourToAngle = (hour: number) => {
    const normalizedHour = hour % hoursInDay;
    return (normalizedHour / hoursInDay) * 360 - 90;
  };

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  // Convert angle to hour
  const angleToHour = useCallback((angleDeg: number) => {
    let normalized = ((angleDeg + 90) % 360 + 360) % 360;
    return (normalized / 360) * hoursInDay;
  }, [hoursInDay]);


  // Helper to calculate hour from pointer position
  const getHourFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * size - center;
    const y = ((clientY - rect.top) / rect.height) * size - center;
    const angleDeg = Math.atan2(y, x) * (180 / Math.PI);
    return angleToHour(angleDeg);
  }, [size, center, angleToHour]);

  // Calculate hour delta with wrapping support for seamless circular movement
  const calculateWrappedDelta = useCallback((current: number, previous: number) => {
    let delta = current - previous;
    if (delta > hoursInDay / 2) {
      delta -= hoursInDay;
    } else if (delta < -hoursInDay / 2) {
      delta += hoursInDay;
    }
    return delta;
  }, [hoursInDay]);

  // Handle pointer movement on the clock - DISABLED for dragging events
  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Drag functionality removed - events are edited via tap
  }, []);

  // Handle clicking on a block - open edit dialog
  const handleBlockClick = useCallback((block: TimeBlock, e: React.MouseEvent) => {
    e.stopPropagation();
    if (block.itemId) {
      // Initialize edit states
      const startH = Math.floor(block.startHour);
      const startM = Math.round((block.startHour % 1) * 60);
      const durH = Math.floor(block.duration);
      const durM = Math.round((block.duration % 1) * 60);
      setEditStartHour(startH);
      setEditStartMinute(startM);
      setEditDurationHours(durH);
      setEditDurationMinutes(durM);
      setEditEventLabel(block.label);
      setShowEventDetail(block);
    }
  }, []);

  // Handle pointer down on a block - just record position for tap detection
  const handleBlockPointerDown = useCallback((block: TimeBlock, e: React.PointerEvent) => {
    e.stopPropagation();
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleBlockPointerUp = useCallback((block: TimeBlock, e: React.PointerEvent) => {
    // Check if this was a tap (minimal movement)
    if (pointerStartRef.current) {
      const dx = Math.abs(e.clientX - pointerStartRef.current.x);
      const dy = Math.abs(e.clientY - pointerStartRef.current.y);
      const wasTap = dx < 10 && dy < 10;
      
      if (wasTap && block.itemId) {
        // Initialize edit states
        const startH = Math.floor(block.startHour);
        const startM = Math.round((block.startHour % 1) * 60);
        const durH = Math.floor(block.duration);
        const durM = Math.round((block.duration % 1) * 60);
        setEditStartHour(startH);
        setEditStartMinute(startM);
        setEditDurationHours(durH);
        setEditDurationMinutes(durM);
        setEditEventLabel(block.label);
        setShowEventDetail(block);
      }
      pointerStartRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Deselect when clicking on empty area
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * size - center;
      const y = ((e.clientY - rect.top) / rect.height) * size - center;
      
      const distance = Math.sqrt(x * x + y * y);
      
      if (distance < innerRadius - 30 || distance > outerRadius + 40) {
        setSelectedBlock(null);
      }
    }
  }, [size, center, innerRadius, outerRadius]);

  const handlePointerUp = useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  const handleDeleteBlock = useCallback((block: TimeBlock) => {
    if (block.itemId && onDeleteEvent) {
      onDeleteEvent(block.itemId);
      setSelectedBlock(null);
    }
  }, [onDeleteEvent]);

  // Helper to convert 12h format to 24h
  const convert12hTo24h = useCallback((hour: number, period: 'AM' | 'PM') => {
    if (timeRange === "24h") return hour;
    if (period === 'AM') {
      return hour === 12 ? 0 : hour;
    } else {
      return hour === 12 ? 12 : hour + 12;
    }
  }, [timeRange]);

  const handleAddSubmit = useCallback(() => {
    if (!addDialogTitle.trim()) {
      setAddDialogTimeError("Please enter an event name");
      return;
    }
    
    // Convert to 24h format for comparison and storage
    const start24h = timeRange === "12h" 
      ? convert12hTo24h(addDialogStartHour, addDialogStartPeriod)
      : addDialogStartHour;
    const end24h = timeRange === "12h"
      ? convert12hTo24h(addDialogEndHour, addDialogEndPeriod)
      : addDialogEndHour;
    
    const startTotal = start24h * 60 + addDialogStartMinute;
    const endTotal = end24h * 60 + addDialogEndMinute;
    
    if (endTotal <= startTotal) {
      setAddDialogTimeError("End time must be after start time");
      return;
    }
    
    if (onAddEvent) {
      const startHour = start24h + addDialogStartMinute / 60;
      const endHour = end24h + addDialogEndMinute / 60;
      onAddEvent(startHour, endHour, { title: addDialogTitle.trim(), type: addDialogType });
    }
    setShowAddDialog(false);
    setAddDialogTitle("");
    setAddDialogTimeError("");
  }, [addDialogTitle, addDialogStartHour, addDialogStartMinute, addDialogStartPeriod, addDialogEndHour, addDialogEndMinute, addDialogEndPeriod, addDialogType, onAddEvent, timeRange, convert12hTo24h]);

  const handleCloseAddDialog = useCallback(() => {
    setShowAddDialog(false);
    setAddDialogTitle("");
    setAddDialogTimeError("");
  }, []);

  // Single tap on todo opens edit dialog
  const handleTodoClick = useCallback((todo: TodoBubble) => {
    setSelectedTodo(todo);
    setEditTodoLabel(todo.label);
    setShowEditTodoDialog(true);
  }, []);

  const handleTodoEditSubmit = useCallback(() => {
    if (selectedTodo && editTodoLabel.trim() && onUpdateTodo) {
      onUpdateTodo(selectedTodo.itemId, { label: editTodoLabel.trim() });
    }
    setShowEditTodoDialog(false);
    setSelectedTodo(null);
    setEditTodoLabel("");
  }, [selectedTodo, editTodoLabel, onUpdateTodo]);

  const handleTodoDelete = useCallback(() => {
    if (selectedTodo && onDeleteTodo) {
      onDeleteTodo(selectedTodo.itemId);
    }
    setShowEditTodoDialog(false);
    setSelectedTodo(null);
    setEditTodoLabel("");
  }, [selectedTodo, onDeleteTodo]);

  // Position todos around the clock (outside the ring)
  const getTodoBubblePosition = useCallback((todoId: string, index: number, total: number) => {
    // Check if there's a saved position for this todo
    if (todoPositions[todoId]) {
      return todoPositions[todoId];
    }
    
    const clockSize = compact ? 280 : 400;
    const ctr = clockSize / 2;
    // Position further outside the clock
    const orbitRadius = compact ? 190 : 280;
    
    // Distribute evenly around the bottom half
    const startAngle = 30;
    const endAngle = 150;
    const angleSpan = endAngle - startAngle;
    const angleStep = total > 1 ? angleSpan / (total - 1) : 0;
    const angleDeg = startAngle + (index * angleStep);
    const angle = angleDeg * (Math.PI / 180);
    
    return {
      x: ctr + orbitRadius * Math.cos(angle),
      y: ctr + orbitRadius * Math.sin(angle),
    };
  }, [compact, todoPositions]);


  // Create arc path for a time block
  const createArcPath = (startHour: number, duration: number) => {
    const startAngle = hourToAngle(startHour);
    const endAngle = hourToAngle(startHour + duration);
    
    const startAngleRad = toRadians(startAngle);
    const endAngleRad = toRadians(endAngle);

    const x1Outer = center + outerRadius * Math.cos(startAngleRad);
    const y1Outer = center + outerRadius * Math.sin(startAngleRad);
    const x2Outer = center + outerRadius * Math.cos(endAngleRad);
    const y2Outer = center + outerRadius * Math.sin(endAngleRad);

    const x1Inner = center + innerRadius * Math.cos(startAngleRad);
    const y1Inner = center + innerRadius * Math.sin(startAngleRad);
    const x2Inner = center + innerRadius * Math.cos(endAngleRad);
    const y2Inner = center + innerRadius * Math.sin(endAngleRad);

    const largeArc = duration > hoursInDay / 2 ? 1 : 0;

    return `
      M ${x1Outer} ${y1Outer}
      A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}
      L ${x2Inner} ${y2Inner}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1Inner} ${y1Inner}
      Z
    `;
  };

  // Generate hour markers for all hours
  const hourMarkers = Array.from({ length: hoursInDay }, (_, i) => {
    const angle = toRadians(hourToAngle(i));
    const markerRadius = outerRadius + 8;
    const labelRadius = outerRadius + 22;
    // For 12h mode: emphasize 12, 3, 6, 9. For 24h mode: 0, 6, 12, 18
    const isMainHour = timeRange === "12h" 
      ? (i === 0 || i === 3 || i === 6 || i === 9)
      : (i % 6 === 0);
    
     // Format hour label - use 12-hour format for both modes
     // For 12h mode: convert 0 to 12, others stay as is (1-11)
     // For 24h mode: convert to 12-hour format (12, 1, 2, ... 11, 12, 1, 2, ... 11)
     let displayHour: number;
     if (timeRange === "12h") {
       displayHour = i === 0 ? 12 : i;
     } else {
       // 24h mode: use 12-hour format repeating twice
       // 0 -> 12, 1-11 -> 1-11, 12 -> 12, 13-23 -> 1-11
       const hourMod12 = i % 12;
       displayHour = hourMod12 === 0 ? 12 : hourMod12;
     }
    
    return {
      x: center + markerRadius * Math.cos(angle),
      y: center + markerRadius * Math.sin(angle),
      labelX: center + labelRadius * Math.cos(angle),
      labelY: center + labelRadius * Math.sin(angle),
      hour: displayHour,
      isMainHour,
    };
  });

  // Generate 30-minute tick markers (between hours)
  const halfHourMarkers = Array.from({ length: hoursInDay }, (_, i) => {
    const angle = toRadians(hourToAngle(i + 0.5)); // Half hour position
    const tickOuterRadius = outerRadius + 3;
    const tickInnerRadius = outerRadius - 3;
    
    return {
      x1: center + tickInnerRadius * Math.cos(angle),
      y1: center + tickInnerRadius * Math.sin(angle),
      x2: center + tickOuterRadius * Math.cos(angle),
      y2: center + tickOuterRadius * Math.sin(angle),
    };
  });

  const formatTime = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.round((hour % 1) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration);
    const minutes = Math.round((duration - hours) * 60);
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full select-none" 
      style={{ touchAction: 'none' }} // Completely disable browser touch actions
      onTouchStart={(e) => {
        // Prevent page scrolling when touching the clock area
        e.stopPropagation();
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-full overflow-visible"
        style={{ 
          filter: compact ? undefined : "drop-shadow(0 0 40px hsl(240 10% 10% / 0.8))",
          cursor: dragMode ? 'grabbing' : 'grab',
          touchAction: 'none', // Also set on SVG for complete coverage
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <radialGradient id="backgroundGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--card))" />
            <stop offset="100%" stopColor="hsl(var(--background))" />
          </radialGradient>
          <radialGradient id="fingerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(175 60% 55% / 0.9)" />
            <stop offset="50%" stopColor="hsl(175 60% 55% / 0.4)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="strongGlow">
            <feGaussianBlur stdDeviation="8" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer background ring - subtle */}
        {!compact && (
          <circle
            cx={center}
            cy={center}
            r={outerRadius + 3}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={1}
            strokeOpacity={0.3}
          />
        )}

        {/* Base ring - thicker, more prominent */}
        <circle
          cx={center}
          cy={center}
          r={(outerRadius + innerRadius) / 2}
          fill="none"
          stroke="hsl(var(--muted) / 0.4)"
          strokeWidth={outerRadius - innerRadius}
          style={{ transition: 'stroke-opacity 0.2s' }}
        />
        
        {/* Inner ring edge */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="hsl(var(--background))"
          stroke="hsl(var(--border))"
          strokeWidth={1}
          strokeOpacity={0.2}
        />

        {/* Hour markers with numbers for all hours */}
        {hourMarkers.map((marker, i) => (
          <g key={i}>
            {/* Small dot marker */}
            <circle
              cx={marker.x}
              cy={marker.y}
              r={marker.isMainHour ? (compact ? 2 : 3) : (compact ? 1 : 1.5)}
              fill={marker.isMainHour ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground) / 0.5)"}
            />
            {/* Hour label - show all hours */}
            <text
              x={marker.labelX}
              y={marker.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={marker.isMainHour ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
              fontSize={compact ? "8" : (marker.isMainHour ? "11" : "9")}
              fontWeight={marker.isMainHour ? "600" : "400"}
              fontFamily="system-ui, -apple-system, sans-serif"
            >
             {marker.hour}
            </text>
          </g>
        ))}

        {/* 30-minute tick markers */}
        {halfHourMarkers.map((tick, i) => (
          <line
            key={`half-${i}`}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="hsl(var(--muted-foreground) / 0.3)"
            strokeWidth={compact ? 1 : 1.5}
            strokeLinecap="round"
          />
        ))}

        {/* Time blocks with labels - filter for 12h mode by AM/PM */}
        {blocks.filter((block) => {
          if (timeRange === "24h") return true;
          // In 12h mode, only show blocks in the current AM/PM period
          const blockStartHour = block.startHour % 24;
          const blockEndHour = (block.startHour + block.duration) % 24;
          const periodStart = clockPeriod === 'PM' ? 12 : 0;
          const periodEnd = clockPeriod === 'PM' ? 24 : 12;
          // Block must overlap with the current period
          const startsInPeriod = blockStartHour >= periodStart && blockStartHour < periodEnd;
          const endsInPeriod = blockEndHour > periodStart && blockEndHour <= periodEnd;
          return startsInPeriod || endsInPeriod;
        }).map((block, blockIndex) => {
          // In 12h mode, clamp block to current period to avoid visual overflow
          let displayStartHour = block.startHour;
          let displayDuration = block.duration;
          if (timeRange === "12h") {
            const periodStart = clockPeriod === 'PM' ? 12 : 0;
            const periodEnd = clockPeriod === 'PM' ? 24 : 12;
            const blockEnd = block.startHour + block.duration;
            displayStartHour = Math.max(block.startHour, periodStart);
            const clampedEnd = Math.min(blockEnd, periodEnd);
            displayDuration = clampedEnd - displayStartHour;
            // Skip blocks that are too small to render after clamping
            if (displayDuration < 0.08) return null;
          }
          // Skip blocks with near-zero duration
          if (displayDuration < 0.08) return null;
          // Always use grey shades - each event gets a unique grey based on index
          const colors = getEventColors(blockIndex);
          const isSelected = selectedBlock?.id === block.id;
          const isDraggingThis = holdingBlock?.id === block.id;

           // Calculate position for label (at the middle of the arc)
          const midAngle = toRadians(hourToAngle(displayStartHour + displayDuration / 2));
          const labelRadius = (outerRadius + innerRadius) / 2;
          const labelX = center + labelRadius * Math.cos(midAngle);
          const labelY = center + labelRadius * Math.sin(midAngle);
          
          // Calculate rotation for text to follow the arc
          const textRotation = (hourToAngle(displayStartHour + displayDuration / 2) + 90) % 360;
          const flipText = textRotation > 90 && textRotation < 270;
          const adjustedRotation = flipText ? textRotation + 180 : textRotation;

          // Calculate position for delete button (outside the ring)
          const deleteButtonRadius = outerRadius + 16;
          const deleteX = center + deleteButtonRadius * Math.cos(midAngle);
          const deleteY = center + deleteButtonRadius * Math.sin(midAngle);

          // Calculate position for resize handle (at the end of the arc)
          const endAngle = toRadians(hourToAngle(displayStartHour + displayDuration));
          const handleRadius = (outerRadius + innerRadius) / 2;
          const resizeX = center + handleRadius * Math.cos(endAngle);
          const resizeY = center + handleRadius * Math.sin(endAngle);
          
          // Only show controls when selected and not dragging
          const showControls = isSelected && !isDraggingThis && block.itemId;
          
          // Calculate available arc length for text sizing
          const arcLength = (displayDuration / hoursInDay) * 2 * Math.PI * labelRadius;
          const ringThickness = outerRadius - innerRadius;

          const baseFontSize = compact ? 9 : 11;
          // Conservative char width estimate (~0.6× font size for system-ui)
          const charWidth = baseFontSize * 0.6;
          const maxCharsPerLine = Math.max(3, Math.floor(arcLength / charWidth));

          // Word-wrap helper — always wraps to fit arc width, truncates words that
          // are longer than one full line so text never overflows the arc boundary.
          const wrapText = (text: string, maxChars: number): string[] => {
            const words = text.split(' ');
            const lines: string[] = [];
            let current = '';
            for (const word of words) {
              const safeWord = word.length > maxChars
                ? word.slice(0, maxChars - 1) + '…'
                : word;
              const candidate = current ? `${current} ${safeWord}` : safeWord;
              if (candidate.length <= maxChars) {
                current = candidate;
              } else {
                if (current) lines.push(current);
                current = safeWord;
              }
            }
            if (current) lines.push(current);
            return lines;
          };

          // Limit wrapped lines to what fits inside the ring thickness radially
          const lineSpacing = baseFontSize + 2;
          const maxLines = Math.max(1, Math.floor((ringThickness * 0.75) / lineSpacing));
          const rawLines = wrapText(block.label, maxCharsPerLine);
          const textLines = rawLines.slice(0, maxLines);

          // Append ellipsis to last visible line when content was truncated
          if (rawLines.length > maxLines && textLines.length > 0) {
            const last = textLines[textLines.length - 1];
            textLines[textLines.length - 1] = last.length < maxCharsPerLine
              ? last + '…'
              : last.slice(0, maxCharsPerLine - 1) + '…';
          }

          const fontSize = baseFontSize;

          return (
            <g key={block.id}>
              {/* Block arc - cleaner styling with subtle inner stroke */}
              <motion.path
                d={createArcPath(displayStartHour, displayDuration)}

                fill={colors.fill}
                stroke={isSelected || isDraggingThis ? "hsl(var(--primary))" : colors.stroke}
                strokeWidth={isSelected || isDraggingThis ? 2.5 : 1}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  scale: isSelected || isDraggingThis ? 1.02 : 1,
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ 
                  transformOrigin: `${center}px ${center}px`,
                  cursor: isDraggingThis ? 'grabbing' : 'pointer',
                  filter: isSelected ? 'drop-shadow(0 0 8px hsl(var(--primary) / 0.4))' : undefined,
                }}
                onClick={(e) => handleBlockClick(block, e)}
                onPointerDown={(e) => handleBlockPointerDown(block, e)}
                onPointerUp={(e) => handleBlockPointerUp(block, e)}
                onPointerCancel={() => { setHoldingBlock(null); setDragMode(null); pointerStartRef.current = null; }}
              />
              
              {/* Event label on the block - full text with stacking */}
              {displayDuration >= 0.25 && (
                <g
                  transform={`rotate(${adjustedRotation}, ${labelX}, ${labelY})`}
                  style={{ pointerEvents: 'none' }}
                >
                  {textLines.map((line, lineIndex) => {
                    const lineOffset = (lineIndex - (textLines.length - 1) / 2) * lineSpacing;
                    return (
                      <text
                        key={lineIndex}
                        x={labelX}
                        y={labelY + lineOffset}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="hsl(var(--foreground))"
                        fontSize={fontSize}
                        fontWeight="600"
                        fontFamily="system-ui, -apple-system, sans-serif"
                        letterSpacing="0.01em"
                        style={{ 
                          textShadow: '0 1px 2px hsl(var(--background) / 0.9)',
                        }}
                      >
                        {line}
                      </text>
                    );
                  })}
                </g>
              )}
              
              {/* Delete button - shown when selected and not dragging */}
              {showControls && (
                <motion.g
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
                >
                  <circle
                    cx={deleteX}
                    cy={deleteY}
                    r={compact ? 10 : 12}
                    fill="hsl(var(--destructive))"
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBlock(block);
                    }}
                  />
                  <text
                    x={deleteX}
                    y={deleteY + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize={compact ? "12" : "14"}
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    ×
                  </text>
                </motion.g>
              )}

              {/* Resize handle removed - use edit dialog instead */}
            </g>
          );
        }).filter(Boolean)}

        {/* Preview block for add event dialog */}
        {previewBlock && previewBlock.endHour > previewBlock.startHour && (() => {
          const startHour = previewBlock.startHour;
          const duration = previewBlock.endHour - previewBlock.startHour;
          
          // Calculate label position
          const midAngle = toRadians(hourToAngle(startHour + duration / 2));
          const labelRadius = (outerRadius + innerRadius) / 2;
          const labelX = center + labelRadius * Math.cos(midAngle);
          const labelY = center + labelRadius * Math.sin(midAngle);
          
          const textRotation = (hourToAngle(startHour + duration / 2) + 90) % 360;
          const flipText = textRotation > 90 && textRotation < 270;
          const adjustedRotation = flipText ? textRotation + 180 : textRotation;
          
          // Duration label
          const hours = Math.floor(duration);
          const minutes = Math.round((duration - hours) * 60);
          const durationLabel = hours > 0 
            ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`)
            : `${minutes}m`;

          return (
            <g>
              <motion.path
                d={createArcPath(startHour, duration)}
                fill="hsl(var(--primary) / 0.3)"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeDasharray="6 3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                style={{ 
                  transformOrigin: `${center}px ${center}px`,
                }}
              />
              {/* Duration label on preview */}
              {duration >= 0.25 && (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="hsl(var(--primary))"
                  fontSize={compact ? "10" : "12"}
                  fontWeight="700"
                  fontFamily="system-ui, -apple-system, sans-serif"
                  style={{ 
                    pointerEvents: 'none',
                    textShadow: '0 1px 3px hsl(var(--background) / 0.9)',
                  }}
                  transform={`rotate(${adjustedRotation}, ${labelX}, ${labelY})`}
                >
                  {previewBlock.label || durationLabel}
                </text>
              )}
            </g>
          );
        })()}

        {/* Current time indicator - modern minimal line */}
        {(() => {
          const currentHour = currentTime.getHours() + currentTime.getMinutes() / 60;
          const normalizedHour = timeRange === "24h" ? currentHour : currentHour % 12;
          const angle = toRadians(hourToAngle(normalizedHour));
          const lineInnerRadius = innerRadius - 4;
          const lineOuterRadius = outerRadius + 4;
          
          // In 12h mode, only show time indicator if we're in the current AM/PM period
          const currentPeriod = currentTime.getHours() >= 12 ? 'PM' : 'AM';
          const showIndicator = timeRange === "24h" || clockPeriod === currentPeriod;
          
          if (!showIndicator) return null;
          
          return (
            <g>
              {/* Main indicator line */}
              <line
                x1={center + lineInnerRadius * Math.cos(angle)}
                y1={center + lineInnerRadius * Math.sin(angle)}
                x2={center + lineOuterRadius * Math.cos(angle)}
                y2={center + lineOuterRadius * Math.sin(angle)}
                stroke="hsl(var(--destructive))"
                strokeWidth={compact ? 2 : 3}
                strokeLinecap="round"
              />
            </g>
          );
        })()}

        {/* Center area - clean empty space for mantra */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius - 6}
          fill="hsl(var(--background))"
        />
      </svg>

      {/* AM/PM Toggle moved to parent component (ClockPage) */}

      {/* Todo bubbles */}
      <AnimatePresence>
        {todos.map((todo, index) => {
          const pos = getTodoBubblePosition(todo.id, index, todos.length);
          const colors = getEventColors(index);
          const isDraggingThis = draggingTodo === todo.id;
          const isCompleting = completingTodos.has(todo.id);
          
          // Convert position to pixels based on container
          const leftPx = (pos.x / size) * 100;
          const topPx = (pos.y / size) * 100;
          
          return (
            <motion.div
              key={todo.id}
              drag={!isCompleting}
              dragConstraints={containerRef}
              dragMomentum={false}
              dragElastic={0}
              onDragStart={() => setDraggingTodo(todo.id)}
              onDragEnd={(_, info) => {
                if (!containerRef.current) {
                  setDraggingTodo(null);
                  return;
                }

                const rect = containerRef.current.getBoundingClientRect();
                const scaleX = size / rect.width;
                const scaleY = size / rect.height;

                const newX = pos.x + (info.offset.x * scaleX);
                const newY = pos.y + (info.offset.y * scaleY);

                const clampedX = Math.max(30, Math.min(size - 30, newX));
                const clampedY = Math.max(30, Math.min(size - 30, newY));

                setTodoPositions(prev => ({
                  ...prev,
                  [todo.id]: { x: clampedX, y: clampedY }
                }));

                setDraggingTodo(null);
              }}
              transformTemplate={(_, generated) => {
                if (!generated || generated === "none") return "translate(-50%, -50%)";
                return `translate(-50%, -50%) ${generated}`;
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={isCompleting ? {
                opacity: 0,
                scale: 0,
                y: -50,
                rotate: 10,
              } : {
                opacity: 1,
                scale: isDraggingThis ? 1.1 : 1,
                x: 0,
                y: 0,
                rotate: 0,
              }}
              exit={{ opacity: 0, scale: 0, y: -30 }}
              transition={isCompleting ? {
                duration: 0.5,
                ease: [0.4, 0, 0.2, 1],
              } : {
                delay: isDraggingThis ? 0 : 0.3 + index * 0.08,
                type: "spring",
                stiffness: 260,
                damping: 20
              }}
              className="absolute cursor-grab active:cursor-grabbing"
              style={{
                left: `${leftPx}%`,
                top: `${topPx}%`,
                zIndex: isDraggingThis ? 100 : 10,
              }}
              whileDrag={{ scale: 1.15 }}
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => !isDraggingThis && !isCompleting && handleTodoClick(todo)}
                className={`relative flex items-center justify-center px-3 py-1.5 rounded-2xl backdrop-blur-xl transition-all duration-300 cursor-pointer bg-background/80 ${isDraggingThis ? 'shadow-2xl' : ''}`}
                style={{
                  boxShadow: isCompleting
                    ? '0 0 30px hsl(140 70% 50% / 0.6), 0 4px 12px hsl(0 0% 0% / 0.2)'
                    : isDraggingThis
                      ? `0 0 30px ${colors.fill}, 0 8px 20px hsl(0 0% 0% / 0.4)`
                      : `0 0 20px ${colors.fill}, 0 4px 12px hsl(0 0% 0% / 0.2)`,
                  border: `1.5px solid ${isCompleting ? 'hsl(140 70% 50%)' : colors.solid}`,
                  maxWidth: '110px',
                }}
              >
                {isCompleting ? (
                  <motion.div 
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1.2 }}
                    className="flex items-center justify-center"
                  >
                    <Check className="w-4 h-4 text-green-400" strokeWidth={3} />
                  </motion.div>
                ) : (
                  <span 
                    className="text-[11px] font-medium text-center leading-tight"
                    style={{ color: colors.solid }}
                  >
                    {todo.label}
                  </span>
                )}
              </motion.button>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {/* Add Event Dialog - Single Step Form */}
      <AnimatePresence>
        {showAddDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50 bg-background/60 backdrop-blur-sm"
            style={{ touchAction: 'auto' }}
            onClick={handleCloseAddDialog}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-lg shadow-2xl p-5 w-[300px]"
              style={{ touchAction: 'auto' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">Add Event</p>
                    <p className="text-xs text-muted-foreground">Create a new event</p>
                  </div>
                </div>
                <button
                  onClick={handleCloseAddDialog}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Event Name Input - First and Primary */}
              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">What's the event?</label>
                <input
                  type="text"
                  value={addDialogTitle}
                  onChange={(e) => {
                    setAddDialogTitle(e.target.value);
                    if (addDialogTimeError) setAddDialogTimeError("");
                  }}
                  placeholder="Meeting, Lunch, Workout..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddSubmit();
                    }
                    if (e.key === 'Escape') {
                      handleCloseAddDialog();
                    }
                  }}
                  className="w-full px-3 py-3 bg-muted/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Time Selection Row */}
              <div className="flex gap-3 mb-4">
                {/* Start Time */}
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Start</label>
                  <div className="flex items-center gap-1 p-2 rounded-lg bg-muted/30 border border-border">
                    <select
                      value={addDialogStartHour}
                      onChange={(e) => {
                        const newHour = parseInt(e.target.value);
                        setAddDialogStartHour(newHour);
                        // Auto-adjust end time to be 1 hour after if needed (same period)
                        if (timeRange === "12h") {
                          // In 12h mode, just adjust within the display range
                          if (addDialogStartPeriod === addDialogEndPeriod && newHour >= addDialogEndHour) {
                            setAddDialogEndHour(Math.min(newHour + 1, 12));
                            if (newHour + 1 > 12) {
                              setAddDialogEndHour(1);
                              setAddDialogEndPeriod(addDialogStartPeriod === 'AM' ? 'PM' : 'AM');
                            }
                          }
                        } else if (newHour >= addDialogEndHour) {
                          setAddDialogEndHour(Math.min(newHour + 1, hoursInDay - 1));
                        }
                        if (addDialogTimeError) setAddDialogTimeError("");
                      }}
                      className="flex-1 px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {timeRange === "12h" 
                        ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))
                        : Array.from({ length: hoursInDay }, (_, i) => (
                            <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                          ))
                      }
                    </select>
                    <span className="text-foreground font-medium text-sm">:</span>
                    <select
                      value={addDialogStartMinute}
                      onChange={(e) => {
                        setAddDialogStartMinute(parseInt(e.target.value));
                        if (addDialogTimeError) setAddDialogTimeError("");
                      }}
                      className="w-14 px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {[0, 15, 30, 45].map((m) => (
                        <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                    {timeRange === "12h" && (
                      <select
                        value={addDialogStartPeriod}
                        onChange={(e) => {
                          setAddDialogStartPeriod(e.target.value as 'AM' | 'PM');
                          if (addDialogTimeError) setAddDialogTimeError("");
                        }}
                        className="w-14 px-1 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    )}
                  </div>
                </div>

                {/* End Time */}
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">End</label>
                  <div className="flex items-center gap-1 p-2 rounded-lg bg-muted/30 border border-border">
                    <select
                      value={addDialogEndHour}
                      onChange={(e) => {
                        setAddDialogEndHour(parseInt(e.target.value));
                        if (addDialogTimeError) setAddDialogTimeError("");
                      }}
                      className="flex-1 px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {timeRange === "12h"
                        ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))
                        : Array.from({ length: hoursInDay }, (_, i) => (
                            <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                          ))
                      }
                    </select>
                    <span className="text-foreground font-medium text-sm">:</span>
                    <select
                      value={addDialogEndMinute}
                      onChange={(e) => {
                        setAddDialogEndMinute(parseInt(e.target.value));
                        if (addDialogTimeError) setAddDialogTimeError("");
                      }}
                      className="w-14 px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {[0, 15, 30, 45].map((m) => (
                        <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                    {timeRange === "12h" && (
                      <select
                        value={addDialogEndPeriod}
                        onChange={(e) => {
                          setAddDialogEndPeriod(e.target.value as 'AM' | 'PM');
                          if (addDialogTimeError) setAddDialogTimeError("");
                        }}
                        className="w-14 px-1 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Type Toggle */}
              <div className="flex gap-1 mb-4">
                <button
                  onClick={() => setAddDialogType('event')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                    addDialogType === 'event'
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-muted/30 text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Event
                </button>
                <button
                  onClick={() => setAddDialogType('todo')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                    addDialogType === 'todo'
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-muted/30 text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Todo
                </button>
              </div>

              {/* Error Message */}
              {addDialogTimeError && (
                <p className="text-xs text-destructive mb-3">{addDialogTimeError}</p>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleCloseAddDialog}
                  className="flex-1 py-3 rounded-lg bg-muted/30 text-muted-foreground text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSubmit}
                  className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Add Event
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Todo Dialog */}
      <AnimatePresence>
        {showEditTodoDialog && selectedTodo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50"
            onClick={() => {
              setShowEditTodoDialog(false);
              setSelectedTodo(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-lg shadow-2xl p-4 w-[240px]"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-primary/15 flex items-center justify-center">
                    <CheckSquare className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Edit Todo</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowEditTodoDialog(false);
                    setSelectedTodo(null);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Title Input */}
              <input
                type="text"
                placeholder="Todo name..."
                value={editTodoLabel}
                onChange={(e) => setEditTodoLabel(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTodoEditSubmit();
                  } else if (e.key === 'Escape') {
                    setShowEditTodoDialog(false);
                    setSelectedTodo(null);
                  }
                }}
                className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 mb-3"
              />

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleTodoDelete}
                  className="flex-1 py-2.5 rounded-md bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors border border-destructive/20"
                >
                  Delete
                </button>
                <button
                  onClick={handleTodoEditSubmit}
                  disabled={!editTodoLabel.trim()}
                  className="flex-1 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event Edit Popup - Full Edit Mode */}
      <AnimatePresence>
        {showEventDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50 bg-background/60 backdrop-blur-sm"
            style={{ touchAction: 'auto' }}
            onClick={() => {
              setShowEventDetail(null);
              setEditingEventTime(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-lg shadow-2xl p-5 w-[300px] max-w-[90%]"
              style={{ touchAction: 'auto' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-base font-semibold text-foreground">Edit Event</p>
                </div>
                <button
                  onClick={() => {
                    setShowEventDetail(null);
                    setEditingEventTime(false);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Title Input */}
              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Event Title</label>
                <input
                  type="text"
                  value={editEventLabel}
                  onChange={(e) => setEditEventLabel(e.target.value)}
                  placeholder="Event name..."
                  className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Start Time */}
              <div className="mb-3">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Start Time</label>
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/30 border border-border">
                  <select
                    value={editStartHour}
                    onChange={(e) => setEditStartHour(parseInt(e.target.value))}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {Array.from({ length: hoursInDay }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-foreground font-medium">:</span>
                  <select
                    value={editStartMinute}
                    onChange={(e) => setEditStartMinute(parseInt(e.target.value))}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* End Time */}
              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">End Time</label>
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/30 border border-border">
                  <select
                    value={Math.floor((editStartHour + editDurationHours + (editStartMinute + editDurationMinutes) / 60) % hoursInDay)}
                    onChange={(e) => {
                      const newEndHour = parseInt(e.target.value);
                      const currentEndMinute = (editStartMinute + editDurationMinutes) % 60;
                      const startTotal = editStartHour * 60 + editStartMinute;
                      const endTotal = newEndHour * 60 + currentEndMinute;
                      const newDurationTotal = endTotal > startTotal ? endTotal - startTotal : (endTotal + hoursInDay * 60) - startTotal;
                      setEditDurationHours(Math.floor(newDurationTotal / 60));
                      setEditDurationMinutes(newDurationTotal % 60);
                    }}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {Array.from({ length: hoursInDay }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-foreground font-medium">:</span>
                  <select
                    value={(editStartMinute + editDurationMinutes) % 60}
                    onChange={(e) => {
                      const newEndMinute = parseInt(e.target.value);
                      const currentEndHour = Math.floor((editStartHour + editDurationHours + (editStartMinute + editDurationMinutes) / 60) % hoursInDay);
                      const startTotal = editStartHour * 60 + editStartMinute;
                      const endTotal = currentEndHour * 60 + newEndMinute;
                      const newDurationTotal = endTotal > startTotal ? endTotal - startTotal : Math.max(15, (endTotal + hoursInDay * 60) - startTotal);
                      setEditDurationHours(Math.floor(newDurationTotal / 60));
                      setEditDurationMinutes(newDurationTotal % 60);
                    }}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (showEventDetail.itemId && onDeleteEvent) {
                      onDeleteEvent(showEventDetail.itemId);
                    }
                    setShowEventDetail(null);
                    setEditingEventTime(false);
                  }}
                  className="flex-1 py-2.5 rounded-md bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors border border-destructive/20"
                >
                  Delete
                </button>
                <button
                  onClick={() => {
                    if (showEventDetail.itemId && onUpdateEvent) {
                      const newStartHour = editStartHour + editStartMinute / 60;
                      const newDuration = editDurationHours + editDurationMinutes / 60;
                      const finalDuration = Math.max(0.25, newDuration);
                      onUpdateEvent(showEventDetail.itemId, { 
                        startHour: newStartHour, 
                        duration: finalDuration,
                        label: editEventLabel.trim() || showEventDetail.label
                      });
                    }
                    setShowEventDetail(null);
                    setEditingEventTime(false);
                  }}
                  className="flex-1 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default memo(CircularTimeline);
