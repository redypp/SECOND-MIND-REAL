import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/app-client';
import { useAuth } from '@/contexts/AuthContext';
import { Space } from '@/types';
import { toast } from '@/hooks/use-toast';
import { X, Copy, Globe, Link2, UserPlus, Trash2, Check, ExternalLink, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShareArchiveSheetProps {
  space: Space;
  open: boolean;
  onClose: () => void;
  onSpaceUpdate: (updates: Partial<Space>) => void;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  accepted_at: string | null;
  profiles?: { full_name: string } | null;
}

interface Invite {
  id: string;
  token: string;
  role: string;
  invited_email: string | null;
  expires_at: string | null;
  accepted_at: string | null;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function ShareArchiveSheet({ space, open, onClose, onSpaceUpdate }: ShareArchiveSheetProps) {
  const { user, profile } = useAuth();
  const [isPublic, setIsPublic] = useState(space.isPublic ?? false);
  const [slug, setSlug] = useState(space.publicSlug || generateSlug(space.name));
  const [description, setDescription] = useState(space.publicDescription || '');
  const [slugError, setSlugError] = useState('');
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteRole, setInviteRole] = useState<'viewer' | 'editor'>('viewer');
  const [copied, setCopied] = useState<string | null>(null);

  const publicUrl = `${window.location.origin}/p/${slug}`;

  // Load members and invites
  useEffect(() => {
    if (!open || !user) return;
    loadMembers();
    loadInvites();
  }, [open, user]);

  const loadMembers = async () => {
    const { data } = await supabase
      .from('space_members')
      .select('id, user_id, role, accepted_at')
      .eq('space_id', space.id);
    if (data) setMembers(data);
  };

  const loadInvites = async () => {
    const { data } = await supabase
      .from('space_invites')
      .select('id, token, role, invited_email, expires_at, accepted_at')
      .eq('space_id', space.id)
      .is('accepted_at', null);
    if (data) setInvites(data);
  };

  const handleTogglePublic = async () => {
    if (!user) return;
    setSaving(true);

    const newIsPublic = !isPublic;
    const finalSlug = newIsPublic ? slug : space.publicSlug;

    // Validate slug uniqueness
    if (newIsPublic && finalSlug) {
      const { data: existing } = await supabase
        .from('spaces')
        .select('id')
        .eq('public_slug', finalSlug)
        .neq('id', space.id)
        .maybeSingle();

      if (existing) {
        setSlugError('This URL is already taken');
        setSaving(false);
        return;
      }
    }

    const updates: any = {
      is_public: newIsPublic,
      public_slug: newIsPublic ? finalSlug : space.publicSlug,
      public_description: description || null,
      author_name: profile?.full_name || null,
    };

    if (newIsPublic && !space.publishedAt) {
      updates.published_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('spaces')
      .update(updates)
      .eq('id', space.id);

    if (error) {
      toast({ title: 'Failed to update', variant: 'destructive' });
    } else {
      setIsPublic(newIsPublic);
      setSlugError('');
      onSpaceUpdate({
        isPublic: newIsPublic,
        publicSlug: updates.public_slug,
        publicDescription: updates.public_description,
        authorName: updates.author_name,
        publishedAt: updates.published_at ? new Date(updates.published_at) : space.publishedAt,
      });
      toast({ title: newIsPublic ? 'Archive published' : 'Archive unpublished' });
    }
    setSaving(false);
  };

  const handleSaveDescription = async () => {
    if (!isPublic) return;
    setSaving(true);
    const { error } = await supabase
      .from('spaces')
      .update({ public_description: description || null, public_slug: slug })
      .eq('id', space.id);
    if (!error) {
      onSpaceUpdate({ publicDescription: description, publicSlug: slug });
      toast({ title: 'Saved' });
    }
    setSaving(false);
  };

  const handleCreateInvite = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('space_invites')
      .insert({ space_id: space.id, created_by: user.id, role: inviteRole })
      .select('id, token, role, invited_email, expires_at, accepted_at')
      .single();

    if (error) {
      toast({ title: 'Failed to create invite', variant: 'destructive' });
      return;
    }

    if (data) {
      setInvites(prev => [...prev, data]);
      const inviteUrl = `${window.location.origin}/invite/${data.token}`;
      await navigator.clipboard.writeText(inviteUrl);
      setCopied('invite');
      setTimeout(() => setCopied(null), 2000);
      toast({ title: 'Invite link copied to clipboard' });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await supabase
      .from('space_members')
      .delete()
      .eq('id', memberId);
    if (!error) {
      setMembers(prev => prev.filter(m => m.id !== memberId));
      toast({ title: 'Member removed' });
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    const { error } = await supabase
      .from('space_invites')
      .delete()
      .eq('id', inviteId);
    if (!error) {
      setInvites(prev => prev.filter(i => i.id !== inviteId));
      toast({ title: 'Invite revoked' });
    }
  };

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: 'Copied to clipboard' });
  }, []);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-[#111] rounded-t-3xl overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          <div className="px-6 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-[clamp(1.5rem,6vw,2rem)] font-bold uppercase tracking-[-0.04em] text-white">
                Share & Publish
              </h2>
              <button onClick={onClose} className="p-2 text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ─── PUBLISH SECTION ─── */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-medium text-white/60 uppercase tracking-widest">Publish as Magazine</h3>
              </div>

              {/* Toggle */}
              <button
                onClick={handleTogglePublic}
                disabled={saving}
                className="w-full flex items-center justify-between py-3 px-4 rounded-xl bg-white/[0.05] border border-white/[0.08] mb-4"
              >
                <span className="text-white font-medium">
                  {isPublic ? 'Published' : 'Publish this archive'}
                </span>
                <div className={`w-12 h-7 rounded-full relative transition-colors ${isPublic ? 'bg-red-500' : 'bg-white/20'}`}>
                  <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${isPublic ? 'left-[22px]' : 'left-0.5'}`} />
                </div>
              </button>

              {isPublic && (
                <div className="space-y-3">
                  {/* Slug */}
                  <div>
                    <label className="text-[13px] text-white/40 uppercase tracking-wider mb-1 block">URL</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center bg-white/[0.05] border border-white/[0.08] rounded-xl overflow-hidden">
                        <span className="px-3 text-[14px] text-white/30 shrink-0">/p/</span>
                        <input
                          type="text"
                          value={slug}
                          onChange={e => { setSlug(generateSlug(e.target.value)); setSlugError(''); }}
                          onBlur={handleSaveDescription}
                          className="flex-1 bg-transparent text-white text-[14px] py-2.5 pr-3 outline-none"
                        />
                      </div>
                      <button
                        onClick={() => copyToClipboard(publicUrl, 'url')}
                        className="p-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:text-white"
                      >
                        {copied === 'url' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    {slugError && <p className="text-red-400 text-[13px] mt-1">{slugError}</p>}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[13px] text-white/40 uppercase tracking-wider mb-1 block">Description</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      onBlur={handleSaveDescription}
                      placeholder="A brief editorial intro for your archive..."
                      rows={2}
                      className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-[14px] px-3 py-2.5 outline-none placeholder:text-white/20 resize-none"
                    />
                  </div>

                  {/* Preview link */}
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[14px] text-red-400/80 hover:text-red-400"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Preview public page
                  </a>
                </div>
              )}
            </section>

            {/* Divider */}
            <div className="h-px bg-white/[0.08] mb-8" />

            {/* ─── SHARE SECTION ─── */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-medium text-white/60 uppercase tracking-widest">Share with People</h3>
              </div>

              {/* Create invite */}
              <div className="flex items-center gap-2 mb-4">
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as 'viewer' | 'editor')}
                  className="bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-[14px] px-3 py-2.5 outline-none"
                >
                  <option value="viewer">Can view</option>
                  <option value="editor">Can edit</option>
                </select>
                <button
                  onClick={handleCreateInvite}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors font-medium text-[14px]"
                >
                  <Link2 className="w-4 h-4" />
                  {copied === 'invite' ? 'Copied!' : 'Create Invite Link'}
                </button>
              </div>

              {/* Pending invites */}
              {invites.length > 0 && (
                <div className="mb-4">
                  <p className="text-[12px] text-white/30 uppercase tracking-wider mb-2">Pending Invites</p>
                  <div className="space-y-2">
                    {invites.map(invite => (
                      <div key={invite.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="flex items-center gap-2 min-w-0">
                          <UserPlus className="w-3.5 h-3.5 text-white/30 shrink-0" />
                          <span className="text-[14px] text-white/50 truncate">
                            {invite.invited_email || 'Anyone with link'}
                          </span>
                          <span className="text-[12px] text-white/20 uppercase">{invite.role}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => copyToClipboard(`${window.location.origin}/invite/${invite.token}`, invite.id)}
                            className="p-1.5 text-white/30 hover:text-white"
                          >
                            {copied === invite.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDeleteInvite(invite.id)}
                            className="p-1.5 text-white/30 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Current members */}
              {members.length > 0 && (
                <div>
                  <p className="text-[12px] text-white/30 uppercase tracking-wider mb-2">Members</p>
                  <div className="space-y-2">
                    {members.map(member => (
                      <div key={member.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center">
                            <span className="text-[12px] text-red-400 font-bold uppercase">
                              {member.user_id.slice(0, 2)}
                            </span>
                          </div>
                          <span className="text-[14px] text-white/70">
                            {member.user_id.slice(0, 8)}...
                          </span>
                          <span className="text-[12px] text-white/20 uppercase">{member.role}</span>
                          {!member.accepted_at && (
                            <span className="text-[11px] text-yellow-400/60 uppercase">Pending</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="p-1.5 text-white/30 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {members.length === 0 && invites.length === 0 && (
                <p className="text-[14px] text-white/20 text-center py-4">
                  No one has access yet. Create an invite link to share.
                </p>
              )}
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
