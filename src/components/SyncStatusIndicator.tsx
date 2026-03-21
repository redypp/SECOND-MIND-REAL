/**
 * Sync Status Indicator
 * Shows sync status and warnings in the header
 */

import { memo } from 'react';
import { Cloud, CloudOff, AlertTriangle, RefreshCw, Check } from 'lucide-react';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const SyncStatusIndicator = memo(function SyncStatusIndicator() {
  const { 
    pendingCount, 
    isSyncing, 
    hasErrors, 
    isOnline, 
    showWarning,
    formatLastSaved,
    retrySync,
    forceSync,
  } = useSyncStatus();

  // Offline state
  if (!isOnline) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-warning">
            <CloudOff className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">Offline</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>You're offline. Changes will sync when you reconnect.</p>
          {pendingCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Error state
  if (hasErrors) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 px-2 text-destructive hover:text-destructive"
            onClick={retrySync}
          >
            <AlertTriangle className="w-4 h-4 mr-1" />
            <span className="text-xs font-medium">Sync Error</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Some changes failed to save. Tap to retry.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Syncing state
  if (isSyncing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-xs font-medium hidden sm:inline">Syncing...</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Saving changes to cloud...</p>
          {pendingCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {pendingCount} change{pendingCount !== 1 ? 's' : ''} remaining
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Pending changes (not syncing)
  if (pendingCount > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`h-7 px-2 ${showWarning ? 'text-warning' : 'text-muted-foreground'}`}
            onClick={forceSync}
          >
            <Cloud className="w-4 h-4 mr-1" />
            <span className="text-xs font-medium">{pendingCount}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{pendingCount} unsaved change{pendingCount !== 1 ? 's' : ''}. Tap to sync now.</p>
          <p className="text-xs text-muted-foreground mt-1">Last saved: {formatLastSaved()}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // All synced
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 text-muted-foreground/60">
          <Check className="w-4 h-4" />
          <span className="text-xs hidden sm:inline">Saved</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>All changes saved</p>
        <p className="text-xs text-muted-foreground mt-1">Last saved: {formatLastSaved()}</p>
      </TooltipContent>
    </Tooltip>
  );
});
