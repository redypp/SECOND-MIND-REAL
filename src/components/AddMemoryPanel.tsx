import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Image, Link2, Table, X, Plus, Minus, ArrowLeft, ChevronRight, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextBlock, MediaBlock, TableBlock, SubCategory } from '@/types';
import { isValidUrl } from '@/lib/urlValidation';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { compressImage } from '@/lib/imageCompression';
import { uploadImageToStorage } from '@/lib/imageUpload';
import { useAuth } from '@/contexts/AuthContext';
import { useSmartRewrite } from '@/hooks/useSmartRewrite';

type ActiveScreen = 'select' | 'notes' | 'images' | 'urls' | 'table';

interface AddMemoryPanelProps {
  spaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (item: {
    subCategory: SubCategory;
    title?: string;
    content?: string;
    blocks: (TextBlock | MediaBlock | TableBlock)[];
    spaceIds: string[];
  }) => void | Promise<void>;
}

export function AddMemoryPanel({ spaceId, isOpen, onClose, onAddItem }: AddMemoryPanelProps) {
  const { user } = useAuth();
  const { rewrite, isRewriting } = useSmartRewrite();
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('select');

  // Note state
  const [noteInput, setNoteInput] = useState('');
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const handleAugmentNote = useCallback(async () => {
    if (!noteInput.trim() || isRewriting) return;
    const result = await rewrite(noteInput.trim(), 'augment');
    if (result?.result) {
      setNoteInput(result.result);
      // Resize textarea to fit new content
      requestAnimationFrame(() => {
        const el = noteInputRef.current;
        if (el) {
          el.style.height = 'auto';
          el.style.height = el.scrollHeight + 'px';
        }
      });
    } else {
      showErrorPopup("Couldn't augment the note. Try again.");
    }
  }, [noteInput, isRewriting, rewrite]);

  // Image state
  const [images, setImages] = useState<{ preview: string; caption: string }[]>([]);
  const [savingImages, setSavingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL state
  const [urls, setUrls] = useState<{ url: string; title: string }[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentUrlTitle, setCurrentUrlTitle] = useState('');

  // Table state
  const [tableHeaders, setTableHeaders] = useState<string[]>(['', '']);
  const [tableRows, setTableRows] = useState<string[][]>([['', '']]);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Reset and close
  const handleClose = useCallback(() => {
    setActiveScreen('select');
    onClose();
  }, [onClose]);

  // Image handlers
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        showErrorPopup(`${file.name} is too large. Maximum size is 10MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        const compressed = await compressImage(dataUrl);
        setImages(prev => [...prev, { preview: compressed, caption: '' }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateImageCaption = useCallback((index: number, caption: string) => {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, caption } : img));
  }, []);

  // URL handlers
  const addUrl = useCallback(() => {
    let finalUrl = currentUrl.trim();
    if (!finalUrl) return;

    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }

    setUrls(prev => [...prev, { url: finalUrl, title: currentUrlTitle.trim() }]);
    setCurrentUrl('');
    setCurrentUrlTitle('');
  }, [currentUrl, currentUrlTitle]);

  const removeUrl = useCallback((index: number) => {
    setUrls(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Table handlers
  const addColumn = useCallback(() => {
    setTableHeaders(prev => [...prev, '']);
    setTableRows(prev => prev.map(row => [...row, '']));
  }, []);

  const removeColumn = useCallback((colIndex: number) => {
    if (tableHeaders.length <= 1) return;
    setTableHeaders(prev => prev.filter((_, i) => i !== colIndex));
    setTableRows(prev => prev.map(row => row.filter((_, i) => i !== colIndex)));
  }, [tableHeaders.length]);

  const addRow = useCallback(() => {
    setTableRows(prev => [...prev, tableHeaders.map(() => '')]);
  }, [tableHeaders]);

  const removeRow = useCallback((rowIndex: number) => {
    if (tableRows.length <= 1) return;
    setTableRows(prev => prev.filter((_, i) => i !== rowIndex));
  }, [tableRows.length]);

  const updateHeader = useCallback((index: number, value: string) => {
    setTableHeaders(prev => prev.map((h, i) => i === index ? value : h));
  }, []);

  const updateCell = useCallback((rowIndex: number, colIndex: number, value: string) => {
    setTableRows(prev => prev.map((row, ri) => 
      ri === rowIndex ? row.map((cell, ci) => ci === colIndex ? value : cell) : row
    ));
  }, []);

  // Save handlers for each type
  const handleSaveNote = useCallback(() => {
    if (!noteInput.trim()) return;

    const trimmed = noteInput.trim();
    const textBlock: TextBlock = {
      id: generateId(),
      type: 'text',
      content: trimmed,
    };
    onAddItem({
      subCategory: 'notes',
      content: trimmed,
      blocks: [textBlock],
      spaceIds: [spaceId],
    });

    setNoteInput('');
    setActiveScreen('select');
    handleClose();
  }, [noteInput, spaceId, onAddItem, handleClose]);

  const handleSaveImages = useCallback(async () => {
    if (images.length === 0 || savingImages) return;
    if (!user) {
      showErrorPopup('Please sign in to save images.');
      return;
    }

    setSavingImages(true);
    let anyFailed = false;
    let storageFallbackCount = 0;

    try {
      for (const img of images) {
        // Upload to storage; uploadImageToStorage returns the original base64
        // data URL if the upload fails. Detect that case so we can warn the user
        // instead of silently embedding a huge base64 payload in the item.
        let imageUrl: string;
        try {
          imageUrl = await uploadImageToStorage(img.preview, user.id);
        } catch (err) {
          console.error('[AddMemoryPanel] uploadImageToStorage threw:', err);
          imageUrl = img.preview;
        }
        if (imageUrl === img.preview) {
          storageFallbackCount += 1;
        }

        const mediaBlock: MediaBlock = {
          id: generateId(),
          type: 'media',
          url: imageUrl,
          mediaType: 'image',
          caption: img.caption.trim() || undefined,
        };

        try {
          // Await so we know the insert actually landed before we close the
          // panel. Previously this was fire-and-forget, which meant a failed
          // insert could happen after the panel unmounted — the error popup
          // would fire but the image simply wouldn't appear in the archive.
          await onAddItem({
            subCategory: 'misc',
            blocks: [mediaBlock],
            spaceIds: [spaceId],
          });
        } catch (err) {
          console.error('[AddMemoryPanel] onAddItem failed:', err);
          anyFailed = true;
        }
      }

      if (storageFallbackCount > 0) {
        showErrorPopup(
          storageFallbackCount === images.length
            ? "Couldn't upload image to storage — saved a local copy instead. Check your connection."
            : `Couldn't upload ${storageFallbackCount} image(s) to storage — saved local copies instead.`
        );
      }

      if (anyFailed) {
        // Don't close the panel on outright failure so the user can retry.
        return;
      }

      setImages([]);
      setActiveScreen('select');
      handleClose();
    } finally {
      setSavingImages(false);
    }
  }, [images, savingImages, spaceId, onAddItem, handleClose, user]);

  const handleSaveUrls = useCallback(async () => {
    // Auto-add any URL still in the input field
    let allUrls = [...urls];
    if (currentUrl.trim()) {
      let finalUrl = currentUrl.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
      }
      allUrls.push({ url: finalUrl, title: currentUrlTitle.trim() });
    }

    if (allUrls.length === 0) return;

    for (const urlItem of allUrls) {
      const mediaBlock: MediaBlock = {
        id: generateId(),
        type: 'media',
        url: urlItem.url,
        mediaType: 'link',
      };
      await onAddItem({
        subCategory: 'misc',
        title: urlItem.title || undefined,
        blocks: [mediaBlock],
        spaceIds: [spaceId],
      });
    }

    setUrls([]);
    setCurrentUrl('');
    setCurrentUrlTitle('');
    setActiveScreen('select');
    handleClose();
  }, [urls, currentUrl, currentUrlTitle, spaceId, onAddItem, handleClose]);

  const handleSaveTable = useCallback(() => {
    const hasContent = tableHeaders.some(h => h.trim()) || 
      tableRows.some(row => row.some(cell => cell.trim()));
    
    if (!hasContent) return;

    const tableBlock: TableBlock = {
      id: generateId(),
      type: 'table',
      headers: tableHeaders,
      rows: tableRows,
    };
    onAddItem({
      subCategory: 'misc',
      blocks: [tableBlock],
      spaceIds: [spaceId],
    });

    setTableHeaders(['', '']);
    setTableRows([['', '']]);
    setActiveScreen('select');
    handleClose();
  }, [tableHeaders, tableRows, spaceId, onAddItem, handleClose]);

  // Selection screen
  const renderSelectScreen = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col"
    >
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={handleClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Add Archive</h1>
          <div className="w-9" />
        </div>
      </header>

      <div className="flex-1 px-0 py-0 flex flex-col">
        <div className="flex-1 grid grid-rows-4">
          {/* Notes Option */}
          <button
            onClick={() => setActiveScreen('notes')}
            className="w-full flex items-center gap-5 px-6 bg-card border-b border-border hover:bg-secondary/40 transition-all group touch-manipulation"
          >
            <div className="w-14 h-14 rounded-xl bg-red-hot/10 flex items-center justify-center">
              <FileText className="w-7 h-7 text-red-hot" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-semibold text-foreground">Text Note</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Write anything, bullet points, or paste content</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-red-hot transition-colors" />
          </button>

          {/* Images Option */}
          <button
            onClick={() => setActiveScreen('images')}
            className="w-full flex items-center gap-5 px-6 bg-card border-b border-border hover:bg-secondary/40 transition-all group touch-manipulation"
          >
            <div className="w-14 h-14 rounded-xl bg-red-coral/10 flex items-center justify-center">
              <Image className="w-7 h-7 text-red-coral" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-semibold text-foreground">Images</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Upload or paste photos</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-red-coral transition-colors" />
          </button>

          {/* URLs Option */}
          <button
            onClick={() => setActiveScreen('urls')}
            className="w-full flex items-center gap-5 px-6 bg-card border-b border-border hover:bg-secondary/40 transition-all group touch-manipulation"
          >
            <div className="w-14 h-14 rounded-xl bg-red-berry/10 flex items-center justify-center">
              <Link2 className="w-7 h-7 text-red-berry" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-semibold text-foreground">Links / URLs</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Save links with preview cards</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-red-berry transition-colors" />
          </button>

          {/* Table Option */}
          <button
            onClick={() => setActiveScreen('table')}
            className="w-full flex items-center gap-5 px-6 bg-card border-b border-border hover:bg-secondary/40 transition-all group touch-manipulation"
          >
            <div className="w-14 h-14 rounded-xl bg-red-maroon/10 flex items-center justify-center">
              <Table className="w-7 h-7 text-red-maroon" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-semibold text-foreground">Table</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Comparisons, lists, pricing, or data</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-red-maroon transition-colors" />
          </button>
        </div>
      </div>
    </motion.div>
  );


  // Notes screen
  const renderNotesScreen = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      className="h-full flex flex-col"
    >
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setActiveScreen('select')}
            className="p-2 hover:bg-secondary rounded-lg transition-colors touch-manipulation"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-lg font-semibold">Text Note</h1>
          </div>
          <Button
            onClick={handleSaveNote}
            disabled={!noteInput.trim()}
            size="sm"
            className="bg-primary hover:bg-primary/90 touch-manipulation"
          >
            Save
          </Button>
        </div>
      </header>

      <div className="flex-1 p-4 overflow-y-auto">

        <textarea
          ref={noteInputRef}
          value={noteInput}
          onChange={(e) => {
            setNoteInput(e.target.value);
            // Auto-resize
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          placeholder="Write anything…"
          autoFocus
          rows={2}
          className="w-full px-4 py-3 rounded-xl bg-card border-2 border-border text-foreground placeholder:text-muted-foreground/50 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none overflow-hidden"
        />
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAugmentNote}
            disabled={!noteInput.trim() || isRewriting}
            className="gap-2"
          >
            {isRewriting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Augmenting…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-primary" />
                Augment with AI
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground/50 mt-3 text-center">
          Tap Save when done
        </p>
      </div>
    </motion.div>
  );

  // Images screen
  const renderImagesScreen = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      className="h-full flex flex-col"
    >
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setActiveScreen('select')}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-coral/10 flex items-center justify-center">
              <Image className="w-4 h-4 text-red-coral" />
            </div>
            <h1 className="text-lg font-semibold">Images</h1>
            {images.length > 0 && (
              <span className="text-xs bg-red-coral/20 text-red-coral px-2 py-0.5 rounded-full">
                {images.length}
              </span>
            )}
          </div>
          <Button
            onClick={handleSaveImages}
            disabled={images.length === 0 || savingImages}
            size="sm"
            className="bg-primary hover:bg-primary/90"
          >
            {savingImages ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </header>

      <div className="flex-1 p-4 pb-24 overflow-y-auto space-y-4">
        {/* Uploaded images */}
        {images.map((img, index) => (
          <div key={index} className="relative rounded-xl overflow-hidden bg-secondary/30 border border-border">
            <img 
              src={img.preview} 
              alt={`Upload ${index + 1}`} 
              className="w-full max-h-[300px] object-contain"
            />
            <button
              onClick={() => removeImage(index)}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive text-destructive-foreground shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="p-3">
              <input
                type="text"
                value={img.caption}
                onChange={(e) => updateImageCaption(index, e.target.value)}
                placeholder="Add caption (optional)"
                className="w-full px-3 py-2 rounded-lg bg-background/50 border border-border/50 text-base md:text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>
        ))}
        
        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-12 rounded-xl border-2 border-dashed border-border/60 hover:border-red-coral/40 bg-card/40 hover:bg-card/60 transition-all flex flex-col items-center gap-3 group"
        >
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center group-hover:bg-red-coral/20 transition-colors">
            <Plus className="w-7 h-7 text-muted-foreground group-hover:text-red-coral transition-colors" />
          </div>
          <div className="text-center">
            <p className="text-base font-medium text-foreground">Add Images</p>
            <p className="text-sm text-muted-foreground mt-1">JPG, PNG, HEIC, WebP • Max 10MB</p>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>
    </motion.div>
  );

  // URLs screen
  const renderUrlsScreen = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      className="h-full flex flex-col"
    >
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setActiveScreen('select')}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-berry/10 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-red-berry" />
            </div>
            <h1 className="text-lg font-semibold">Links</h1>
            {urls.length > 0 && (
              <span className="text-xs bg-red-berry/20 text-red-berry px-2 py-0.5 rounded-full">
                {urls.length}
              </span>
            )}
          </div>
          <Button
            onClick={handleSaveUrls}
            disabled={urls.length === 0 && !currentUrl.trim()}
            size="sm"
            className="bg-primary hover:bg-primary/90"
          >
            Save
          </Button>
        </div>
      </header>

      <div className="flex-1 p-4 pb-24 overflow-y-auto space-y-4">
        {/* Added URLs */}
        {urls.map((urlItem, index) => (
          <div key={index} className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
            <div className="w-10 h-10 rounded-lg bg-red-berry/10 flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5 text-red-berry" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {urlItem.title || urlItem.url}
              </p>
              {urlItem.title && (
                <p className="text-xs text-muted-foreground truncate">{urlItem.url}</p>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!isValidUrl(urlItem.url)) {
                  showErrorPopup('Invalid or unsafe URL. Please check the link.');
                  return;
                }

                // Prefer opening in a new tab, but fall back to same-tab navigation
                // (some embedded/preview environments block popups/new tabs).
                const win = window.open(urlItem.url, '_blank', 'noopener,noreferrer');
                if (!win) window.location.assign(urlItem.url);
              }}
              className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors"
              aria-label="Open link"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
            <button
              onClick={() => removeUrl(index)}
              className="p-2 rounded-full hover:bg-destructive/10 text-destructive transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ))}

        {/* Add URL form */}
        <div className="space-y-3 p-4 rounded-xl bg-card border border-border">
          <h3 className="text-sm font-medium text-foreground">Add a link</h3>
          <input
            type="url"
            value={currentUrl}
            onChange={(e) => setCurrentUrl(e.target.value)}
            placeholder="https://example.com"
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground/50 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="text"
            value={currentUrlTitle}
            onChange={(e) => setCurrentUrlTitle(e.target.value)}
            placeholder="Custom title (optional)"
            className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground/50 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button
            onClick={addUrl}
            disabled={!currentUrl.trim()}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Link
          </Button>
        </div>
      </div>
    </motion.div>
  );

  // Table screen
  const renderTableScreen = () => {
    const hasContent = tableHeaders.some(h => h.trim()) || 
      tableRows.some(row => row.some(cell => cell.trim()));

    return (
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 50 }}
        className="h-full flex flex-col"
      >
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setActiveScreen('select')}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-maroon/10 flex items-center justify-center">
                <Table className="w-4 h-4 text-red-maroon" />
              </div>
              <h1 className="text-lg font-semibold">Table</h1>
            </div>
            <Button
              onClick={handleSaveTable}
              disabled={!hasContent}
              size="sm"
              className="bg-primary hover:bg-primary/90"
            >
              Save
            </Button>
          </div>
        </header>

        <div className="flex-1 p-4 pb-24 overflow-y-auto space-y-4">
          {/* Table controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={addColumn}
            >
              <Plus className="w-4 h-4 mr-1" />
              Column
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={addRow}
            >
              <Plus className="w-4 h-4 mr-1" />
              Row
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[300px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/20">
                    {tableHeaders.map((header, colIndex) => (
                      <th key={colIndex} className="relative p-0">
                        <input
                          type="text"
                          value={header}
                          onChange={(e) => updateHeader(colIndex, e.target.value)}
                          placeholder={`Header ${colIndex + 1}`}
                          className="w-full px-4 py-3 bg-transparent text-base md:text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:bg-primary/5"
                        />
                        {tableHeaders.length > 1 && (
                          <button
                            onClick={() => removeColumn(colIndex)}
                            className="absolute top-2 right-2 p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border/50 last:border-0 group">
                      {row.map((cell, colIndex) => (
                        <td key={colIndex} className="p-0">
                          <input
                            type="text"
                            value={cell}
                            onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                            placeholder="—"
                            className="w-full px-4 py-3 bg-transparent text-base md:text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:bg-primary/5"
                          />
                        </td>
                      ))}
                      {tableRows.length > 1 && (
                        <td className="p-0 w-10">
                          <button
                            onClick={() => removeRow(rowIndex)}
                            className="p-2 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Use for comparisons, lists, pricing, planning, or data
          </p>
        </div>
      </motion.div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-[10000] bg-background safe-area-top-ios"
        >
          <AnimatePresence mode="wait">
            {activeScreen === 'select' && renderSelectScreen()}
            {activeScreen === 'notes' && renderNotesScreen()}
            {activeScreen === 'images' && renderImagesScreen()}
            {activeScreen === 'urls' && renderUrlsScreen()}
            {activeScreen === 'table' && renderTableScreen()}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
