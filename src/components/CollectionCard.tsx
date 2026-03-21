import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { Space } from '@/types';
import { BookOpen, X } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';

interface CollectionCardProps {
  space: Space;
  variant?: 'default' | 'compact';
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

function FillText({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-2">
      <span
        className="text-white uppercase text-5xl font-black tracking-tight text-center leading-none"
        style={{ textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 4px rgba(0,0,0,0.4)' }}
      >
        {text}
      </span>
    </div>
  );
}

export function CollectionCard({ space, variant = 'default', selectedId, onSelect }: CollectionCardProps) {
  const navigate = useNavigate();
  const { deleteSpace } = useSpaces();

  const isSelected = selectedId === space.id;

  const handleClick = useCallback(() => {
    if (isSelected) {
      // Deselect on second tap
      onSelect?.(null);
    } else if (selectedId) {
      // Another card is selected — deselect it and navigate
      onSelect?.(null);
      navigate(`/space/${space.id}`);
    } else {
      // Nothing selected — navigate normally
      navigate(`/space/${space.id}`);
    }
  }, [isSelected, selectedId, onSelect, navigate, space.id]);

  const handleSelect = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSelected) {
      onSelect?.(null);
    } else {
      onSelect?.(space.id);
    }
  }, [isSelected, onSelect, space.id]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteSpace(space.id);
    onSelect?.(null);
  }, [deleteSpace, space.id, onSelect]);

  // Compact variant unchanged
  if (variant === 'compact') {
    return (
      <button
        onClick={() => navigate(`/space/${space.id}`)}
        className={`w-full flex items-center gap-3 p-3 bg-card shadow-card hover:shadow-elevated transition-all text-left rounded-none ${space.isPinned ? 'border-[2px] border-red-hot/60' : 'border-2 border-transparent'}`}
      >
        <div 
          className="w-12 h-12 flex items-center justify-center shrink-0"
          style={{ 
            backgroundColor: space.color ? `${space.color}15` : 'hsl(var(--secondary))',
          }}
        >
          {space.image ? (
            <img src={space.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <BookOpen 
              className="w-5 h-5" 
              style={{ color: space.color || 'hsl(var(--muted-foreground))' }}
            />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium text-foreground truncate">
            {space.name}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {space.itemCount} {space.itemCount === 1 ? 'archive' : 'archives'}
          </p>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleSelect}
      className={`w-full aspect-square rounded-none relative ${space.isPinned ? 'border-[2px] border-red-hot/60' : ''}`}
      style={{ overflow: 'visible' }}
    >
      {/* Background image or gradient — clipped */}
      <div className="absolute inset-0 overflow-hidden">
        {space.image ? (
          <img 
            src={space.image} 
            alt="" 
            className="absolute inset-0 w-full h-full object-cover" 
          />
        ) : (
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ 
              background: space.color 
                ? `linear-gradient(145deg, ${space.color}, ${space.color}cc)` 
                : 'linear-gradient(145deg, hsl(var(--muted)), hsl(var(--secondary)))'
            }}
          />
        )}
      </div>
      
      {/* Title - fills the entire box */}
      <FillText text={space.name} />

      {/* X delete button — only when selected */}
      {isSelected && (
        <button
          onClick={handleDelete}
          className="absolute z-10 flex items-center justify-center w-7 h-7 rounded-full bg-foreground/80 backdrop-blur-sm border border-background/20 shadow-md transition-transform active:scale-90"
          style={{ top: 8, right: 8 }}
          aria-label={`Delete ${space.name}`}
        >
          <X className="w-4 h-4 text-background" />
        </button>
      )}
    </button>
  );
}
