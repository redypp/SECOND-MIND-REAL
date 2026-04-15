import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { useSpaces } from '@/contexts/SpacesContext';
import { usePeople } from '@/contexts/PeopleContext';
import { Link2, FileText, Image, Video, ExternalLink, CheckSquare, Calendar, Pencil, Check, X, Trash2, User, Plus } from 'lucide-react';
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
  const { people, getPeopleForItem, addPerson } = usePeople();

  const item = id ? items.find(i => i.id === id) : undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [showPersonSearch, setShowPersonSearch] = useState(false);

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
  const subCat = subCategoryConfig[item.subCategory] || { icon: FileText, color: '#6b7280', label: 'Item' };
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

      <div className="px-6 pt-6 pb-12 max-w-2xl mx-auto">
        {/* Hero type badge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl"
            style={{ backgroundColor: `${subCat.color}12` }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${subCat.color}20` }}
            >
              <subCat.icon className="w-4 h-4" style={{ color: subCat.color }} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold" style={{ color: subCat.color }}>{subCat.label}</span>
              <span className="text-xs text-muted-foreground/60">{formatDate(item.createdAt)}</span>
            </div>
          </div>
        </motion.div>

        {/* Thumbnail for images/videos */}
        {item.thumbnail && (item.type === 'image' || item.type === 'video') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="relative mb-8 rounded-2xl overflow-hidden aspect-video bg-secondary shadow-lg"
          >
            <img
              src={item.thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />
            {item.type === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center bg-foreground/10">
                <div className="w-14 h-14 rounded-full bg-background/90 flex items-center justify-center shadow-md">
                  <Video className="w-6 h-6 text-foreground" />
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Content */}
        {isEditing ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-foreground text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <RichTextEditor
              value={editContent}
              onChange={setEditContent}
              placeholder="Content... (use **text** for bold)"
              rows={6}
            />
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleSaveEdit}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-sm"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-xl text-sm"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            {item.title && (
              <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight mb-4">
                {item.title}
              </h1>
            )}
            <div className="text-foreground/85 leading-relaxed text-[15px] whitespace-pre-wrap">
              <FormattedText content={item.content || ''} />
            </div>
          </motion.div>
        )}

        {/* Link button */}
        {item.url && !isEditing && isValidUrl(item.url) && (
          <motion.a
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-secondary/80 text-foreground rounded-xl text-sm font-medium hover:bg-secondary transition-colors mt-6 border border-border/30"
          >
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
            Open link
          </motion.a>
        )}

        {/* Archive tags */}
        {!isEditing && itemSpaces.length > 0 && (
          <div className="mt-8 flex items-center gap-2 flex-wrap">
            {itemSpaces.map(space => space && (
              <button
                key={space.id}
                onClick={() => navigate(`/space/${space.id}`)}
                className="text-xs font-medium px-3 py-1.5 rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border/20"
              >
                {space.name}
              </button>
            ))}
          </div>
        )}

        {/* People Tags */}
        {!isEditing && (() => {
          const itemPeople = item ? getPeopleForItem(item) : [];
          const filteredSuggestions = personSearch.trim()
            ? people.filter(p =>
                p.name.toLowerCase().includes(personSearch.toLowerCase()) &&
                !item?.peopleIds?.includes(p.id)
              ).slice(0, 5)
            : [];
          const isNewName = personSearch.trim() && !people.some(p =>
            p.name.toLowerCase() === personSearch.trim().toLowerCase()
          );

          return (
            <div className="mt-8 pt-6 border-t border-border/30">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-muted-foreground/70" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">People</span>
              </div>

              {/* Current people chips */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {itemPeople.map(person => (
                  <div key={person.id} className="flex items-center gap-1.5 text-sm text-primary bg-primary/10 pl-3 pr-1.5 py-1 rounded-full font-medium">
                    <span>{person.name}</span>
                    <button
                      onClick={() => {
                        const newIds = (item.peopleIds || []).filter(pid => pid !== person.id);
                        updateItem(item.id, { peopleIds: newIds });
                      }}
                      className="p-0.5 hover:bg-primary/20 rounded-full"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setShowPersonSearch(!showPersonSearch)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1 rounded-full bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>

              {/* Search/add input */}
              {showPersonSearch && (
                <div className="relative">
                  <input
                    type="text"
                    value={personSearch}
                    onChange={e => setPersonSearch(e.target.value)}
                    placeholder="Type a name..."
                    autoFocus
                    className="w-full px-4 py-2.5 bg-secondary border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && personSearch.trim()) {
                        const person = await addPerson(personSearch.trim());
                        if (person) {
                          const newIds = [...(item.peopleIds || []), person.id];
                          updateItem(item.id, { peopleIds: newIds });
                        }
                        setPersonSearch('');
                        setShowPersonSearch(false);
                      } else if (e.key === 'Escape') {
                        setPersonSearch('');
                        setShowPersonSearch(false);
                      }
                    }}
                  />
                  {(filteredSuggestions.length > 0 || isNewName) && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-lg z-10 overflow-hidden">
                      {filteredSuggestions.map(person => (
                        <button
                          key={person.id}
                          onClick={() => {
                            const newIds = [...(item.peopleIds || []), person.id];
                            updateItem(item.id, { peopleIds: newIds });
                            setPersonSearch('');
                            setShowPersonSearch(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors flex items-center gap-2"
                        >
                          <User className="w-4 h-4 text-muted-foreground" />
                          {person.name}
                        </button>
                      ))}
                      {isNewName && (
                        <button
                          onClick={async () => {
                            const person = await addPerson(personSearch.trim());
                            if (person) {
                              const newIds = [...(item.peopleIds || []), person.id];
                              updateItem(item.id, { peopleIds: newIds });
                            }
                            setPersonSearch('');
                            setShowPersonSearch(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-primary hover:bg-secondary transition-colors flex items-center gap-2 border-t border-border"
                        >
                          <Plus className="w-4 h-4" />
                          Create "{personSearch.trim()}"
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Actions */}
        {!isEditing && (
          <div className="flex items-center gap-3 mt-8 pt-6 border-t border-border/30">
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl text-sm font-medium transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
