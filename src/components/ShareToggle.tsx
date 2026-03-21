import { useState, useEffect } from 'react';
import { Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/app-client';
import { useAuth } from '@/contexts/AuthContext';
import { Item } from '@/types';
import { toast } from '@/hooks/use-toast';

interface ShareToggleProps {
  item: Item;
}

export function ShareToggle({ item }: ShareToggleProps) {
  const { user } = useAuth();
  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Check if already shared
    supabase
      .from('shared_archive_prototype' as any)
      .select('id')
      .eq('original_note_id', item.id)
      .eq('author_id', user.id)
      .then(({ data }) => {
        if (data && (data as any[]).length > 0) setIsShared(true);
      });
  }, [item.id, user]);

  const toggleShare = async () => {
    if (!user || loading) return;
    setLoading(true);

    try {
      if (isShared) {
        // Unshare
        await (supabase.from('shared_archive_prototype' as any) as any)
          .delete()
          .eq('original_note_id', item.id)
          .eq('author_id', user.id);
        setIsShared(false);
        toast({ title: 'Note unshared' });
      } else {
        // Share — duplicate into shared archive
        const content = item.content || item.blocks?.map((b: any) => b.content || '').join('\n') || '';
        await (supabase.from('shared_archive_prototype' as any) as any)
          .insert({
            original_note_id: item.id,
            author_id: user.id,
            title: item.title || 'Untitled',
            content: content.slice(0, 5000),
            tags: item.keywords || [],
            visibility: 'public',
          });
        setIsShared(true);
        toast({ title: 'Note shared to archive' });
      }
    } catch {
      toast({ title: 'Failed to update sharing', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggleShare}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
        isShared
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      <Share2 className="w-3.5 h-3.5" />
      {isShared ? 'Shared' : 'Share'}
    </button>
  );
}
