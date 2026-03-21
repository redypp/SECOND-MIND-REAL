import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { useSpaces } from '@/contexts/SpacesContext';
import { Link2, FileText, Image, Video, ExternalLink, CheckSquare, Calendar, Pencil, Check, X, Trash2 } from 'lucide-react';
import { SubCategory } from '@/types';
import { motion } from 'framer-motion';
import { isValidUrl } from '@/lib/urlValidation';
import { RichTextEditor, FormattedText } from '@/components/RichTextEditor';

const typeIcons = {
  note: FileText,
  link: Link2,
  image: Image,
  video: Video,
};

const subCategoryConfig: Record<SubCategory, { icon: React.ElementType; color: string; label: string }> = {
  todo: { icon: CheckSquare, color: '#10b981', label: 'Task' },
  task: { icon: CheckSquare, color: '#10b981', label: 'Task' },
  scheduling: { icon: Calendar, color: '#8b5cf6', label: 'Event' },
  notes: { icon: FileText, color: '#3b82f6', label: 'Note' },
  misc: { icon: Link2, color: '#f59e0b', label: 'Link' },
  habit: { icon: CheckSquare, color: '#14b8a6', label: 'Habit' },
  idea: { icon: FileText, color: '#6366f1', label: 'Idea' },
  journal: { icon: FileText, color: '#ec4899', label: 'Journal' },
  reminder: { icon: Calendar, color: '#f97316', label: 'Reminder' },
};

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { items, spaces, updateItem, deleteItem } = useSpaces();
  
  const item = id ? items.find(i => i.id === id) : undefined;
  
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  if (!item) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center px-6">
          <div className="w-14 h-14 rounded-xl bg-secondary mx-auto mb-4 flex items-center justify-center">
            <FileText className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">Item not found</p>
          <p className="text-muted-foreground text-sm mb-4">This item may have been deleted.</p>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-primary font-medium hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const Icon = typeIcons[item.type];
  const subCat = subCategoryConfig[item.subCategory];
  const itemSpaces = (item.spaceIds || []).map(sid => spaces.find(s => s.id === sid)).filter(Boolean);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleStartEdit = () => {
    setEditTitle(item.title || '');
    setEditContent(item.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    updateItem(item.id, {
      title: editTitle || undefined,
      content: editContent,
    });
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteItem(item.id);
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background page-transition safe-area-top-ios">
      <Header showBack />

      <div className="px-6 py-4 max-w-2xl mx-auto">
        {/* Type indicator */}
        <div className="flex items-center gap-2 mb-4">
          <div 
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ backgroundColor: `${subCat.color}15` }}
          >
            <subCat.icon className="w-3.5 h-3.5" style={{ color: subCat.color }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{subCat.label}</span>
          <span className="text-muted-foreground/40">•</span>
          <span className="text-xs text-muted-foreground/60">{formatDate(item.createdAt)}</span>
        </div>

        {/* Thumbnail for images/videos */}
        {item.thumbnail && (item.type === 'image' || item.type === 'video') && (
          <div className="relative mb-5 rounded-xl overflow-hidden aspect-video bg-secondary">
            <img
              src={item.thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />
            {item.type === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center bg-foreground/10">
                <div className="w-12 h-12 rounded-full bg-background/90 flex items-center justify-center">
                  <Video className="w-5 h-5 text-foreground" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {isEditing ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <RichTextEditor
              value={editContent}
              onChange={setEditContent}
              placeholder="Content... (use **text** for bold)"
              rows={4}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
              >
                <Check className="w-3.5 h-3.5" />
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-foreground rounded-lg text-sm"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <div>
            {item.title && (
              <h1 className="text-lg font-semibold text-foreground mb-2">
                {item.title}
              </h1>
            )}
            <p className="text-foreground/80 leading-relaxed text-[15px] whitespace-pre-wrap">
              <FormattedText content={item.content || ''} />
            </p>
          </div>
        )}

        {/* Link button */}
        {item.url && !isEditing && isValidUrl(item.url) && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors mt-4"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open link
          </a>
        )}

        {/* Actions */}
        {!isEditing && (
          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-border/50">
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg text-sm transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg text-sm transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
