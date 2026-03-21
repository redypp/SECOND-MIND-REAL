import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  BellOff,
  BrainCircuit,
  Cpu,
  History,
  Zap,
  Clock,
  Loader2,
} from 'lucide-react';
import { NotificationInbox } from '@/components/NotificationInbox';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

type Tab = 'inbox' | 'settings';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('inbox');

  const {
    prefs,
    loading: prefsLoading,
    saving: prefsSaving,
    updatePrefs,
  } = useNotificationPreferences();
  const { register: registerPush, unregister: unregisterPush } = usePushRegistration();

  const handlePushToggle = async (enabled: boolean) => {
    await updatePrefs({ push_enabled: enabled });
    if (enabled) {
      await registerPush();
    } else {
      await unregisterPush();
    }
  };

  return (
    <div className="min-h-screen bg-background safe-area-top-ios">
      {/* ── Header ── */}
      <div className="sticky safe-sticky-top z-10 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-accent/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">Notifications</h1>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex px-4 gap-4 border-b border-border/50">
          {(['inbox', 'settings'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px
                ${activeTab === tab
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground/70'}
              `}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'inbox' ? (
        <NotificationInbox />
      ) : (
        <SettingsTab
          prefs={prefs}
          prefsLoading={prefsLoading}
          prefsSaving={prefsSaving}
          updatePrefs={updatePrefs}
          onPushToggle={handlePushToggle}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Settings tab                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

interface SettingsTabProps {
  prefs: ReturnType<typeof useNotificationPreferences>['prefs'];
  prefsLoading: boolean;
  prefsSaving: boolean;
  updatePrefs: ReturnType<typeof useNotificationPreferences>['updatePrefs'];
  onPushToggle: (enabled: boolean) => Promise<void>;
}

function SettingsTab({
  prefs,
  prefsLoading,
  prefsSaving,
  updatePrefs,
  onPushToggle,
}: SettingsTabProps) {
  if (prefsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 pb-24">

      {/* ── Delivery ── */}
      <Section label="Delivery">
        {/* Push Notifications */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${prefs.push_enabled ? 'bg-primary/10' : 'bg-accent'}`}>
              {prefs.push_enabled
                ? <Bell className="w-4 h-4 text-primary" />
                : <BellOff className="w-4 h-4 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-medium">Push Notifications</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receive alerts outside the app
              </p>
            </div>
            <Switch
              checked={prefs.push_enabled}
              onCheckedChange={onPushToggle}
              disabled={prefsSaving}
            />
          </div>
        </Card>

        {/* Daily Digest + Max per day */}
        <Card className="p-4 space-y-4">
          {/* Daily Digest */}
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-medium">Daily Digest</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Morning summary of your day
              </p>
            </div>
            <Switch
              checked={prefs.daily_digest_enabled}
              onCheckedChange={(val) => updatePrefs({ daily_digest_enabled: val })}
              disabled={prefsSaving}
            />
          </div>

          {prefs.daily_digest_enabled && (
            <div className="space-y-1.5 pt-1 border-t border-border/40">
              <Label className="text-xs text-muted-foreground">Digest time</Label>
              <input
                type="time"
                value={prefs.digest_time}
                onChange={(e) => updatePrefs({ digest_time: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
              />
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border/40 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Max per day</Label>
              <span className="text-sm font-semibold tabular-nums text-primary">
                {prefs.max_daily_notifications}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={15}
              value={prefs.max_daily_notifications}
              onChange={(e) => updatePrefs({ max_daily_notifications: parseInt(e.target.value) })}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
              <span>15</span>
            </div>
          </div>
        </Card>
      </Section>

      {/* ── Quiet Hours ── */}
      <Section label="Quiet Hours">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              No push notifications will be sent during this window
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <input
                type="time"
                value={prefs.quiet_hours_start}
                onChange={(e) => updatePrefs({ quiet_hours_start: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <input
                type="time"
                value={prefs.quiet_hours_end}
                onChange={(e) => updatePrefs({ quiet_hours_end: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
              />
            </div>
          </div>

          {prefsSaving && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving…
            </div>
          )}
        </Card>
      </Section>

      {/* ── AI Notifications ── */}
      <Section label="AI Notifications">
        <Card className="p-4 divide-y divide-border/40">
          {([
            {
              key: 'ai_nudges_enabled' as const,
              icon: BrainCircuit,
              label: 'Smart Nudges',
              desc: 'AI-generated suggestions based on your data',
              color: 'text-violet-500 bg-violet-500/10',
            },
            {
              key: 'insights_enabled' as const,
              icon: Cpu,
              label: 'Insights',
              desc: 'Patterns AI notices in your archive & habits',
              color: 'text-blue-500 bg-blue-500/10',
            },
            {
              key: 'follow_ups_enabled' as const,
              icon: History,
              label: 'Follow-ups',
              desc: 'Items you saved but never acted on',
              color: 'text-amber-500 bg-amber-500/10',
            },
            {
              key: 'time_based_enabled' as const,
              icon: Zap,
              label: 'Time-based Reminders',
              desc: 'Contextual nudges tied to your schedule',
              color: 'text-green-500 bg-green-500/10',
            },
          ] as const).map(({ key, icon: Icon, label, desc, color }) => (
            <div key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className={`p-2 rounded-lg ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <Switch
                checked={prefs[key]}
                onCheckedChange={(val) => updatePrefs({ [key]: val })}
                disabled={prefsSaving}
              />
            </div>
          ))}
        </Card>
      </Section>

    </div>
  );
}

/* Small section label component */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
        {label}
      </h2>
      {children}
    </section>
  );
}
