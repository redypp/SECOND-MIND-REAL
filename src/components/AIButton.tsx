import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Lock, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAISettings } from '@/contexts/AISettingsContext';
import { ChamberModal } from './ChamberModal';
import { ChamberLogo } from './ChamberLogo';

export function AIButton() {
  const { settings, updateSettings } = useAISettings();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const location = useLocation();

  if (location.pathname === '/auth' || !settings.chamberEnabled || settings.aiButtonHidden || isModalOpen) {
    return null;
  }

  const handleClick = () => {
    if (!settings.isPremiumUnlocked) {
      setShowMenu(prev => !prev);
      return;
    }
    setIsModalOpen(true);
  };

  const handleHide = () => {
    updateSettings({ aiButtonHidden: true });
    setShowMenu(false);
  };

  return (
    <>
      <AnimatePresence>
        {showMenu && !settings.isPremiumUnlocked && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="fixed bottom-20 left-3 z-40 bg-background border border-border rounded-xl shadow-lg overflow-hidden min-w-[160px]"
          >
            <div className="p-3 border-b border-border">
              <p className="text-xs font-medium">AI Features</p>
              <p className="text-xs text-muted-foreground">Coming soon with premium</p>
            </div>
            <button
              onClick={handleHide}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <EyeOff className="w-4 h-4 text-muted-foreground" />
              Hide this button
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        onClick={handleClick}
        className="fixed bottom-0 left-0 z-40 pb-[calc(env(safe-area-inset-bottom,0px)+6px)] pl-4 flex items-end"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)' }}
        aria-label={settings.isPremiumUnlocked ? "Open AI Chamber" : "AI Chamber (Premium)"}
      >
        <div className="relative">
          <ChamberLogo size={48} spin={settings.isPremiumUnlocked} />
          {!settings.isPremiumUnlocked && (
            <Lock className="w-3.5 h-3.5 text-white absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5" />
          )}
        </div>
      </motion.button>

      <ChamberModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {showMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
      )}
    </>
  );
}
