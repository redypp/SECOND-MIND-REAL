import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ScheduleReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function ScheduleReminderModal({ isOpen, onClose, onSaved }: ScheduleReminderModalProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [hour, setHour] = useState('12');
  const [minute, setMinute] = useState('00');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !message.trim() || !date) return;

    setIsSaving(true);
    try {
      const remindAt = new Date(date);
      remindAt.setHours(parseInt(hour), parseInt(minute), 0, 0);

      const { error } = await supabase
        .from('scheduled_reminders' as any)
        .insert({
          user_id: user.id,
          message: message.trim(),
          remind_at: remindAt.toISOString(),
        } as any);

      if (error) throw error;

      setMessage('');
      setDate(undefined);
      setHour('12');
      setMinute('00');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Failed to save reminder:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">Set a reminder</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Message</Label>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What do you want to remember"
              className="mt-1.5 rounded-xl"
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Date</Label>
            <div className="mt-1.5 flex justify-center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                className="rounded-xl border"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Time</Label>
            <div className="flex gap-2 mt-1.5">
              <select
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                className="flex-1 h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                {hours.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="flex items-center text-muted-foreground">:</span>
              <select
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                className="flex-1 h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                {minutes.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={!message.trim() || !date || isSaving}
            className="w-full rounded-xl"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Set Reminder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
