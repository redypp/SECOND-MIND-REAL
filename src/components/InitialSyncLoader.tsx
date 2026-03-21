import { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import splashLogo from '@/assets/splash-logo.png';

type LoadingPhase = 'connecting' | 'profile' | 'collections' | 'items' | 'complete' | 'error';

interface InitialSyncLoaderProps {
  phase: LoadingPhase;
  progress: number;
  error: string | null;
  onRetry: () => void;
}

export function InitialSyncLoader({ phase, progress, error, onRetry }: InitialSyncLoaderProps) {
  const [showRetry, setShowRetry] = useState(false);
  const [isOnline, setIsOnline] = useState(() => {
    try {
      return typeof navigator !== 'undefined' ? navigator.onLine : true;
    } catch {
      return true;
    }
  });

  // Track online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Show retry button after delay or on error
  useEffect(() => {
    if (phase === 'error') {
      setShowRetry(true);
      return;
    }
    
    setShowRetry(false);
    
    const timer = setTimeout(() => {
      if (phase !== 'complete') {
        setShowRetry(true);
      }
    }, 8000);
    
    return () => clearTimeout(timer);
  }, [phase]);

  const isError = phase === 'error';

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-6"
      >
        {/* Spinner or error/offline icon */}
        {isError ? (
          <AlertCircle className="w-10 h-10 text-destructive" />
        ) : !isOnline ? (
          <WifiOff className="w-10 h-10 text-muted-foreground" />
        ) : (
          <motion.img
            src={splashLogo}
            alt=""
            className="select-none pointer-events-none"
            style={{ width: 80, height: 80, objectFit: 'contain' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          />
        )}
        
        {/* Status text on error or offline */}
        {(isError || !isOnline) && (
          <p className="text-sm text-muted-foreground">
            {isError && error ? error : 'No internet connection'}
          </p>
        )}

        {/* Having trouble message for long loads */}
        {showRetry && !isError && isOnline && (
          <p className="text-sm text-muted-foreground">
            Having trouble connecting...
          </p>
        )}
        
        {/* Retry button */}
        <AnimatePresence>
          {(showRetry || !isOnline) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <Button 
                variant={isError ? "default" : "outline"}
                size="sm" 
                onClick={onRetry}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {isError ? 'Try again' : 'Retry'}
              </Button>
              
              {!isOnline && (
                <p className="text-xs text-muted-foreground mt-3">
                  Please check your connection and try again
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
