import { useState, useCallback, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Link2, X, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { searchGifs, getTrendingGifs, gifServiceEnabled, type GifResult } from '@/lib/gifService';
import { getGifKeywordForName } from '@/data/archiveCategories';
import { motion, AnimatePresence } from 'framer-motion';

interface GifPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  spaceName: string;
  currentGif?: string;
  onSelect: (gifUrl: string | null) => void;
}

type Tab = 'search' | 'url';

export function GifPickerSheet({ isOpen, onClose, spaceName, currentGif, onSelect }: GifPickerSheetProps) {
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedGif, setSelectedGif] = useState<string | null>(currentGif ?? null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedInitial = useRef(false);

  // Load initial suggestions when sheet opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedGif(currentGif ?? null);
    if (hasLoadedInitial.current) return;
    hasLoadedInitial.current = true;

    if (!gifServiceEnabled) return;

    const keyword = getGifKeywordForName(spaceName);
    setQuery(keyword);
    setIsLoading(true);
    searchGifs(keyword, 12).then((gifs) => {
      setResults(gifs);
      setIsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Debounced search
  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!gifServiceEnabled) return;
    setIsLoading(true);
    searchTimeout.current = setTimeout(async () => {
      const gifs = val.trim()
        ? await searchGifs(val.trim(), 12)
        : await getTrendingGifs(12);
      setResults(gifs);
      setIsLoading(false);
    }, 400);
  }, []);

  const handleSelectGif = (url: string) => {
    setSelectedGif(url);
    onSelect(url);
    onClose();
  };

  const handleApplyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) { setUrlError('Please enter a URL'); return; }
    try {
      const url = new URL(trimmed);
      if (!url.protocol.startsWith('http')) { setUrlError('URL must start with http or https'); return; }
    } catch {
      setUrlError('Invalid URL format');
      return;
    }
    setUrlError('');
    onSelect(trimmed);
    onClose();
  };

  const handleRemove = () => {
    setSelectedGif(null);
    onSelect(null);
    onClose();
  };

  const handleClose = () => {
    hasLoadedInitial.current = false;
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 max-h-[92dvh] flex flex-col gap-0 border-t border-border/50"
      >
        <SheetHeader className="px-5 pt-5 pb-3 shrink-0">
          <SheetTitle className="text-base font-semibold">GIF Background</SheetTitle>
          <p className="text-muted-foreground text-[13px]">
            Choose an animated background for your archive
          </p>
        </SheetHeader>

        {/* Tab bar */}
        <div className="flex gap-0 px-5 pb-3 shrink-0 border-b border-border/30">
          <button
            onClick={() => setTab('search')}
            className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-lg transition-colors ${
              tab === 'search'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Library
          </button>
          <button
            onClick={() => setTab('url')}
            className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-lg transition-colors ${
              tab === 'url'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            Paste URL
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {tab === 'search' ? (
              <motion.div
                key="search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                {/* Search bar */}
                <div className="px-5 py-3 sticky top-0 bg-background z-10 border-b border-border/20">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={query}
                      onChange={(e) => handleQueryChange(e.target.value)}
                      placeholder="Search GIFs…"
                      className="pl-9 bg-secondary border-0 h-10 rounded-xl text-[14px] shadow-input"
                    />
                    {query && (
                      <button
                        onClick={() => handleQueryChange('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {!gifServiceEnabled ? (
                  /* No API key — show instructions */
                  <div className="flex flex-col items-center justify-center py-14 px-8 gap-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-foreground mb-1">GIF search not configured</p>
                      <p className="text-[13px] text-muted-foreground leading-relaxed">
                        Add a free Giphy API key to{' '}
                        <code className="text-xs bg-secondary px-1 py-0.5 rounded">.env</code>
                        {' '}as{' '}
                        <code className="text-xs bg-secondary px-1 py-0.5 rounded">VITE_GIPHY_API_KEY</code>
                        {' '}to enable search.
                        <br />
                        <span className="text-muted-foreground/70">Use the "Paste URL" tab to set a GIF now.</span>
                      </p>
                    </div>
                  </div>
                ) : isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : results.length === 0 ? (
                  <div className="text-center py-14 px-8">
                    <p className="text-[14px] text-muted-foreground">No GIFs found for "{query}"</p>
                    <p className="text-[13px] text-muted-foreground/60 mt-1">Try a different search term</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 p-4">
                    {results.map((gif) => (
                      <GifThumbnail
                        key={gif.id}
                        gif={gif}
                        isSelected={selectedGif === gif.url}
                        onSelect={() => handleSelectGif(gif.url)}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="url"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-5 space-y-4"
              >
                {/* Current preview */}
                {currentGif && (
                  <div className="relative w-full h-40 rounded-xl overflow-hidden">
                    <img
                      src={currentGif}
                      alt="Current GIF"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute bottom-2 left-3">
                      <span className="text-white text-[11px] font-medium opacity-80">Current</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[13px] text-muted-foreground font-medium mb-2 block">
                    GIF URL
                  </label>
                  <Input
                    value={urlInput}
                    onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
                    placeholder="https://media.giphy.com/media/…/giphy.gif"
                    className="bg-secondary border-0 h-11 rounded-xl text-[14px] shadow-input"
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyUrl()}
                    autoFocus
                  />
                  {urlError && (
                    <p className="text-destructive text-[12px] mt-1">{urlError}</p>
                  )}
                  <p className="text-muted-foreground/60 text-[12px] mt-1.5">
                    Paste any direct .gif, .webp, or Giphy CDN URL
                  </p>
                </div>

                <Button
                  onClick={handleApplyUrl}
                  disabled={!urlInput.trim()}
                  className="w-full h-11 rounded-xl text-[15px] font-medium"
                >
                  Apply GIF
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {currentGif && (
          <div className="px-5 pb-5 pt-3 border-t border-border/30 shrink-0">
            <button
              onClick={handleRemove}
              className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Remove GIF background
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Individual GIF thumbnail with lazy load + hover-to-play preview */
function GifThumbnail({ gif, isSelected, onSelect }: {
  gif: GifResult;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative aspect-video rounded-xl overflow-hidden bg-secondary transition-all ${
        isSelected ? 'ring-2 ring-primary' : 'ring-0 hover:ring-2 hover:ring-white/40'
      }`}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />
        </div>
      )}
      <img
        src={isHovered ? gif.url : gif.preview}
        alt={gif.title}
        loading="lazy"
        className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
      {isSelected && (
        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      )}
    </button>
  );
}
