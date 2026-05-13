import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, User, Users, LogOut, Lightbulb, Sunrise,
  Check, X, RotateCcw, Mail, Mic, MapPin, Navigation, ChevronRight, Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { FeatureTour } from '@/components/FeatureTour';
import { useTutorial } from '@/contexts/TutorialContext';
import { DailyBriefingModal } from '@/components/DailyBriefing';
import { useAISettings } from '@/contexts/AISettingsContext';
import { supabase } from '@/integrations/supabase/app-client';
import { analytics, Events } from '@/lib/analytics';
import { errorTracking } from '@/lib/errorTracking';

export default function SettingsPage() {
  const navigate = useNavigate();
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw new Error(error.message);
      analytics.capture(Events.AccountDeleted);
      await signOut();
      navigate('/auth', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account.';
      setDeleteError(message);
      errorTracking.captureException(err, { where: 'settings.deleteAccount' });
    } finally {
      setIsDeleting(false);
    }
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

        {/* Voice Section */}
        <div className="rounded-2xl bg-card border border-border/40 overflow-hidden divide-y divide-border/40">
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

        {/* Delete account — Apple requires in-app account deletion */}
        <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium text-red-500 hover:bg-red-500/5 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          ) : (
            <div className="p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Delete your account</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  This permanently removes your profile, archive, journals, habits, and all other data. This cannot be undone.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  An active App Store subscription must be cancelled separately in iOS Settings → Apple ID → Subscriptions.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Type <span className="font-mono font-semibold">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError(null); }}
                  disabled={isDeleting}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-border hover:bg-foreground/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                  className="flex-1 px-3 py-2 text-sm font-semibold rounded-md bg-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Delete forever
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DailyBriefingModal isOpen={showBriefing} onClose={() => setShowBriefing(false)} />
    </div>
  );
}

