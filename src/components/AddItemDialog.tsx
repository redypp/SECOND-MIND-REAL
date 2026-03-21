import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Image, Link2, Trash2, ArrowUp, Sparkles, Check, Tag, FolderOpen, Loader2 } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { SubCategory, MediaBlock, TextBlock } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useAutoOrganize } from '@/hooks/useAutoOrganize';
import { compressImage } from '@/lib/imageCompression';

interface AddItemDialogProps {
  spaceId: string;
  spaceName: string;
  defaultSubCategory?: SubCategory;
  isOpen?: boolean;
  onClose?: () => void;
  startWith?: 'note' | 'url' | 'photo';
}

export function AddItemDialog({
  spaceId,
  spaceName,
  defaultSubCategory,
  isOpen: controlledOpen,
  onClose,
  startWith = 'note',
}: AddItemDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (controlledOpen !== undefined && onClose && !value) {
      onClose();
    } else {
      setInternalOpen(value);
    }
  };

  const [noteContent, setNoteContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  const [appliedSuggestion, setAppliedSuggestion] = useState(false);
  const [appliedTitle, setAppliedTitle] = useState<string | undefined>();
  const [appliedSpaceIds, setAppliedSpaceIds] = useState<string[]>([]);
  const [appliedTags, setAppliedTags] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addItem, spaces } = useSpaces();
  const { suggestion, isAnalyzing, clear: clearSuggestion } = useAutoOrganize(noteContent, isOpen && !appliedSuggestion);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [noteContent]);

  useEffect(() => {
    if (!isOpen) return;
    if (startWith === 'url') {
      setShowUrlInput(true);
      setTimeout(() => urlInputRef.current?.focus(), 100);
      return;
    }
    if (startWith === 'photo') {
      setShowUrlInput(false);
      setTimeout(() => fileInputRef.current?.click(), 150);
      return;
    }
    setShowUrlInput(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [isOpen, startWith]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        const compressed = await compressImage(dataUrl);
        setPendingPhotos(prev => [...prev, compressed]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleAddUrl = () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) return;
    let finalUrl = trimmedUrl;
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      finalUrl = 'https://' + trimmedUrl;
    }
    setPendingUrls(prev => [...prev, finalUrl]);
    setUrlInput('');
    setShowUrlInput(false);
  };

  const removePhoto = (index: number) => setPendingPhotos(prev => prev.filter((_, i) => i !== index));
  const removeUrl = (index: number) => setPendingUrls(prev => prev.filter((_, i) => i !== index));

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    setAppliedTitle(suggestion.title);
    setAppliedSpaceIds(suggestion.suggestedSpaceIds);
    setAppliedTags(suggestion.tags);
    setAppliedSuggestion(true);
    clearSuggestion();
  };

  const hasContent = noteContent.trim() || pendingPhotos.length > 0 || pendingUrls.length > 0;

  const handleSubmit = () => {
    if (!hasContent) {
      showErrorPopup('Please add some content before saving.');
      return;
    }

    const targetSpaceIds = appliedSpaceIds.length > 0 ? appliedSpaceIds : [spaceId];

    if (noteContent.trim()) {
      const textBlock: TextBlock = {
        id: generateId(),
        type: 'text',
        content: noteContent.trim(),
      };
      addItem({
        subCategory: defaultSubCategory || 'notes',
        title: appliedTitle,
        blocks: [textBlock],
        spaceIds: targetSpaceIds,
        keywords: appliedTags.length > 0 ? appliedTags : undefined,
      });
    }

    pendingPhotos.forEach(photoUrl => {
      const mediaBlock: MediaBlock = {
        id: generateId(),
        type: 'media',
        url: photoUrl,
        mediaType: 'image',
      };
      addItem({
        subCategory: defaultSubCategory || 'misc',
        blocks: [mediaBlock],
        spaceIds: targetSpaceIds,
      });
    });

    pendingUrls.forEach(url => {
      const linkBlock: MediaBlock = {
        id: generateId(),
        type: 'media',
        url: url,
        mediaType: 'link',
      };
      addItem({
        subCategory: defaultSubCategory || 'misc',
        title: getDomainFromUrl(url),
        blocks: [linkBlock],
        spaceIds: targetSpaceIds,
      });
    });

    handleClose();
  };

  const handleClose = () => {
    setIsOpen(false);
    setNoteContent('');
    setUrlInput('');
    setShowUrlInput(false);
    setPendingPhotos([]);
    setPendingUrls([]);
    setIsFocused(false);
    setAppliedSuggestion(false);
    setAppliedTitle(undefined);
    setAppliedSpaceIds([]);
    setAppliedTags([]);
    clearSuggestion();
  };

  const suggestedSpaceNames = suggestion?.suggestedSpaceIds
    ?.map(id => spaces.find(s => s.id === id)?.name)
    .filter(Boolean) as string[] || [];

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-end justify-center"
      onClick={handleClose}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        className="bg-card w-full max-w-md border-t border-border rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Add to {spaceName}</h2>
          <button
            onClick={handleClose}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content */}
        <div className="px-5 pb-4 space-y-3">

          {/* Applied suggestion badge */}
          <AnimatePresence>
            {appliedSuggestion && (appliedTitle || appliedTags.length > 0) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-1.5 items-center"
              >
                {appliedTitle && (
                  <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">
                    <Check className="w-3 h-3" />
                    {appliedTitle}
                  </span>
                )}
                {suggestedSpaceNames.slice(0, 2).map(name => (
                  <span key={name} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">
                    <FolderOpen className="w-3 h-3" />
                    {name}
                  </span>
                ))}
                {appliedTags.slice(0, 3).map(tag => (
                  <span key={tag} className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                    #{tag}
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Note input */}
          <div className="flex items-end gap-3">
            <div className={`relative flex-1 rounded-xl border-2 transition-all duration-200 ${
              isFocused
                ? 'border-primary/50 bg-card/80 shadow-lg shadow-primary/10'
                : 'border-border/60 bg-card/60'
            }`}>
              <textarea
                ref={textareaRef}
                value={noteContent}
                onChange={(e) => {
                  setNoteContent(e.target.value);
                  if (appliedSuggestion) setAppliedSuggestion(false);
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder="Type your note..."
                rows={2}
                className="w-full px-4 py-3.5 bg-transparent text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none text-base leading-relaxed"
                style={{ minHeight: '56px', maxHeight: '200px' }}
              />
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={handleSubmit}
              disabled={!hasContent}
              className={`w-[52px] h-[52px] min-w-[52px] rounded-full flex items-center justify-center transition-all duration-200 touch-manipulation shrink-0 ${
                hasContent
                  ? 'bg-accent/50 text-primary shadow-sm hover:bg-accent'
                  : 'bg-muted/60 text-muted-foreground/50 cursor-not-allowed'
              }`}
              aria-label="Send note"
            >
              <ArrowUp className="w-6 h-6" strokeWidth={3} />
            </motion.button>
          </div>

          {/* AI Suggestion Banner */}
          <AnimatePresence>
            {(isAnalyzing || (suggestion && !appliedSuggestion)) && noteContent.trim().length >= 15 && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                {isAnalyzing && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border/50">
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                    <span className="text-xs text-muted-foreground">AI is organizing…</span>
                  </div>
                )}
                {suggestion && !isAnalyzing && !appliedSuggestion && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
                      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs font-medium text-primary">AI Suggestion</span>
                    </div>
                    <div className="px-3 py-2.5 space-y-2">
                      {/* Title suggestion */}
                      <div className="flex items-start gap-2">
                        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{suggestion.title}</p>
                          {(suggestedSpaceNames.length > 0 || suggestion.suggestedSpaceName) && (
                            <p className="text-xs text-muted-foreground">
                              → {suggestedSpaceNames.join(', ') || suggestion.suggestedSpaceName}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Tags */}
                      {suggestion.tags.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                          {suggestion.tags.slice(0, 4).map(tag => (
                            <span key={tag} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Apply button */}
                      <button
                        onClick={applySuggestion}
                        className="w-full py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors touch-manipulation"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pending Items Preview */}
          <AnimatePresence>
            {(pendingPhotos.length > 0 || pendingUrls.length > 0) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                {pendingPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {pendingPhotos.map((photo, index) => (
                      <div key={index} className="relative group aspect-square">
                        <img src={photo} alt="" className="w-full h-full object-cover rounded-lg" />
                        <button
                          onClick={() => removePhoto(index)}
                          className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {pendingUrls.length > 0 && (
                  <div className="space-y-2">
                    {pendingUrls.map((url, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg group">
                        <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center shrink-0">
                          <Link2 className="w-3 h-3 text-primary" />
                        </div>
                        <p className="flex-1 text-xs text-foreground truncate">{getDomainFromUrl(url)}</p>
                        <button onClick={() => removeUrl(index)} className="p-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* URL Input */}
          <AnimatePresence>
            {showUrlInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex gap-2"
              >
                <input
                  ref={urlInputRef}
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); }
                    if (e.key === 'Escape') { setShowUrlInput(false); setUrlInput(''); }
                  }}
                  className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button onClick={handleAddUrl} disabled={!urlInput.trim()} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">Add</button>
                <button onClick={() => { setShowUrlInput(false); setUrlInput(''); }} className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Secondary action buttons */}
          {!showUrlInput && (
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors"
              >
                <Image className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Photo</span>
              </button>
              <button
                onClick={() => setShowUrlInput(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors"
              >
                <Link2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">URL</span>
              </button>
            </div>
          )}
        </div>

        <div className="h-4" />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleImageUpload}
          className="hidden"
          accept="image/*"
        />
      </motion.div>
    </div>
  );
}
