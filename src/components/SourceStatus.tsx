import { motion } from 'framer-motion';
import { Check, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { ArchiveSource } from '@/lib/archiveSources';

interface SourceStatusProps {
  sources: ArchiveSource[];
}

export function SourceStatus({ sources }: SourceStatusProps) {
  if (sources.length === 0) return null;

  return (
    <div className="space-y-1.5 mt-2">
      {sources.map(source => (
        <motion.div
          key={source.id}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-accent/40"
        >
          {source.status === 'importing' && (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />
              <span className="text-muted-foreground truncate">Importing source…</span>
            </>
          )}
          {source.status === 'ready' && (
            <>
              <Check className="w-3 h-3 text-primary shrink-0" />
              <span className="text-muted-foreground truncate">
                {source.title || 'Imported'}
              </span>
            </>
          )}
          {source.status === 'failed' && (
            <>
              <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
              <span className="text-muted-foreground truncate">Import failed</span>
            </>
          )}
          <a
            href={source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3 text-muted-foreground/50" />
          </a>
        </motion.div>
      ))}
    </div>
  );
}
