import { motion } from 'framer-motion';

interface PageIndicatorsProps {
  currentIndex: number;
  totalPages: number;
  onPageSelect?: (index: number) => void;
}

export function PageIndicators({ currentIndex, onPageSelect }: PageIndicatorsProps) {
  return (
    <nav className="fixed bottom-[calc(var(--app-safe-bottom,0px)+4px)] left-1/2 -translate-x-1/2 z-50 pointer-events-none page-indicators" style={{ width: '25%' }}>
      {/* Outer container expanded to 44px for proper iOS tap targets */}
      <div className="relative w-full flex items-center justify-center pointer-events-auto" style={{ height: '44px' }}>
        {/* Visual pill — stays 4px, centered in the 44px hit area */}
        <div className="relative w-full h-[4px] rounded-full bg-foreground/20 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-0 bottom-0 rounded-full bg-foreground/50"
            style={{ width: 'calc(50% - 2px)' }}
            animate={{
              left: currentIndex === 0 ? '3px' : 'calc(50%)',
            }}
            transition={{
              type: 'spring',
              stiffness: 700,
              damping: 35,
              mass: 0.6,
            }}
          />
        </div>

        {/* Tap zones — full 44px height, layered on top */}
        <button
          className="absolute left-0 top-0 bottom-0 w-1/2 touch-manipulation"
          onClick={() => onPageSelect?.(0)}
          aria-label="Life"
        />
        <button
          className="absolute right-0 top-0 bottom-0 w-1/2 touch-manipulation"
          onClick={() => onPageSelect?.(1)}
          aria-label="Archive"
        />
      </div>
    </nav>
  );
}
