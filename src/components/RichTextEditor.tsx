import { useState, useRef, useCallback, useEffect } from 'react';
import { Bold } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  autoFocus?: boolean;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = 'Start typing...', 
  className,
  rows = 4,
  autoFocus = false
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isBoldActive, setIsBoldActive] = useState(false);

  // Check if selection is within bold markers
  const checkBoldState = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    const text = textarea.value;
    
    // Simple check: is the cursor/selection within **...** markers?
    let boldStart = -1;
    let boldEnd = -1;
    
    // Find the nearest ** before cursor
    for (let i = selectionStart - 1; i >= 0; i--) {
      if (text.slice(i, i + 2) === '**') {
        boldStart = i;
        break;
      }
    }
    
    // Find the nearest ** after cursor
    for (let i = selectionEnd; i < text.length - 1; i++) {
      if (text.slice(i, i + 2) === '**') {
        boldEnd = i;
        break;
      }
    }
    
    // Check if we're inside a bold section
    const isInsideBold = boldStart !== -1 && boldEnd !== -1 && boldEnd > boldStart;
    setIsBoldActive(isInsideBold);
  }, []);

  const toggleBold = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.slice(start, end);

    let newText: string;
    let newStart: number;
    let newEnd: number;

    // Check if selection is already bold (wrapped in **)
    const beforeSelection = text.slice(Math.max(0, start - 2), start);
    const afterSelection = text.slice(end, end + 2);
    
    if (beforeSelection === '**' && afterSelection === '**') {
      // Remove bold markers
      newText = text.slice(0, start - 2) + selectedText + text.slice(end + 2);
      newStart = start - 2;
      newEnd = end - 2;
    } else if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
      // Remove bold markers from selection
      newText = text.slice(0, start) + selectedText.slice(2, -2) + text.slice(end);
      newStart = start;
      newEnd = end - 4;
    } else {
      // Add bold markers
      newText = text.slice(0, start) + '**' + selectedText + '**' + text.slice(end);
      newStart = start + 2;
      newEnd = end + 2;
    }

    onChange(newText);
    
    // Restore selection after state update
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newStart, newEnd);
      checkBoldState();
    });
  }, [onChange, checkBoldState]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + B for bold
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      toggleBold();
    }
  };

  const handleSelect = () => {
    checkBoldState();
  };

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div className="space-y-2">
      {/* Minimal toolbar */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleBold}
          className={cn(
            "p-2 rounded-lg transition-colors text-sm font-bold",
            isBoldActive 
              ? "bg-primary text-primary-foreground" 
              : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
          )}
          title="Bold (Ctrl+B / Cmd+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <span className="text-xs text-muted-foreground/60 ml-2">
          Use **text** or Ctrl+B for bold
        </span>
      </div>
      
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={handleSelect}
        onClick={handleSelect}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          "w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/20",
          className
        )}
      />
    </div>
  );
}

// Utility function to parse and render text with bold formatting
export function renderFormattedText(text: string): React.ReactNode {
  if (!text) return null;
  
  // Split by bold markers **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      // Remove markers and render as bold
      const boldText = part.slice(2, -2);
      return <strong key={index} className="font-bold">{boldText}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

// Export a simpler version for displaying formatted content
export function FormattedText({ content, className }: { content: string; className?: string }) {
  return <span className={className}>{renderFormattedText(content)}</span>;
}
