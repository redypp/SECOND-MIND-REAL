import { motion } from 'framer-motion';

interface PageIndicatorsProps {
  currentIndex: number;
  totalPages: number;
  onPageSelect?: (index: number) => void;
}

const LABELS = ['LIFE', 'ARCHIVE'];

export function PageIndicators({ currentIndex, onPageSelect }: PageIndicatorsProps) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 pointer-events-none page-indicators" style={{ width: '50%', maxWidth: '220px' }}>
      <div className="relative w-full flex items-center justify-center pointer-events-auto" style={{ height: '44px' }}>
        {/* Text labels */}
        <div className="flex w-full justify-between px-2">
          {LABELS.map((label, i) => (
            <button
              key={label}
              className="touch-manipulation py-2 px-3"
              onClick={() => onPageSelect?.(i)}
              aria-label={label}
            >
              <motion.span
                className="font-display text-[10px] uppercase tracking-[0.16em] font-bold select-none"
                animate={{
                  opacity: currentIndex === i ? 1 : 0.3,
                }}
                transition={{ duration: 0.25 }}
              >
                {label}
              </motion.span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
