import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, User, Users, LogOut, Lightbulb, Moon, Sun, Sunrise, Pencil,
  Check, X, RotateCcw, Mail, Mic, MapPin, Navigation, ChevronRight,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { FeatureTour } from '@/components/FeatureTour';
import { useTutorial } from '@/contexts/TutorialContext';
import { DailyBriefingModal } from '@/components/DailyBriefing';
import { useAISettings } from '@/contexts/AISettingsContext';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user, profile, signOut, updateProfile } = useAuth();
  const { resetOnboarding } = useTutorial();
  const { settings: aiSettings, updateSettings: updateAISettings } = useAISettings();

  const [showTour, setShowTour] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const startEditProfile = () => {
    setEditName(profile?.full_name || '');
    setEditBirthday(profile?.birthday || '');
    setEditLocation(profile?.location || '');
    setLocationError('');
    setIsEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setIsEditingProfile(false);
    setLocationError('');
  };

  const autoDetectLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }
    setIsDetectingLocation(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.county ||
            '';
          const country = data.address?.country || '';
          setEditLocation(city && country ? `${city}, ${country}` : city || country || '');
        } catch {
          setLocationError('Could not determine your city. Please enter it manually.');
        } finally {
          setIsDetectingLocation(false);
        }
      },
      () => {
        setLocationError('Location access denied. Please enter your city manually.');
        setIsDetectingLocation(false);
      },
      { timeout: 8000 }
    );
  };

  const saveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      await updateProfile({
        full_name: editName.trim() || 'User',
        birthday: editBirthday || undefined,
        location: editLocation.trim() || undefined,
      });
      setIsEditingProfile(false);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (showTour) {
    return (
      <FeatureTour
        onComplete={() => setShowTour(false)}
        onSkip={() => setShowTour(false)}
      />
    );
  }

  const themeLabel = theme === 'day' ? 'Day' : theme === 'night' ? 'Night' : 'Blu';
  const ThemeIcon = theme === 'day' ? Sun : theme === 'night' ? Moon : Sunrise;

  return (
    <div className="min-h-screen bg-background safe-area-top-ios">
      {/* Header */}
      <div className="sticky safe-sticky-top z-10 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center px-4 py-4 relative">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-accent/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold tracking-tight">
            Settings
          </h1>
        </div>
      </div>

      <div className="px-4 pt-4 pb-32 space-y-3">

        {/* Profile Card */}
        {isEditingProfile ? (
          <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
            <div className="px-4 py-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Birthday</label>
                <input
                  type="date"
                  value={editBirthday}
                  onChange={(e) => setEditBirthday(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Location</label>
                <div className="flex gap-2">
                  <input
                    value={editLocation}
                    onChange={(e) => { setEditLocation(e.target.value); setLocationError(''); }}
                    placeholder="City, Country"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-background border border-border/50 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={autoDetectLocation}
                    disabled={isDetectingLocation}
                    title="Auto-detect my location"
                    className="px-3.5 py-2.5 rounded-xl bg-background border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
                  >
                    {isDetectingLocation
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Navigation className="w-4 h-4" />}
                  </button>
                </div>
                {locationError
                  ? <p className="text-xs text-destructive mt-1.5">{locationError}</p>
                  : <p className="text-xs text-muted-foreground mt-1.5">Only your city name is saved — precise coordinates are never stored.</p>
                }
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-background/60">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm truncate">{user?.email || 'Not available'}</p>
                </div>
              </div>
            </div>
            <div className="flex border-t border-border/40">
              <button
                onClick={cancelEditProfile}
                className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors border-r border-border/40"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={saveProfile}
                disabled={isSavingProfile}
                className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                {isSavingProfile
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Check className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startEditProfile}
            className="w-full rounded-2xl bg-card border border-border/40 px-4 py-4 flex items-center gap-3.5 hover:bg-accent/20 transition-colors text-left"
          >
            <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center shrink-0">
              <User className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold truncate">{profile?.full_name || 'User'}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              {profile?.location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {profile.location}
                </p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        )}

        {/* Appearance & Voice Section */}
        <div className="rounded-2xl bg-card border border-border/40 overflow-hidden divide-y divide-border/40">
          {/* Theme row — expands inline */}
          <ThemeRowExpanded theme={theme} setTheme={setTheme} />

          {/* Microphone permission */}
          <button
            onClick={async () => {
              try {
                // Try native Capacitor first
                const mod = await import('@capacitor-community/speech-recognition').catch(() => null);
                if (mod?.SpeechRecognition) {
                  const result = await mod.SpeechRecognition.requestPermissions();
                  alert(result.speechRecognition === 'granted' ? 'Microphone access granted' : 'Microphone access denied. Please enable in device Settings.');
                  return;
                }
                // Web fallback — triggers browser permission prompt
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                alert('Microphone access granted');
              } catch {
                alert('Microphone access denied. Please enable in your browser or device settings.');
              }
            }}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Microphone access</p>
              <p className="text-xs text-muted-foreground">Grant permission for voice input on Ask</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>

          {/* Voice auto-send */}
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <div className="w-8 h-8 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Auto-send after speaking</p>
              <p className="text-xs text-muted-foreground">Submit message when voice transcription finishes</p>
            </div>
            <Switch
              checked={aiSettings.voiceAutoSend}
              onCheckedChange={(checked) => updateAISettings({ voiceAutoSend: checked })}
            />
          </div>
        </div>

        {/* People & Help Section */}
        <div className="rounded-2xl bg-card border border-border/40 overflow-hidden divide-y divide-border/40">
          <button
            onClick={() => navigate('/people')}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">People</p>
              <p className="text-xs text-muted-foreground">View people mentioned across your archives</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>

          <button
            onClick={() => setShowBriefing(true)}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
              <Sunrise className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Daily Brief</p>
              <p className="text-xs text-muted-foreground">Your personalised morning summary</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>

          <button
            onClick={() => setShowTour(true)}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
              <Lightbulb className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Feature Tour</p>
              <p className="text-xs text-muted-foreground">Explore what Second Mind can do</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>

          <button
            onClick={() => { resetOnboarding(); navigate('/'); }}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4 text-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Restart Onboarding</p>
              <p className="text-xs text-muted-foreground">Redo the full guided setup from the beginning</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </div>

        {/* Sign Out */}
        <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold text-red-500 hover:bg-red-500/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      <DailyBriefingModal isOpen={showBriefing} onClose={() => setShowBriefing(false)} />
    </div>
  );
}

/* ─── Appearance sub-component ───────────────────────────────────────── */
type Theme = 'day' | 'night' | 'blu';

function ThemeRowExpanded({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  const [open, setOpen] = useState(false);

  const ThemeIcon = theme === 'day' ? Sun : theme === 'night' ? Moon : Sunrise;
  const themeLabel = theme === 'day' ? 'Day' : theme === 'night' ? 'Night' : 'Blu';

  const options: { id: Theme; label: string; icon: typeof Sun; bg: string; fg: string }[] = [
    { id: 'day', label: 'Day', icon: Sun, bg: 'hsl(0 0% 98%)', fg: 'hsl(0 0% 10%)' },
    { id: 'night', label: 'Night', icon: Moon, bg: 'hsl(0 0% 4%)', fg: 'hsl(0 0% 95%)' },
    { id: 'blu', label: 'Blu', icon: Sunrise, bg: 'hsl(240 100% 25%)', fg: 'hsl(0 0% 100%)' },
  ];

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-accent/30 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
          <ThemeIcon className="w-4 h-4 text-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Appearance</p>
          <p className="text-xs text-muted-foreground">{themeLabel}</p>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 grid grid-cols-3 gap-2 border-t border-border/40">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isActive = theme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => { setTheme(opt.id); setOpen(false); }}
                className={`flex flex-col items-center gap-2 py-3 rounded-xl border-2 transition-all ${isActive ? 'border-primary ring-2 ring-primary/20' : 'border-border/50 hover:border-border'}`}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: opt.bg }}
                >
                  <Icon className="w-4 h-4" style={{ color: opt.fg }} />
                </div>
                <span className="text-xs font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
