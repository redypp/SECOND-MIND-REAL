import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LinkIcon, Loader2, RefreshCw } from 'lucide-react';
import { useAI } from '@/hooks/useAI';
import { useAISettings } from '@/contexts/AISettingsContext';
import { useSpaces } from '@/contexts/SpacesContext';

interface Connection {
  itemId: string;
  reason: string;
  strength: number;
}

interface RelatedNotesProps {
  currentItemId: string;
}

export function RelatedNotes({ currentItemId }: RelatedNotesProps) {
  const navigate = useNavigate();
  const { settings } = useAISettings();
  const { findConnections, isLoading } = useAI();
  const { items } = useSpaces();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchConnections = async () => {
    if (!settings.autoConnections) return;
    
    setError(null);
    const result = await findConnections(currentItemId);
    
    if (result.error) {
      setError(result.error);
    } else {
      setConnections(result.connections.slice(0, 5));
    }
    setHasFetched(true);
  };

  useEffect(() => {
    if (!hasFetched && settings.autoConnections) {
      // Delay fetch to avoid blocking initial render
      const timer = setTimeout(fetchConnections, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentItemId, settings.autoConnections, hasFetched]);

  if (!settings.autoConnections) return null;
  if (!isLoading && connections.length === 0 && !error) return null;

  const getConnectedItem = (itemId: string) => items.find(i => i.id === itemId);

  return (
    <div className="mt-6 pt-6 border-t border-border/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-cyan-500" />
          <span className="text-sm font-medium">Related Notes</span>
        </div>
        <button
          onClick={fetchConnections}
          disabled={isLoading}
          className="p-1.5 rounded-full hover:bg-accent/50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Finding connections...</span>
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : (
        <div className="space-y-3">
          {connections.map((connection, index) => {
            const item = getConnectedItem(connection.itemId);
            if (!item) return null;

            const title = item.title || 
              item.blocks?.find(b => 'content' in b)?.content?.slice(0, 50) || 
              'Untitled';

            return (
              <motion.button
                key={connection.itemId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => navigate(`/item/${connection.itemId}`)}
                className="w-full text-left p-3 rounded-xl bg-accent/30 hover:bg-accent/50 transition-colors"
              >
                <p className="text-sm font-medium line-clamp-1">{title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {connection.reason}
                </p>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
