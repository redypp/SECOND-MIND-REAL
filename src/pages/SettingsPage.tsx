import { useState } from 'react';
import { supabase } from '@/integrations/supabase/app-client';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, User, LogOut, Lightbulb, Moon, Sun, Sunrise, Pencil, Check, X, RotateCcw, Mail, Mic, Database, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FeatureTour } from '@/components/FeatureTour';
import { useTutorial } from '@/contexts/TutorialContext';
import { DailyBriefingModal } from '@/components/DailyBriefing';
import { useAISettings } from '@/contexts/AISettingsContext';
import { useSupabaseHealth } from '@/hooks/useSupabaseHealth';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user, profile, signOut } = useAuth();
  const { resetOnboarding } = useTutorial();
  const { settings: aiSettings, updateSettings: updateAISettings } = useAISettings();

  const { result: healthResult, checking: healthChecking, check: checkHealth, projectId } = useSupabaseHealth();

  const [showTour, setShowTour] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const startEditProfile = () => {
    setEditName(profile?.full_name || '');
    setEditBirthday(profile?.birthday || '');
    setIsEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setIsEditingProfile(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      await supabase
        .from('profiles')
        .update({
          full_name: editName.trim() || 'User',
          birthday: editBirthday || null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      setIsEditingProfile(false);
      // Reload to pick up changes
      window.location.reload();
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Show feature tour
  if (showTour) {
    return (
      <FeatureTour
        onComplete={() => setShowTour(false)}
        onSkip={() => setShowTour(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background safe-area-top-ios">
      {/* Header */}
      <div className="sticky safe-sticky-top z-10 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-accent/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>
      </div>

      <div className="p-4 space-y-6 pb-24">
        {/* Profile Section */}
        <section className="space-y-4">
          <Card className="p-4 space-y-4">
            {isEditingProfile ? (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-accent/50 border border-border/50 text-sm focus:outline-none focus:border-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Birthday</label>
                    <input
                      type="date"
                      value={editBirthday}
                      onChange={(e) => setEditBirthday(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-accent/50 border border-border/50 text-sm focus:outline-none focus:border-primary/40"
                    />
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/30">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm">{user?.email || 'Not available'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={cancelEditProfile} className="flex-1" size="sm">
                    <X className="w-3.5 h-3.5 mr-1" /> Cancel
                  </Button>
                  <Button onClick={saveProfile} disabled={isSavingProfile} className="flex-1" size="sm">
                    {isSavingProfile ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                    Save
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                    <User className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium truncate">{profile?.full_name || 'User'}</h3>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={startEditProfile} className="flex-1" size="sm">
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit Profile
                  </Button>
                  <Button variant="outline" onClick={handleSignOut} className="flex-1" size="sm">
                    <LogOut className="w-3.5 h-3.5 mr-1" /> Sign Out
                  </Button>
                </div>
              </>
            )}
          </Card>
        </section>

        {/* Appearance Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {theme === 'day' ? <Sun className="w-5 h-5 text-primary" /> : theme === 'blu' ? <Sunrise className="w-5 h-5 text-primary" /> : <Moon className="w-5 h-5 text-primary" />}
            Appearance
          </h2>
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'day' as const, label: 'Day', icon: Sun, bg: 'hsl(0 0% 98%)', fg: 'hsl(0 0% 10%)' },
                { id: 'night' as const, label: 'Night', icon: Moon, bg: 'hsl(0 0% 4%)', fg: 'hsl(0 0% 95%)' },
                { id: 'blu' as const, label: 'Blu', icon: Sunrise, bg: 'hsl(240 100% 25%)', fg: 'hsl(0 0% 100%)' },
              ]).map(opt => {
                const Icon = opt.icon;
                const isActive = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTheme(opt.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${isActive ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: opt.bg }}
                    >
                      <Icon className="w-5 h-5" style={{ color: opt.fg }} />
                    </div>
                    <span className="text-xs font-semibold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </section>

        {/* Voice Input */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            Voice Input
          </h2>
          <Card className="p-2 divide-y divide-border/50">
            <div className="flex items-center gap-3 px-3 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">Auto-send after speaking</p>
                <p className="text-xs text-muted-foreground">
                  Automatically submit your message once voice transcription finishes
                </p>
              </div>
              <button
                onClick={() => updateAISettings({ voiceAutoSend: !aiSettings.voiceAutoSend })}
                className={[
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none',
                  aiSettings.voiceAutoSend ? 'bg-primary' : 'bg-muted-foreground/25',
                ].join(' ')}
                role="switch"
                aria-checked={aiSettings.voiceAutoSend}
              >
                <span
                  className={[
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
                    aiSettings.voiceAutoSend ? 'translate-x-6' : 'translate-x-1',
                  ].join(' ')}
                />
              </button>
            </div>
          </Card>
        </section>

        {/* Help & Onboarding */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            Help & Onboarding
          </h2>
          <Card className="p-2 divide-y divide-border/50">
            <button
              onClick={() => setShowBriefing(true)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent/50 transition-colors text-left"
            >
              <Sunrise className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Daily Brief</p>
                <p className="text-xs text-muted-foreground">Your personalised morning summary</p>
              </div>
            </button>
            <button
              onClick={() => setShowTour(true)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent/50 transition-colors text-left"
            >
              <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Feature Tour</p>
                <p className="text-xs text-muted-foreground">Explore what Second Mind can do</p>
              </div>
            </button>
            <button
              onClick={() => { resetOnboarding(); navigate('/'); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent/50 transition-colors text-left"
            >
              <RotateCcw className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Restart Onboarding</p>
                <p className="text-xs text-muted-foreground">Redo the full guided setup from the beginning</p>
              </div>
            </button>
          </Card>
        </section>
        {/* Database Connection */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Database Connection
          </h2>
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Project</p>
                <p className="text-xs text-muted-foreground font-mono">{projectId}.supabase.co</p>
              </div>
              <Button variant="outline" size="sm" onClick={checkHealth} disabled={healthChecking}>
                {healthChecking
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />}
                <span className="ml-1.5">Check</span>
              </Button>
            </div>

            {healthResult && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex items-center gap-2">
                  {healthResult.serverReachable
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    : <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
                  <span className="text-sm">{healthResult.serverReachable ? 'Server reachable' : 'Server unreachable'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {healthResult.dataAccessible
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    : <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
                  <span className="text-sm">
                    {healthResult.dataAccessible
                      ? `Your data accessible (${healthResult.spacesCount ?? '?'} spaces, ${healthResult.itemsCount ?? '?'} items)`
                      : 'Your data inaccessible — session may be expired'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {healthResult.tables.map(t => (
                    <div key={t.name} className="flex items-center gap-1.5">
                      {t.accessible
                        ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                        : <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
                      <span className="text-xs text-muted-foreground truncate">{t.name}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last checked {healthResult.checkedAt.toLocaleTimeString()}
                </p>
              </div>
            )}
          </Card>
        </section>
      </div>

      <DailyBriefingModal isOpen={showBriefing} onClose={() => setShowBriefing(false)} />
    </div>
  );
}