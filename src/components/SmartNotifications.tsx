import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { useAI } from '@/hooks/useAI';
import { useAISettings } from '@/contexts/AISettingsContext';

interface Suggestion {
  text: string;
  type: 'task' | 'reminder' | 'idea';
}

const STORAGE_KEY = 'secondmind_last_notification';
const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours between notifications

export function SmartNotifications() {
  const { settings } = useAISettings();
  const { getSmartSuggestions, isLoading } = useAI();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldShowNotification = useCallback(() => {
    if (!settings.smartNotifications) return false;
    
    const lastShown = localStorage.getItem(STORAGE_KEY);
    if (lastShown) {
      const timeSince = Date.now() - parseInt(lastShown, 10);
      if (timeSince < MIN_INTERVAL_MS) return false;
    }
    
    return true;
  }, [settings]);

  const fetchSuggestions = useCallback(async () => {
    if (!shouldShowNotification()) return;
    
    setError(null);
    const result = await getSmartSuggestions();
    
    if (result.error) {
      setError(result.error);
      return;
    }
    
    if (result.suggestions.length > 0) {
      setSuggestions(result.suggestions.slice(0, settings.notificationFrequency));
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }
  }, [getSmartSuggestions, shouldShowNotification, settings.notificationFrequency]);

  useEffect(() => {
    // Initial fetch after a short delay
    const timer = setTimeout(fetchSuggestions, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    setTimeout(() => {
      setSuggestions([]);
      setDismissed(false);
    }, 300);
  };

  const handleRefresh = () => {
    setDismissed(false);
    fetchSuggestions();
  };

  // Don't show if smart notifications disabled or AI features locked
  if (!settings.smartNotifications || !settings.isPremiumUnlocked) return null;
  if (suggestions.length === 0 && !isLoading) return null;

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-20 left-4 right-4 z-50"
        >
          <div className="bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-medium">Smart Suggestions</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="p-1.5 rounded-full hover:bg-accent/50 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={handleDismiss}
                  className="p-1.5 rounded-full hover:bg-accent/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Analyzing your data...</span>
                </div>
              ) : error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                suggestions.map((suggestion, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <div className={`w-2 h-2 mt-2 rounded-full ${
                      suggestion.type === 'task' ? 'bg-blue-500' :
                      suggestion.type === 'reminder' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} />
                    <p className="text-sm text-foreground flex-1">{suggestion.text}</p>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
