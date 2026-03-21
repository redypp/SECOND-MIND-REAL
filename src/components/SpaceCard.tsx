import { Space } from '@/types';
import { useNavigate } from 'react-router-dom';
import { Trash2, ImagePlus, Pencil, Check, X, Pin } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface SpaceCardProps {
  space: Space;
  editMode?: boolean;
}

export function SpaceCard({
  space,
  editMode = false,
}: SpaceCardProps) {
  const navigate = useNavigate();
  const {
    deleteSpace,
    updateSpaceImage,
    updateSpaceName,
    pinSpace,
    unpinSpace
  } = useSpaces();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(space.name);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSpace(space.id);
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateSpaceImage(space.id, reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNameSave = () => {
    if (editedName.trim()) {
      updateSpaceName(space.id, editedName.trim());
    }
    setIsEditing(false);
  };

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (space.isPinned) {
      unpinSpace(space.id);
    } else {
      pinSpace(space.id);
    }
  };

  // Edit mode card
  if (editMode) {
    return (
      <div
        className="group w-full text-left bg-card rounded-2xl p-4 transition-all duration-200 shadow-sm border border-border/60 hover:border-border"
      >
        <input 
          ref={fileInputRef} 
          type="file" 
          accept="image/*" 
          onChange={handleImageChange} 
          className="hidden" 
        />
        
        <div className="flex items-center gap-3">
          
          <button
            onClick={handleImageClick}
            className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center overflow-hidden shrink-0 hover:bg-secondary/80 transition-colors"
            style={{ 
              backgroundColor: space.color ? `${space.color}12` : undefined,
              borderLeft: space.color ? `3px solid ${space.color}` : undefined
            }}
          >
            {space.image ? (
              <img src={space.image} alt={space.name} className="w-full h-full object-cover" />
            ) : (
              <ImagePlus className="w-4 h-4 text-muted-foreground/60" />
            )}
          </button>
          
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSave();
                    if (e.key === 'Escape') {
                      setEditedName(space.name);
                      setIsEditing(false);
                    }
                  }}
                  className="flex-1 bg-secondary px-3 py-1.5 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
                <button
                  onClick={handleNameSave}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                >
                  <Check className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={() => {
                    setEditedName(space.name);
                    setIsEditing(false);
                  }}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <h3 className="text-[15px] font-medium text-foreground truncate">
                {space.name}
              </h3>
            )}
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {space.itemCount} {space.itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
          
          <div className="flex items-center gap-0.5 relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setEditedName(space.name);
              }}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              title="Rename"
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePin(e);
              }}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              title={space.isPinned ? "Unpin" : "Pin"}
            >
              <Pin className={`w-4 h-4 ${space.isPinned ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
            </button>
            
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-destructive/80" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default view card - image cover with overlay text
  return (
    <motion.button
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/space/${space.id}`)}
      className="group relative w-full aspect-[4/3] text-left rounded-2xl overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/* Background image or gradient */}
      {space.image ? (
        <img 
          src={space.image} 
          alt={space.name} 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
        />
      ) : (
        <div 
          className="absolute inset-0 w-full h-full"
          style={{ 
            background: space.color 
              ? `linear-gradient(135deg, ${space.color}, ${space.color}99)` 
              : 'linear-gradient(135deg, hsl(var(--muted)), hsl(var(--secondary)))'
          }}
        />
      )}
      
      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10" />
      
      {/* Title with clean readable style */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <h3 className="text-2xl font-semibold text-white text-center drop-shadow-md">
          {space.name}
        </h3>
      </div>
    </motion.button>
  );
}
