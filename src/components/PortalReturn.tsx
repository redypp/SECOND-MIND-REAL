import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import logo from '@/assets/logo.jpg';

/**
 * PortalReturn — tapping the logo navigates to the home screen.
 * Sits in page mastheads as a compact, always-available home button.
 */
export function PortalReturn({ className = '' }: { className?: string }) {
  const navigate = useNavigate();

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/')}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      aria-label="Go home"
      className={`shrink-0 inline-flex items-center justify-center touch-manipulation focus:outline-none ${className}`}
    >
      <img
        src={logo}
        alt="Second Mind"
        className="w-8 h-8 rounded-full object-cover"
        draggable={false}
      />
    </motion.button>
  );
}
