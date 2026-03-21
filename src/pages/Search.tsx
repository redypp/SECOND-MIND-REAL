import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, X, Sparkles, Loader2, MessageSquare, Grid3X3, ArrowRight } from 'lucide-react';
import { ItemCard } from '@/components/ItemCard';
import { searchItems } from '@/data/mockData';
import { Item } from '@/types';
import { useSemanticSearch, SemanticResult } from '@/hooks/useSemanticSearch';
import { useSpaces } from '@/contexts/SpacesContext';
import { motion, AnimatePresence } from 'framer-motion';

type SearchMode = 'quick' | 'ai';

export default function Search() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [mode, setMode] = useState<SearchMode>('quick');
  const [aiQuery, setAiQuery] = useState('');
  const [aiResults, setAiResults] = useState<SemanticResult[]>([]);
  const [aiAnswer, setAiAnswer] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const { search, isSearching } = useSemanticSearch();
  const { items } = useSpaces();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mode === 'quick') {
      if (query.trim()) {
        const found = searchItems(query);
        setResults(found);
      } else {
        setResults([]);
      }
    }
  }, [query, mode]);

  const handleAiSearch = useCallback(async () => {
    if (!aiQuery.trim()) return;
    setHasSearched(true);
    const response = await search(aiQuery);
    if (response) {
      setAiAnswer(response.answer);
      setAiResults(response.results.filter(r => r.relevanceScore > 0.3));
    }
  }, [aiQuery, search]);

  // Find matching Item objects for AI results
  const getItemForResult = (result: SemanticResult): Item | undefined => {
    return items.find(i => i.id === result.itemId);
  };

  return (
    <div className="min-h-screen bg-background page-transition safe-area-top-ios">
      {/* Search Header */}
      <header className="sticky safe-sticky-top z-40 bg-background border-b border-border/50">
        <div className="flex items-center gap-3 px-4 h-14">
          <SearchIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {mode === 'quick' ? (
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your mind..."
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-base"
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
              placeholder="Where did I write about..."
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-base"
            />
          )}
          {(query || aiQuery) && (
            <button
              onClick={() => { setQuery(''); setAiQuery(''); setAiResults([]); setAiAnswer(''); setHasSearched(false); }}
              className="p-1 rounded-full hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex px-4 pb-2 gap-2">
          <button
            onClick={() => setMode('quick')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              mode === 'quick'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Grid3X3 className="w-3 h-3" />
            Quick
          </button>
          <button
            onClick={() => { setMode('ai'); setTimeout(() => inputRef.current?.focus(), 100); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              mode === 'ai'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            Ask AI
          </button>
        </div>
      </header>

      {/* Results */}
      <div className="px-4 py-4">

        {/* QUICK MODE */}
        {mode === 'quick' && (
          <>
            {!query && (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-sm">Try searching for anything you've saved</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {['kickflip', 'ideas', 'tokyo', 'design'].map((term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className="px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-sm hover:bg-accent transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
                {/* Prompt to try AI search */}
                <div className="mt-8 mx-4">
                  <button
                    onClick={() => { setMode('ai'); setTimeout(() => inputRef.current?.focus(), 100); }}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">Ask AI to find anything</p>
                      <p className="text-xs text-muted-foreground mt-0.5">"Where did I write about my Tokyo trip?"</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" />
                  </button>
                </div>
              </div>
            )}

            {query && results.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No results for "{query}"</p>
                <button
                  onClick={() => { setMode('ai'); setAiQuery(query); setTimeout(() => handleAiSearch(), 100); }}
                  className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Try AI search instead
                </button>
              </div>
            )}

            {results.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </p>
                <div className="grid gap-3">
                  {results.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* AI MODE */}
        {mode === 'ai' && (
          <>
            {!hasSearched && !isSearching && (
              <div className="py-8 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mb-3">Try asking</p>
                {[
                  "Where did I write about my travel plans?",
                  "What ideas did I save about design?",
                  "Show me all my work-related notes",
                  "What was that startup idea I had?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setAiQuery(prompt); setTimeout(() => handleAiSearch(), 50); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border hover:border-primary/30 hover:bg-card/80 transition-all text-left group"
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    <span className="text-sm text-foreground">{prompt}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Search button */}
            {aiQuery.trim() && !isSearching && !hasSearched && (
              <button
                onClick={handleAiSearch}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm mb-4"
              >
                <Sparkles className="w-4 h-4" />
                Search with AI
              </button>
            )}

            {/* Loading */}
            <AnimatePresence>
              {isSearching && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center py-12 gap-3"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                  </div>
                  <p className="text-sm text-muted-foreground">Searching your memory…</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI Answer */}
            <AnimatePresence>
              {hasSearched && !isSearching && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Direct answer */}
                  {aiAnswer && (
                    <div className="flex gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15">
                      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{aiAnswer}</p>
                    </div>
                  )}

                  {/* Results */}
                  {aiResults.length > 0 ? (
                    <>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {aiResults.length} relevant note{aiResults.length !== 1 ? 's' : ''} found
                      </p>
                      <div className="grid gap-3">
                        {aiResults.map((result) => {
                          const item = getItemForResult(result);
                          return (
                            <div key={result.itemId} className="relative">
                              {item ? (
                                <div className="relative">
                                  <ItemCard item={item} />
                                  <div className="mt-1.5 mx-1 flex items-center gap-1.5">
                                    <span className="text-xs text-primary/80 font-medium">{result.matchReason}</span>
                                    <div className="flex-1 h-px bg-border/40" />
                                    <span className="text-xs text-muted-foreground">{Math.round(result.relevanceScore * 100)}% match</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-4 rounded-xl bg-card border border-border">
                                  <p className="text-sm font-medium text-foreground">{result.itemTitle}</p>
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{result.snippet}</p>
                                  <p className="text-xs text-primary/70 mt-2">{result.matchReason}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    !aiAnswer && (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground text-sm">Nothing found for "{aiQuery}"</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Try rephrasing or use different keywords</p>
                      </div>
                    )
                  )}

                  {/* Search again */}
                  <button
                    onClick={() => { setHasSearched(false); setAiResults([]); setAiAnswer(''); setAiQuery(''); setTimeout(() => inputRef.current?.focus(), 100); }}
                    className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors"
                  >
                    Search again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
