import { motion } from 'framer-motion';

interface PageIndicatorsProps {
  currentIndex: number;
  totalPages: number;
  onPageSelect?: (index: number) => void;
}

export function PageIndicators({ currentIndex, onPageSelect }: PageIndicatorsProps) {
  return (
    <nav className="fixed bottom-[calc(var(--app-safe-bottom,0px)+4px)] left-1/2 -translate-x-1/2 z-50 pointer-events-none page-indicators" style={{ width: '25%' }}>
      <div
        className="relative w-full h-[4px] rounded-full bg-foreground/20 pointer-events-auto flex overflow-hidden"
      >
        {/* Sliding capsule */}
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

        {/* Tap zones */}
        <button
          className="flex-1 relative z-10 touch-manipulation"
          onClick={() => onPageSelect?.(0)}
          aria-label="Life"
        />
        <button
          className="flex-1 relative z-10 touch-manipulation"
          onClick={() => onPageSelect?.(1)}
          aria-label="Archive"
        />
      </div>
    </nav>
  );
}
