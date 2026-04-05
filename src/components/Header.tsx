import { ArrowLeft, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NotificationBell } from './NotificationBell';
import { SyncStatusIndicator } from './SyncStatusIndicator';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  backTo?: string; // Optional specific path to navigate to
  right?: React.ReactNode;
  showSettings?: boolean;
  showNotifications?: boolean;
  showSyncStatus?: boolean;
}

export function Header({ title, showBack = false, backTo, right, showSettings = false, showNotifications = false, showSyncStatus = false }: HeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="sticky safe-sticky-top z-40 glass border-b border-border/40">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-3">
          {showBack && (
            <motion.button
              whileHover={{ x: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleBack}
              className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </motion.button>
          )}
          {title && (
            <h1 className="text-base font-semibold text-foreground tracking-tight">
              {title}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-1">
          {showSyncStatus && <SyncStatusIndicator />}
          {showNotifications && <NotificationBell />}
          {showSettings && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/settings')}
              className="p-2 rounded-xl hover:bg-secondary transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5 text-foreground" />
            </motion.button>
          )}
          {right && <div>{right}</div>}
        </div>
      </div>
    </header>
  );
}
