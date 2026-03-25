import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  X,
  Check,
  Lightbulb,
  Link2,
  HelpCircle,
  CheckSquare,
  Clock,
} from 'lucide-react';
import { SecondMindLoader } from '@/components/SecondMindLoader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  title: string;
  message: string;
  reason: string;
  category: 'resurface' | 'connection' | 'decision' | 'task' | 'reminder';
  priority: 'low' | 'medium' | 'high';
  suggested_action?: string;
  related_item_ids?: string[];
  scheduled_for: string;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
}

const categoryIcons = {
  resurface: Lightbulb,
  connection: Link2,
  decision: HelpCircle,
  task: CheckSquare,
  reminder: Clock,
};

const categoryColors = {
  resurface: 'text-amber-500 bg-amber-500/10',
  connection: 'text-violet-500 bg-violet-500/10',
  decision: 'text-blue-500 bg-blue-500/10',
  task: 'text-green-500 bg-green-500/10',
  reminder: 'text-orange-500 bg-orange-500/10',
};

const priorityStyles = {
  low: 'border-l-muted-foreground/30',
  medium: 'border-l-primary/50',
  high: 'border-l-destructive',
};

export function NotificationInbox() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const typedData = (data || []) as unknown as Notification[];
      setNotifications(typedData);
      setUnreadCount(typedData.filter(n => !n.read_at).length);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const dismissNotification = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      console.error('Failed to dismiss:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <SecondMindLoader size={28} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 pb-24">
      {/* Inline action bar */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-muted-foreground">
            {unreadCount} unread
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllAsRead}
            className="text-xs h-7"
          >
            <Check className="w-3 h-3 mr-1" />
            Mark all read
          </Button>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Bell className="w-10 h-10 opacity-20" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {notifications.map((notification) => {
            const Icon = categoryIcons[notification.category];
            const colorClass = categoryColors[notification.category];
            const priorityClass = priorityStyles[notification.priority];

            return (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -60 }}
                className={`
                  relative p-4 rounded-xl border border-border bg-card
                  border-l-4 ${priorityClass}
                  ${!notification.read_at ? 'bg-accent/30' : ''}
                `}
                onClick={() => !notification.read_at && markAsRead(notification.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs ${colorClass}`}>
                    <Icon className="w-3 h-3" />
                    <span className="capitalize">{notification.category}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 -mr-2 -mt-2 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissNotification(notification.id);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>

                <h3 className="font-medium text-sm mb-1">{notification.title}</h3>
                <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>

                {notification.reason && (
                  <p className="text-xs text-muted-foreground/70 italic mb-2">
                    {notification.reason}
                  </p>
                )}

                {notification.suggested_action && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs font-medium text-primary">
                      → {notification.suggested_action}
                    </p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground/50 mt-2">
                  {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                </p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}
