import { motion } from 'framer-motion';
import splashLogo from '@/assets/splash-logo.png';

interface SecondMindLoaderProps {
  /** Size in pixels (default 20 for inline use) */
  size?: number;
  className?: string;
}

/**
 * Optional branded inline spinner using the Second Mind logo.
 * Use for buttons and inline loading states — NOT as a global blocking overlay.
 */
export function SecondMindLoader({ size = 20, className = '' }: SecondMindLoaderProps) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <motion.img
      src={splashLogo}
      alt=""
      className={`select-none pointer-events-none ${className}`}
      style={{ width: size, height: size, objectFit: 'contain' }}
      animate={
        prefersReducedMotion
          ? { opacity: [0.4, 1, 0.4] }
          : { rotate: 360 }
      }
      transition={
        prefersReducedMotion
          ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 1.4, repeat: Infinity, ease: 'linear' }
      }
    />
  );
}
