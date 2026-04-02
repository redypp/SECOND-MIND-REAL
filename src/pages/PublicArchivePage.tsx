import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/app-client';
import { PublicItemCard } from '@/components/PublicItemCard';
import { Item, ContentBlock } from '@/types';
import { Loader2 } from 'lucide-react';

interface PublicSpace {
  id: string;
  name: string;
  image: string | null;
  color: string | null;
  gif_background: string | null;
  public_description: string | null;
  published_at: string | null;
  author_name: string | null;
  item_count: number;
}

function dbItemToPublicItem(dbItem: any): Item {
  return {
    id: dbItem.id,
    subCategory: dbItem.sub_category || 'notes',
    title: dbItem.title || undefined,
    content: dbItem.content || undefined,
    blocks: (dbItem.blocks || []) as ContentBlock[],
    spaceIds: dbItem.space_ids || [],
    keywords: dbItem.keywords || undefined,
    color: dbItem.color || undefined,
    type: dbItem.item_type as Item['type'] || undefined,
    thumbnail: dbItem.thumbnail || undefined,
    url: dbItem.url || undefined,
    aiTags: dbItem.ai_tags || undefined,
    createdAt: new Date(dbItem.created_at),
  };
}

export default function PublicArchivePage() {
  const { slug } = useParams<{ slug: string }>();
  const [space, setSpace] = useState<PublicSpace | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    async function fetchPublicArchive() {
      setLoading(true);
      setError(null);

      // Fetch the public space by slug
      const { data: spaceData, error: spaceError } = await supabase
        .from('spaces')
        .select('id, name, image, color, gif_background, public_description, published_at, author_name, item_count')
        .eq('public_slug', slug)
        .eq('is_public', true)
        .single();

      if (spaceError || !spaceData) {
        setError('Archive not found');
        setLoading(false);
        return;
      }

      setSpace(spaceData);

      // Fetch items belonging to this space
      const { data: itemsData } = await supabase
        .from('items')
        .select('id, title, content, blocks, sub_category, ai_tags, created_at, item_type, url, thumbnail, keywords, color, space_ids')
        .contains('space_ids', [spaceData.id])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (itemsData) {
        setItems(itemsData.map(dbItemToPublicItem));
      }

      setLoading(false);
    }

    fetchPublicArchive();
  }, [slug]);

  // Update page title
  useEffect(() => {
    if (space) {
      document.title = `${space.name} — Second Mind`;
    }
    return () => { document.title = 'Second Mind'; };
  }, [space]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (error || !space) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
        <h1 className="font-display text-[clamp(2rem,8vw,4rem)] font-bold uppercase tracking-[-0.04em] text-white">
          Not Found
        </h1>
        <p className="text-white/50 text-lg mt-2">This archive doesn't exist or isn't public.</p>
      </div>
    );
  }

  const publishDate = space.published_at
    ? new Date(space.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  // Separate items by type for magazine layout
  const imageItems = items.filter(i => i.blocks?.some(b => b.type === 'media' && b.mediaType !== 'link') || i.thumbnail);
  const textItems = items.filter(i => !imageItems.includes(i));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Hero Section */}
      <header className="relative w-full overflow-hidden">
        {/* Background — GIF or image or gradient */}
        {space.gif_background ? (
          <div className="absolute inset-0">
            <img src={space.gif_background} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[#0a0a0a]" />
          </div>
        ) : space.image ? (
          <div className="absolute inset-0">
            <img src={space.image} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[#0a0a0a]" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-red-950/30 via-[#0a0a0a] to-[#0a0a0a]" />
        )}

        <div className="relative z-10 px-6 pt-20 pb-16 sm:px-12 sm:pt-32 sm:pb-24 max-w-4xl mx-auto">
          {/* Red accent line */}
          <div className="w-16 h-1 bg-red-500 mb-8" />

          <h1 className="font-display text-[clamp(2.5rem,10vw,5rem)] font-bold uppercase tracking-[-0.04em] leading-[0.9] text-white">
            {space.name}
          </h1>

          {space.public_description && (
            <p className="mt-6 text-[clamp(1rem,3vw,1.25rem)] text-white/60 leading-relaxed max-w-2xl"
               style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
              {space.public_description}
            </p>
          )}

          <div className="mt-8 flex items-center gap-4 text-[14px] text-white/40 uppercase tracking-widest">
            {space.author_name && (
              <span>By {space.author_name}</span>
            )}
            {space.author_name && (publishDate || items.length > 0) && (
              <span className="w-1 h-1 rounded-full bg-white/20" />
            )}
            {publishDate && <span>{publishDate}</span>}
            {publishDate && items.length > 0 && (
              <span className="w-1 h-1 rounded-full bg-white/20" />
            )}
            {items.length > 0 && (
              <span>{items.length} {items.length === 1 ? 'entry' : 'entries'}</span>
            )}
          </div>
        </div>
      </header>

      {/* Content Grid */}
      <main className="px-6 sm:px-12 pb-24 max-w-4xl mx-auto">
        {items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-white/30 text-lg">This archive is empty.</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 gap-4">
            {items.map(item => (
              <div key={item.id} className="mb-4 break-inside-avoid">
                <PublicItemCard item={item} />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] px-6 py-12 text-center">
        <p className="text-white/20 text-sm uppercase tracking-widest">
          Made with <span className="text-red-500/60">Second Mind</span>
        </p>
      </footer>
    </div>
  );
}
