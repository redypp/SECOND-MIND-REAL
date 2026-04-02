import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/app-client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Check, X, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface InviteData {
  id: string;
  space_id: string;
  token: string;
  role: string;
  invited_email: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  space_name?: string;
  space_color?: string;
  space_image?: string;
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !user) return;

    async function fetchInvite() {
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('space_invites')
        .select('id, space_id, token, role, invited_email, expires_at, accepted_at, accepted_by')
        .eq('token', token)
        .single();

      if (fetchError || !data) {
        setError('Invite not found');
        setLoading(false);
        return;
      }

      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError('This invite has expired');
        setLoading(false);
        return;
      }

      // Check if already accepted
      if (data.accepted_at) {
        // If accepted by current user, redirect to space
        if (data.accepted_by === user.id) {
          navigate(`/space/${data.space_id}`, { replace: true });
          return;
        }
        setError('This invite has already been used');
        setLoading(false);
        return;
      }

      // Fetch space info
      const { data: spaceData } = await supabase
        .from('spaces')
        .select('name, color, image')
        .eq('id', data.space_id)
        .single();

      setInvite({
        ...data,
        space_name: spaceData?.name || 'Unknown Archive',
        space_color: spaceData?.color || undefined,
        space_image: spaceData?.image || undefined,
      });
      setLoading(false);
    }

    fetchInvite();
  }, [token, user]);

  const handleAccept = async () => {
    if (!invite || !user || accepting) return;
    setAccepting(true);

    try {
      // Check if already a member
      const { data: existing } = await supabase
        .from('space_members')
        .select('id')
        .eq('space_id', invite.space_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Already a member, just redirect
        navigate(`/space/${invite.space_id}`, { replace: true });
        return;
      }

      // Insert membership
      const { error: memberError } = await supabase
        .from('space_members')
        .insert({
          space_id: invite.space_id,
          user_id: user.id,
          role: invite.role,
          invited_by: null, // We don't know the inviter's user_id from here
          accepted_at: new Date().toISOString(),
        });

      if (memberError) {
        toast({ title: 'Failed to join archive', variant: 'destructive' });
        setAccepting(false);
        return;
      }

      // Mark invite as accepted
      await supabase
        .from('space_invites')
        .update({
          accepted_by: user.id,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      toast({ title: `Joined "${invite.space_name}"` });
      navigate(`/space/${invite.space_id}`, { replace: true });
    } catch {
      toast({ title: 'Something went wrong', variant: 'destructive' });
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <X className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="font-display text-[clamp(1.5rem,6vw,2.5rem)] font-bold uppercase tracking-[-0.04em] text-foreground text-center">
          {error}
        </h1>
        <p className="text-muted-foreground text-center mt-2 mb-8">
          The invite link may be invalid or expired.
        </p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium"
        >
          Go Home
        </button>
      </div>
    );
  }

  if (!invite) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      {/* Archive preview */}
      <div className="w-20 h-20 rounded-2xl overflow-hidden mb-6 border border-border/40">
        {invite.space_image ? (
          <img src={invite.space_image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: invite.space_color || 'hsl(var(--primary))' }}
          >
            <Users className="w-8 h-8 text-white/80" />
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-[14px] uppercase tracking-widest mb-2">
        You've been invited to
      </p>

      <h1 className="font-display text-[clamp(1.8rem,8vw,3rem)] font-bold uppercase tracking-[-0.04em] text-foreground text-center leading-[0.95]">
        {invite.space_name}
      </h1>

      <p className="text-muted-foreground text-center mt-3 mb-8">
        You'll be able to {invite.role === 'editor' ? 'view and edit' : 'view'} this archive.
      </p>

      <button
        onClick={handleAccept}
        disabled={accepting}
        className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-[16px] uppercase tracking-wide disabled:opacity-50"
      >
        {accepting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Check className="w-5 h-5" />
        )}
        {accepting ? 'Joining...' : 'Accept Invite'}
      </button>

      <button
        onClick={() => navigate('/', { replace: true })}
        className="mt-4 text-muted-foreground text-[14px] hover:text-foreground"
      >
        Decline
      </button>
    </div>
  );
}
