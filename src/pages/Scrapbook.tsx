import { ScrapbookCard } from '@/components/ScrapbookCard';
import { useScrapbook } from '@/contexts/ScrapbookContext';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen } from 'lucide-react';

export default function Scrapbook() {
  const { entries } = useScrapbook();

  return (
    <div className="min-h-screen bg-background safe-area-top-ios">
      {/* Header */}
      <header className="sticky safe-sticky-top z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-2xl mx-auto px-5 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            My Scrapbook
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Collect your thoughts, ideas & moments
          </p>
        </div>
      </header>

      {/* Feed */}
      <main className="max-w-2xl mx-auto px-5 pb-20">
        {entries.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary mb-5">
              <BookOpen className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Start your scrapbook
            </h3>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
              Type anything above — notes, lists, ideas. Paste images. Everything autosaves.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {entries.map((entry) => (
                <ScrapbookCard key={entry.id} entry={entry} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
