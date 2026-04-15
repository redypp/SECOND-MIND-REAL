import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

interface TodoBubble {
  id: string;
  itemId: string;
  label: string;
  completed: boolean;
  color: string;
  initialX?: number;
  initialY?: number;
  isImportant?: boolean;
}

interface FloatingTodoBubblesProps {
  todos: TodoBubble[];
  onToggleTodo?: (itemId: string) => void;
  onUpdateTodo?: (itemId: string, updates: { label: string }) => void;
  onDeleteTodo?: (itemId: string) => void;
  onUpdatePosition?: (itemId: string, position: { x: number; y: number }) => void;
  onToggleImportant?: (itemId: string) => void;
}

// Normal red accent
const redAccent = {
  fill: "hsl(0 85% 50% / 0.85)",
  stroke: "hsl(0 85% 60%)",
  solid: "hsl(0 85% 50%)",
};

// Important: deeper, richer red with more saturation
const importantRed = {
  fill: "hsl(0 100% 40% / 0.95)",
  stroke: "hsl(0 100% 50%)",
  solid: "hsl(0 100% 45%)",
};

const colorMap: Record<string, { fill: string; stroke: string; solid: string }> = {
  "timeline-teal": redAccent,
  "timeline-amber": redAccent,
  "timeline-blue": redAccent,
  "timeline-rose": redAccent,
  "timeline-purple": redAccent,
  "timeline-muted": redAccent,
};

function computeInitialPosition() {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // Random position within safe bounds
  // Leave margins: 60px left/right, 120px top, 200px bottom (for nav)
  const minX = 60;
  const maxX = screenWidth - 200;
  const minY = 120;
  const maxY = screenHeight - 250;
  
  const x = minX + Math.random() * Math.max(50, maxX - minX);
  const y = minY + Math.random() * Math.max(50, maxY - minY);
  
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

type DragRef = {
  todoId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
  startTime: number;
};

const LONG_PRESS_DURATION = 400; // ms

export function FloatingTodoBubbles({ todos, onDeleteTodo, onUpdatePosition, onToggleImportant }: FloatingTodoBubblesProps) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingTodo, setDraggingTodo] = useState<string | null>(null);
  const [poppingTodos, setPoppingTodos] = useState<Set<string>>(new Set());
  const [longPressingTodo, setLongPressingTodo] = useState<string | null>(null);

  const dragRef = useRef<DragRef | null>(null);
  const saveTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setLongPressingTodo(null);
  }, []);

  // Debounced save to database
  const debouncedSavePosition = useCallback((itemId: string, pos: { x: number; y: number }) => {
    if (saveTimeoutRef.current[itemId]) {
      clearTimeout(saveTimeoutRef.current[itemId]);
    }
    saveTimeoutRef.current[itemId] = setTimeout(() => {
      onUpdatePosition?.(itemId, pos);
      delete saveTimeoutRef.current[itemId];
    }, 500);
  }, [onUpdatePosition]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      Object.values(saveTimeoutRef.current).forEach(clearTimeout);
    };
  }, []);

  // Initialize positions from database or compute new ones
  const onUpdatePositionRef = useRef(onUpdatePosition);
  onUpdatePositionRef.current = onUpdatePosition;
  
  useEffect(() => {
    setPositions((prev) => {
      let changed = false;
      const next = { ...prev };

      todos.forEach((t) => {
        if (!next[t.id]) {
          // Use saved position from database if available
          if (t.initialX !== undefined && t.initialY !== undefined) {
            next[t.id] = { x: t.initialX, y: t.initialY };
            changed = true;
          } else {
            // Only compute random position for truly new items
            const newPos = computeInitialPosition();
            next[t.id] = newPos;
            changed = true;
            // Save new position to database
            onUpdatePositionRef.current?.(t.itemId, newPos);
          }
        }
      });

      const activeIds = new Set(todos.map((t) => t.id));
      Object.keys(next).forEach((id) => {
        if (!activeIds.has(id)) {
          delete next[id];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [todos]);

  const handleTodoPop = useCallback(
    (todo: TodoBubble) => {
      if (poppingTodos.has(todo.id)) return;

      setPoppingTodos((prev) => new Set(prev).add(todo.id));

      window.setTimeout(() => {
        onDeleteTodo?.(todo.itemId);

        setPositions((prev) => {
          const next = { ...prev };
          delete next[todo.id];
          return next;
        });

        setPoppingTodos((prev) => {
          const next = new Set(prev);
          next.delete(todo.id);
          return next;
        });
      }, 300);
    },
    [onDeleteTodo, poppingTodos]
  );

  // Touch handlers for mobile (iPhone Safari)
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, todoId: string) => {
      if (poppingTodos.has(todoId)) return;

      const pos = positions[todoId];
      if (!pos) return;

      // Prevent default to stop scrolling
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];

      setDraggingTodo(todoId);
      dragRef.current = {
        todoId,
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        startX: pos.x,
        startY: pos.y,
        moved: false,
        startTime: Date.now(),
      };

      // Start long press timer
      setLongPressingTodo(todoId);
      longPressTimerRef.current = setTimeout(() => {
        const d = dragRef.current;
        // Only trigger if we haven't moved
        if (d && !d.moved && d.todoId === todoId) {
          const todo = todos.find(t => t.id === todoId);
          if (todo) {
            onToggleImportant?.(todo.itemId);
          }
        }
        setLongPressingTodo(null);
      }, LONG_PRESS_DURATION);
    },
    [positions, poppingTodos, todos, onToggleImportant]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const d = dragRef.current;
    if (!d) return;

    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    const dx = touch.clientX - d.startClientX;
    const dy = touch.clientY - d.startClientY;

    const distance = Math.sqrt(dx * dx + dy * dy);
    if (!d.moved && distance > 10) {
      d.moved = true;
      clearLongPressTimer(); // Cancel long press if moved
    }

    // Unrestricted movement
    setPositions((prev) => ({
      ...prev,
      [d.todoId]: { x: d.startX + dx, y: d.startY + dy },
    }));

    // Find the itemId for this todo
    const todo = todos.find(t => t.id === d.todoId);
    if (todo) {
      debouncedSavePosition(todo.itemId, { x: d.startX + dx, y: d.startY + dy });
    }
  }, [todos, debouncedSavePosition, clearLongPressTimer]);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent, todo: TodoBubble) => {
      const d = dragRef.current;
      if (!d || d.todoId !== todo.id) return;

      e.preventDefault();
      e.stopPropagation();

      clearLongPressTimer();

      const elapsed = Date.now() - d.startTime;
      // Tap = minimal movement AND quick touch (< 300ms) AND not a long press
      const wasTap = !d.moved && elapsed < 300 && elapsed < LONG_PRESS_DURATION;

      dragRef.current = null;
      setDraggingTodo(null);

      if (wasTap) {
        handleTodoPop(todo);
      }
    },
    [handleTodoPop, clearLongPressTimer]
  );

  // Pointer handlers for desktop (mouse)
  const startDrag = useCallback(
    (e: React.PointerEvent, todoId: string) => {
      if (poppingTodos.has(todoId)) return;

      const pos = positions[todoId];
      if (!pos) return;

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDraggingTodo(todoId);

      dragRef.current = {
        todoId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: pos.x,
        startY: pos.y,
        moved: false,
        startTime: Date.now(),
      };

      // Start long press timer for desktop
      setLongPressingTodo(todoId);
      longPressTimerRef.current = setTimeout(() => {
        const d = dragRef.current;
        if (d && !d.moved && d.todoId === todoId) {
          const todo = todos.find(t => t.id === todoId);
          if (todo) {
            onToggleImportant?.(todo.itemId);
          }
        }
        setLongPressingTodo(null);
      }, LONG_PRESS_DURATION);
    },
    [positions, poppingTodos, todos, onToggleImportant]
  );

  const moveDrag = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;

    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;

    const distance = Math.sqrt(dx * dx + dy * dy);
    if (!d.moved && distance > 6) {
      d.moved = true;
      clearLongPressTimer();
    }

    setPositions((prev) => ({
      ...prev,
      [d.todoId]: { x: d.startX + dx, y: d.startY + dy },
    }));

    // Find the itemId for this todo
    const todo = todos.find(t => t.id === d.todoId);
    if (todo) {
      debouncedSavePosition(todo.itemId, { x: d.startX + dx, y: d.startY + dy });
    }
  }, [todos, debouncedSavePosition, clearLongPressTimer]);

  const endDrag = useCallback(
    (e: React.PointerEvent, todo: TodoBubble) => {
      const d = dragRef.current;
      if (!d || d.todoId !== todo.id) return;

      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);

      clearLongPressTimer();

      const elapsed = Date.now() - d.startTime;
      const wasClick = !d.moved && elapsed < 300 && elapsed < LONG_PRESS_DURATION;

      dragRef.current = null;
      setDraggingTodo(null);

      if (wasClick) {
        handleTodoPop(todo);
      }
    },
    [handleTodoPop, clearLongPressTimer]
  );

  if (todos.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      <AnimatePresence>
        {todos.map((todo) => {
          const pos = positions[todo.id];
          if (!pos) return null;

          // Use important red if marked, otherwise normal red
          const colors = todo.isImportant ? importantRed : (colorMap[todo.color] || colorMap["timeline-muted"]);
          const isDraggingThis = draggingTodo === todo.id;
          const isPopping = poppingTodos.has(todo.id);
          const isLongPressing = longPressingTodo === todo.id;

          return (
            <motion.div
              key={todo.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={
                isPopping
                  ? { opacity: [1, 1, 0], scale: [1, 1.2, 0.1] }
                  : { opacity: 1, scale: isLongPressing ? 1.1 : isDraggingThis ? 1.05 : 1 }
              }
              exit={{ opacity: 0, scale: 0.9 }}
              transition={
                isPopping
                  ? { duration: 0.3, times: [0, 0.4, 1], ease: [0.4, 0, 0.2, 1] }
                  : { type: "spring", stiffness: 300, damping: 26 }
              }
              className="absolute pointer-events-auto cursor-grab active:cursor-grabbing select-none"
              style={{
                zIndex: isDraggingThis ? 100 : 30,
                left: pos.x,
                top: pos.y,
                touchAction: "none",
                WebkitTapHighlightColor: "transparent",
                WebkitUserSelect: "none",
                userSelect: "none",
              }}
              // Touch events for mobile
              onTouchStart={(e) => handleTouchStart(e, todo.id)}
              onTouchMove={handleTouchMove}
              onTouchEnd={(e) => handleTouchEnd(e, todo)}
              onTouchCancel={(e) => handleTouchEnd(e, todo)}
              // Pointer events for desktop
              onPointerDown={(e) => {
                // Skip pointer events on touch devices (touch handlers will handle it)
                if (e.pointerType === "touch") return;
                startDrag(e, todo.id);
              }}
              onPointerMove={(e) => {
                if (e.pointerType === "touch") return;
                moveDrag(e);
              }}
              onPointerUp={(e) => {
                if (e.pointerType === "touch") return;
                endDrag(e, todo);
              }}
              onPointerCancel={(e) => {
                if (e.pointerType === "touch") return;
                endDrag(e, todo);
              }}
            >
              <motion.div
                className={`relative flex items-center justify-center px-5 py-3 rounded-2xl backdrop-blur-xl transition-all duration-300 ${
                  todo.isImportant ? '' : 'bg-background/90'
                } ${isDraggingThis ? "shadow-2xl" : ""}`}
                style={{
                  // Important styling: light mode = black bg + red outline, dark mode = white bg + pink glow
                  background: todo.isImportant ? 'hsl(var(--important-bg))' : undefined,
                  boxShadow: isPopping
                    ? "0 0 20px hsl(140 70% 50% / 0.4), 0 6px 20px hsl(0 0% 0% / 0.3)"
                    : isLongPressing
                      ? `0 4px 16px hsl(0 0% 0% / 0.4)`
                    : todo.isImportant
                      ? 'var(--important-shadow)'
                    : isDraggingThis
                      ? `0 6px 20px hsl(0 0% 0% / 0.4)`
                      : `0 4px 12px hsl(0 0% 0% / 0.25)`,
                  border: isPopping 
                    ? "2px solid hsl(140 70% 50%)" 
                    : todo.isImportant 
                      ? '2px solid hsl(var(--primary))'
                      : `2px solid ${colors.solid}`,
                  maxWidth: "190px",
                }}
              >
                {isPopping ? (
                  <Check className="w-5 h-5 text-green-400" strokeWidth={3} />
                ) : (
                  <span
                    className={`text-center leading-tight select-none overflow-hidden ${
                      todo.isImportant 
                        ? 'font-bold'
                        : 'font-medium'
                    }`}
                    style={{
                      color: todo.isImportant ? 'hsl(var(--important-fg))' : colors.solid,
                      fontSize: todo.label.length > 20 ? '0.75rem' : todo.label.length > 12 ? '0.85rem' : '1rem',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical' as const,
                      wordBreak: 'break-word',
                    }}
                  >
                    {todo.label}
                  </span>
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
