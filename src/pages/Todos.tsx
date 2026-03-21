import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpaces } from '@/contexts/SpacesContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, X, Calendar, Palette } from 'lucide-react';
import { ColorPicker, PRESET_COLORS } from '@/components/ColorPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function Todos() {
  const navigate = useNavigate();
  const { items, spaces, updateItem, deleteItem } = useSpaces();
  const [editingColorId, setEditingColorId] = useState<string | null>(null);

  // Get all todos and scheduled events
  const { todos, events } = useMemo(() => {
    const todoItems = items.filter(item => item.subCategory === 'todo');
    const eventItems = items.filter(item => 
      item.subCategory === 'scheduling' || 
      (item.scheduledDate && item.subCategory !== 'todo')
    );

    return {
      todos: todoItems.map(item => {
        const checklistBlock = item.blocks.find(b => b.type === 'checklist');
        let completed = false;
        if (checklistBlock && checklistBlock.type === 'checklist') {
          completed = checklistBlock.items.length > 0 && checklistBlock.items.every(i => i.checked);
        }
        // Todos are stored separately from sections - use item color or default
        return { ...item, completed, displayColor: item.color || PRESET_COLORS[0].value };
      }),
      events: eventItems.map(item => {
        // Events are stored separately from sections - use item color or default
        return { ...item, displayColor: item.color || PRESET_COLORS[0].value };
      })
    };
  }, [items, spaces]);

  const handleToggleTodo = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const checklistBlock = item.blocks.find(b => b.type === 'checklist');
    
    if (checklistBlock && checklistBlock.type === 'checklist') {
      const allChecked = checklistBlock.items.every(i => i.checked);
      const updatedBlocks = item.blocks.map(block => {
        if (block.id === checklistBlock.id && block.type === 'checklist') {
          return {
            ...block,
            items: block.items.map(i => ({ ...i, checked: !allChecked }))
          };
        }
        return block;
      });
      updateItem(itemId, { blocks: updatedBlocks });
    }
    
  };

  const handleColorChange = (itemId: string, color: string) => {
    updateItem(itemId, { color });
    setEditingColorId(null);
  };

  const handleDelete = (itemId: string) => {
    deleteItem(itemId);
  };

  return (
    <div className="min-h-screen bg-background safe-area-top-ios">
      {/* Header */}
      <header className="sticky safe-sticky-top z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">To Do</h1>
        </div>
      </header>

      <div className="p-5 space-y-8">
        {/* Events Section */}
        {events.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Scheduled Events
            </h2>
            <div className="space-y-3">
              {events.map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 p-3 bg-card border border-border/30 hover:border-border/60 transition-colors"
                >
                  <Popover open={editingColorId === event.id} onOpenChange={(open) => setEditingColorId(open ? event.id : null)}>
                    <PopoverTrigger asChild>
                      <button 
                        className="w-4 h-4 rounded-full shrink-0 hover:ring-2 hover:ring-offset-2 hover:ring-offset-background hover:ring-muted-foreground/30 transition-all"
                        style={{ backgroundColor: event.displayColor }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <ColorPicker 
                        value={event.color || event.displayColor} 
                        onChange={(color) => handleColorChange(event.id, color)} 
                        size="sm"
                      />
                    </PopoverContent>
                  </Popover>
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/item/${event.id}`)}
                  >
                    <p className="text-sm font-medium text-foreground truncate">{event.title || 'Event'}</p>
                    {event.scheduledDate && (
                      <p className="text-xs text-muted-foreground">
                        {event.scheduledDate} {event.scheduledTime && `at ${event.scheduledTime}`}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors touch-manipulation tap-feedback"
                    aria-label="Delete item"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Todos Section */}
        {todos.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Tasks ({todos.filter(t => !t.completed).length} active)
            </h2>
            <div className="space-y-3">
              {todos.map((todo) => (
                <motion.div
                  key={todo.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex items-center gap-3 p-3 bg-card border border-border/30 hover:border-border/60 transition-colors ${todo.completed ? 'opacity-50' : ''}`}
                >
                  <button
                    onClick={() => handleToggleTodo(todo.id)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      todo.completed 
                        ? 'bg-primary border-primary' 
                        : 'border-muted-foreground/40 hover:border-primary/70'
                    }`}
                  >
                    {todo.completed && <Check className="w-3 h-3 text-primary-foreground" />}
                  </button>
                  <Popover open={editingColorId === todo.id} onOpenChange={(open) => setEditingColorId(open ? todo.id : null)}>
                    <PopoverTrigger asChild>
                      <button 
                        className="w-4 h-4 rounded-full shrink-0 hover:ring-2 hover:ring-offset-2 hover:ring-offset-background hover:ring-muted-foreground/30 transition-all"
                        style={{ backgroundColor: todo.displayColor }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <ColorPicker 
                        value={todo.color || todo.displayColor} 
                        onChange={(color) => handleColorChange(todo.id, color)} 
                        size="sm"
                      />
                    </PopoverContent>
                  </Popover>
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/item/${todo.id}`)}
                  >
                    <p className={`text-sm font-medium truncate ${todo.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {todo.title || 'Todo'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(todo.id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors touch-manipulation tap-feedback"
                    aria-label="Delete item"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {todos.length === 0 && events.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No todos or events yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
