import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, User, LogOut, Lightbulb, Moon, Sun, Sunrise, Pencil, Check, X, RotateCcw, Mail, Mic, MapPin, Navigation } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
          // Nominatim reverse geocoding — free, no API key, privacy-respecting
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
          <h1 className="text-2xl font-black">Settings</h1>
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
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Location</label>
                    <div className="flex gap-2">
                      <input
                        value={editLocation}
                        onChange={(e) => { setEditLocation(e.target.value); setLocationError(''); }}
                        placeholder="City, Country"
                        className="flex-1 px-3 py-2 rounded-lg bg-accent/50 border border-border/50 text-sm focus:outline-none focus:border-primary/40"
                      />
                      <button
                        type="button"
                        onClick={autoDetectLocation}
                        disabled={isDetectingLocation}
                        title="Auto-detect my location"
                        className="px-3 py-2 rounded-lg bg-accent/50 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        {isDetectingLocation
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Navigation className="w-4 h-4" />}
                      </button>
                    </div>
                    {locationError
                      ? <p className="text-xs text-destructive mt-1">{locationError}</p>
                      : <p className="text-xs text-muted-foreground mt-1">Only your city name is saved — precise coordinates are never stored.</p>
                    }
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
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    {profile?.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {profile.location}
                      </p>
                    )}
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
              <Switch
                checked={aiSettings.voiceAutoSend}
                onCheckedChange={(checked) => updateAISettings({ voiceAutoSend: checked })}
              />
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
      </div>

      <DailyBriefingModal isOpen={showBriefing} onClose={() => setShowBriefing(false)} />
    </div>
  );
}