import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface MarqueeHeaderProps {
  text: string;
  /** Number of times to repeat the text in each half (default 12) */
  repeats?: number;
  /** Pixels per second — consistent speed regardless of text length (default 60) */
  speed?: number;
  className?: string;
}

/**
 * A continuously scrolling horizontal marquee of repeated text.
 * Uses measured content width to ensure consistent scroll speed across different text lengths.
 */
export function MarqueeHeader({ text, repeats = 12, speed = 60, className = '' }: MarqueeHeaderProps) {
  const separator = '\u2003';
  const content = Array(repeats).fill(text).join(separator) + separator;
  const spanRef = useRef<HTMLSpanElement>(null);
  const [spanWidth, setSpanWidth] = useState(0);
  const duration = spanWidth > 0 ? spanWidth / speed : 20;

  useEffect(() => {
    if (spanRef.current) {
      setSpanWidth(spanRef.current.offsetWidth);
    }
  }, [text, repeats, speed]);

  const spanStyle: React.CSSProperties = { fontWeight: 900, textShadow: '0 0 1px currentColor' };
  const spanClass = "text-[3.25rem] tracking-[-0.04em] uppercase text-foreground select-none pr-[0.15em] leading-none";

  return (
    <div className={`overflow-hidden whitespace-nowrap flex-shrink-0 max-w-full ${className}`}>
      <motion.div
        className="inline-flex w-max will-change-transform"
        animate={{ x: spanWidth > 0 ? [0, -spanWidth] : 0 }}
        transition={{ duration, ease: 'linear', repeat: Infinity, repeatType: 'loop' }}
      >
        <span ref={spanRef} className={spanClass} style={spanStyle}>{content}</span>
        <span className={spanClass} style={spanStyle}>{content}</span>
      </motion.div>
    </div>
  );
}
