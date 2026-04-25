import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, ArrowLeft, ImagePlus, X, Shuffle } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';
import { useTutorial } from '@/contexts/TutorialContext';
import { ARCHIVE_CATEGORIES, ARCHIVE_GROUPS, unsplashSourceUrl, getGifKeywordForName, type ArchiveCategory } from '@/data/archiveCategories';
import { autoAssignGif } from '@/lib/gifService';

// Curated palette of deep, rich tones — all look great with white text
const COLLECTION_COLORS = [
  '#0d1b2a', '#1b1f3b', '#2d1b69', '#1a2f1a',
  '#2d1b1b', '#1b2d2d', '#1f1a0a', '#0f2318',
  '#2a0a2a', '#1a0a0a', '#0a1a2a', '#1a1a0d',
];

function pickColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return COLLECTION_COLORS[Math.abs(hash) % COLLECTION_COLORS.length];
}

interface AddSpaceDialogProps {
  variant?: 'card' | 'button';
  trigger?: React.ReactNode;
  navigateAfterCreate?: boolean;
  onAfterCreate?: (id: string) => void;
}

type Step = 'pick' | 'confirm';

export function AddSpaceDialog({ variant = 'card', trigger, navigateAfterCreate = false, onAfterCreate }: AddSpaceDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('pick');
  const [query, setQuery] = useState('');
  const [deferredQuery, setDeferredQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // Debounce query so the image grid doesn't re-render on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDeferredQuery(query), 180);
    return () => clearTimeout(timer);
  }, [query]);

  // confirm step state
  const [name, setName] = useState('');
  const [image, setImage] = useState<string | undefined>();
  const [isCustom, setIsCustom] = useState(false);
  const [imageError, setImageError] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addSpace, updateSpaceGif, spaces } = useSpaces();
  const navigate = useNavigate();
  const { reportTutorialAction } = useTutorial();

  // ── filtered category list ─────────────────────────────────────────────────
  // Only show recommendations matching the query; exclude archives already created
  const existingNames = useMemo(
    () => new Set(spaces.map((s) => s.name.toLowerCase())),
    [spaces]
  );

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return [];
    return ARCHIVE_CATEGORIES.filter((c) => {
      if (existingNames.has(c.name.toLowerCase())) return false;
      const matchesQuery = c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q);
      const matchesGroup = !activeGroup || c.group === activeGroup;
      return matchesQuery && matchesGroup;
    });
  }, [deferredQuery, activeGroup, existingNames]);

  // ── reset all state when dialog closes ────────────────────────────────────
  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) {
      setStep('pick');
      setQuery('');
      setDeferredQuery('');
      setActiveGroup(null);
      setName('');
      setImage(undefined);
      setIsCustom(false);
      setImageError(false);
    }
  };

  // ── select a pre-built category ───────────────────────────────────────────
  const selectCategory = (cat: ArchiveCategory) => {
    setName(cat.name);
    setImage(cat.photoUrl);
    setIsCustom(false);
    setImageError(false);
    setStep('confirm');
  };

  // ── enter custom title flow ───────────────────────────────────────────────
  const enterCustom = (initialName = '') => {
    setName(initialName);
    setImage(undefined);
    setIsCustom(true);
    setImageError(false);
    setStep('confirm');
  };

  // When a custom name is committed, derive the Unsplash source URL
  const resolvedImage = useMemo(() => {
    if (image) return image;
    if (isCustom && name.trim()) return unsplashSourceUrl(name.trim());
    return undefined;
  }, [image, isCustom, name]);

  // ── handle user uploading their own photo ─────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
      setImageError(false);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImage(undefined);
    setImageError(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── pick a random category for inspiration ────────────────────────────────
  const randomCategory = () => {
    const cat = ARCHIVE_CATEGORIES[Math.floor(Math.random() * ARCHIVE_CATEGORIES.length)];
    selectCategory(cat);
  };

  // ── create the archive ────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!name.trim()) return;

    const spaceName = name.trim();
    const finalImage = resolvedImage;
    const autoColor = finalImage ? undefined : pickColor(spaceName);

    // Attempt to auto-assign a GIF background in parallel with space creation.
    // Silently skips if VITE_GIPHY_API_KEY is not configured.
    const gifKeyword = getGifKeywordForName(spaceName);
    const autoGifPromise = autoAssignGif(gifKeyword);

    const newId = addSpace(spaceName, finalImage, autoColor);
    // Attach GIF background non-blocking (best-effort, no API delay on the UI)
    autoGifPromise.then((autoGif) => {
      if (autoGif) updateSpaceGif(newId, autoGif);
    });
    reportTutorialAction('add-collection');
    handleOpenChange(false);
    localStorage.setItem('secondmind_tutorial_space_id', newId);
    if (onAfterCreate) {
      // Delay slightly so the dialog close animation (200ms) fully completes
      // before navigating into the new space — prevents the overlay from
      // blocking interaction with the just-opened SpaceDetail.
      setTimeout(() => onAfterCreate(newId), 220);
    } else if (navigateAfterCreate) {
      navigate(`/space/${newId}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ? trigger : variant === 'button' ? (
          <Button
            variant="outline"
            data-tutorial="add-collection"
            className="w-full gap-2 h-11 rounded-xl border-border/60 hover:bg-secondary hover:border-border"
          >
            <Plus className="w-4 h-4" />
            New Archive
          </Button>
        ) : (
          <button
            data-tutorial="add-collection"
            className="w-full aspect-square text-left bg-secondary/30 hover:bg-secondary/50 transition-all duration-200 border-2 border-dashed border-border/40 hover:border-border/60 rounded-none"
          >
            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground h-full">
              <Plus className="w-6 h-6" />
              <span className="text-[14px] font-medium">New Section</span>
            </div>
          </button>
        )}
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-lg rounded-2xl p-0 overflow-hidden gap-0 flex flex-col [&>button:last-child]:hidden translate-y-0 sm:top-[50%] sm:translate-y-[-50%] top-[calc(env(safe-area-inset-top,0px)+24px)] max-h-[calc(100svh-env(safe-area-inset-top,0px)-48px)] sm:max-h-[90svh]"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {/* ── STEP 1: Pick a category ─────────────────────────────────────── */}
        {step === 'pick' && (
          <>
            <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
              <DialogTitle className="text-lg">Create Archive</DialogTitle>
            </DialogHeader>

            {/* Search + filter pills — kept outside DialogHeader to avoid clipping */}
            <div className="px-5 pt-3 pb-3 shrink-0">
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActiveGroup(null); }}
                  placeholder="Search archives…"
                  className="pl-9 bg-secondary border-0 h-10 rounded-xl text-[14px] shadow-input focus-visible:ring-2"
                  inputMode="search"
                  autoFocus
                />
              </div>

              {/* Group filter pills — only shown while searching */}
              {query.trim() && (
                <div className="flex gap-2 overflow-x-auto pb-0.5 mt-3 scrollbar-hide">
                  <button
                    onClick={() => setActiveGroup(null)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                      !activeGroup
                        ? 'bg-foreground text-background'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    All
                  </button>
                  {ARCHIVE_GROUPS.map((g) => (
                    <button
                      key={g}
                      onClick={() => setActiveGroup(g === activeGroup ? null : g)}
                      className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                        activeGroup === g
                          ? 'bg-foreground text-background'
                          : 'bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category grid / idle state */}
            <div className="overflow-y-auto flex-1 px-4 pb-4">
              {!deferredQuery.trim() ? (
                /* Idle — prompt the user to start typing */
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                  <p className="text-muted-foreground text-[14px]">Start typing to see recommendations</p>
                  <p className="text-muted-foreground/65 text-[13px]">or use "Custom title" below</p>
                </div>
              ) : filtered.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {filtered.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => selectCategory(cat)}
                      className="relative aspect-square rounded-xl overflow-hidden group text-left touch-manipulation"
                    >
                      <img
                        src={cat.photoUrl}
                        alt={cat.name}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-white text-[11px] font-semibold leading-tight drop-shadow">{cat.name}</p>
                      </div>
                      <div className="absolute inset-0 ring-2 ring-white/0 group-hover:ring-white/60 rounded-xl transition-all" />
                    </button>
                  ))}
                  {/* Fill last row so the grid stays even */}
                  {filtered.length % 3 !== 0 &&
                    Array.from({ length: 3 - (filtered.length % 3) }).map((_, i) => (
                      <div key={`spacer-${i}`} className="aspect-square" />
                    ))}
                </div>
              ) : (
                /* No matching recommendations — prompt to create custom */
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <p className="text-muted-foreground text-[14px]">No suggestions for "{query}"</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => enterCustom(query)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Create "{query}"
                  </Button>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-4 pb-4 pt-2 flex gap-2 border-t border-border/40 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 text-[13px]"
                onClick={randomCategory}
              >
                <Shuffle className="w-3.5 h-3.5" />
                Random
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 text-[13px] ml-auto"
                onClick={() => enterCustom(query)}
              >
                <Plus className="w-3.5 h-3.5" />
                Custom title
              </Button>
            </div>
          </>
        )}

        {/* ── STEP 2: Confirm name + photo preview ────────────────────────── */}
        {step === 'confirm' && (
          <>
            <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep('pick')}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <DialogTitle className="text-lg">Confirm Archive</DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-5 px-5 pt-4 pb-5 overflow-y-auto flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />

              {/* Cover preview */}
              <div>
                <label className="text-[13px] text-muted-foreground font-medium mb-2 block">
                  Cover photo
                  {isCustom && !image && (
                    <span className="text-muted-foreground/50 font-normal ml-1">— auto-selected from title</span>
                  )}
                </label>

                {resolvedImage && !imageError ? (
                  <div className="relative w-full h-36 rounded-xl overflow-hidden">
                    <img
                      src={resolvedImage}
                      alt="Cover preview"
                      className="w-full h-full object-cover"
                      onError={() => setImageError(true)}
                    />
                    {/* Name overlay */}
                    {name.trim() && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-3">
                        <span className="text-white font-bold text-lg leading-tight drop-shadow">{name.trim()}</span>
                      </div>
                    )}
                    <button
                      onClick={removeImage}
                      className="absolute top-2 right-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-lg hover:bg-background transition-colors shadow-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  /* Color fallback */
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-36 rounded-xl overflow-hidden relative group"
                    style={{
                      background: name.trim()
                        ? `linear-gradient(145deg, ${pickColor(name.trim())}, ${pickColor(name.trim())}cc)`
                        : undefined,
                    }}
                  >
                    {name.trim() ? (
                      <>
                        <span
                          className="absolute inset-0 flex items-end p-3 text-white text-2xl font-black leading-none"
                          style={{ textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}
                        >
                          {name.trim()}
                        </span>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="flex items-center gap-2 text-white text-[13px] font-medium">
                            <ImagePlus className="w-4 h-4" />
                            Add custom image or GIF
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full border-2 border-dashed border-border hover:border-border/80 hover:bg-secondary/50 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground transition-all">
                        <ImagePlus className="w-5 h-5" />
                        <span className="text-[13px] font-medium">Add custom image or GIF</span>
                      </div>
                    )}
                  </button>
                )}

                {/* Photo action row */}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    Add custom image or GIF
                  </button>
                  {resolvedImage && !imageError && (
                    <button
                      onClick={removeImage}
                      className="text-[12px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              {/* Name input */}
              <div>
                <label className="text-[13px] text-muted-foreground font-medium mb-2 block">Name</label>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    // If custom and using source URL, reset imageError so it retries
                    if (isCustom && !image) setImageError(false);
                  }}
                  placeholder="e.g., Design, Travel, Health…"
                  className="bg-secondary border-0 h-11 rounded-xl text-[15px] shadow-input focus-visible:ring-2"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  autoFocus={isCustom}
                />
              </div>

              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!name.trim()}
                className="w-full h-11 rounded-xl text-[15px] font-medium"
              >
                Create Archive
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
