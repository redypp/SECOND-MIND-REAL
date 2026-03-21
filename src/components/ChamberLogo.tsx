import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface ChamberLogoProps {
  size?: number;
  spin?: boolean;
  className?: string;
}

export function ChamberLogo({ size = 44, spin = false, className = '' }: ChamberLogoProps) {
  const iconSize = Math.round(size * 0.48);

  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #ff6b8a 0%, #e8305a 45%, #c0154a 100%)',
      }}
    >
      <motion.div
        animate={spin ? { rotate: 360 } : {}}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Sparkles style={{ width: iconSize, height: iconSize, color: 'white' }} />
      </motion.div>
    </div>
  );
}
