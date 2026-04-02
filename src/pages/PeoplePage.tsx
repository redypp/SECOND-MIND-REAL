import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePeople } from '@/contexts/PeopleContext';
import { useSpaces } from '@/contexts/SpacesContext';
import { ArrowLeft, User, Trash2, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Item } from '@/types';

interface PersonWithStats {
  id: string;
  name: string;
  avatar?: string;
  mentionCount: number;
  archiveNames: string[];
  lastMentioned: Date | null;
}

export default function PeoplePage() {
  const navigate = useNavigate();
  const { people, deletePerson } = usePeople();
  const { items, spaces } = useSpaces();
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Build people with stats
  const peopleWithStats = useMemo((): PersonWithStats[] => {
    return people.map(person => {
      const mentionedItems = items.filter(i => i.peopleIds?.includes(person.id));
      const archiveIds = new Set<string>();
      let lastDate: Date | null = null;

      mentionedItems.forEach(item => {
        item.spaceIds?.forEach(sid => archiveIds.add(sid));
        if (!lastDate || item.createdAt > lastDate) lastDate = item.createdAt;
      });

      const archiveNames = [...archiveIds]
        .map(sid => spaces.find(s => s.id === sid)?.name)
        .filter(Boolean) as string[];

      return {
        id: person.id,
        name: person.name,
        avatar: person.avatar,
        mentionCount: mentionedItems.length,
        archiveNames,
        lastMentioned: lastDate,
      };
    }).sort((a, b) => b.mentionCount - a.mentionCount);
  }, [people, items, spaces]);

  // Get items for expanded person
  const expandedItems = useMemo((): { space: string; items: Item[] }[] => {
    if (!expandedPersonId) return [];
    const personItems = items.filter(i => i.peopleIds?.includes(expandedPersonId));

    // Group by first space
    const grouped = new Map<string, Item[]>();
    personItems.forEach(item => {
      const spaceId = item.spaceIds?.[0] || '__none__';
      if (!grouped.has(spaceId)) grouped.set(spaceId, []);
      grouped.get(spaceId)!.push(item);
    });

    return [...grouped.entries()].map(([spaceId, spaceItems]) => ({
      space: spaces.find(s => s.id === spaceId)?.name || 'Uncategorized',
      items: spaceItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    }));
  }, [expandedPersonId, items, spaces]);

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col safe-area-top-ios">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="font-display text-[clamp(1.5rem,6vw,2rem)] font-bold uppercase tracking-[-0.04em] text-foreground">
          People
        </h1>
        <span className="text-muted-foreground text-[14px]">{people.length}</span>
      </header>

      {/* Content */}
      <main
        className="flex-1 overflow-y-auto px-4"
        style={{ paddingBottom: 'calc(var(--app-safe-bottom, 0px) + 24px)', WebkitOverflowScrolling: 'touch' }}
      >
        {peopleWithStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
              <User className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No people yet</h3>
            <p className="text-muted-foreground text-[14px] max-w-[260px]">
              When you capture notes mentioning people, they'll automatically appear here.
            </p>
          </div>
        ) : (
          <div className="py-4 space-y-2">
            <AnimatePresence initial={false}>
              {peopleWithStats.map((person, i) => (
                <motion.div
                  key={person.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.03 }}
                >
                  {/* Person card */}
                  <button
                    className="w-full text-left rounded-2xl bg-secondary/40 dark:bg-white/[0.05] border border-border/30 dark:border-white/[0.06] overflow-hidden"
                    onClick={() => setExpandedPersonId(expandedPersonId === person.id ? null : person.id)}
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      {/* Avatar */}
                      <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                        <span className="text-[14px] font-bold text-primary uppercase">
                          {getInitials(person.name)}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[16px] font-semibold text-foreground truncate">
                          {person.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[13px] text-muted-foreground">
                            {person.mentionCount} {person.mentionCount === 1 ? 'mention' : 'mentions'}
                          </span>
                          {person.archiveNames.length > 0 && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                              <span className="text-[13px] text-muted-foreground truncate">
                                {person.archiveNames.slice(0, 2).join(', ')}
                                {person.archiveNames.length > 2 && ` +${person.archiveNames.length - 2}`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expand indicator */}
                      <ChevronRight className={`w-4 h-4 text-muted-foreground/50 transition-transform ${
                        expandedPersonId === person.id ? 'rotate-90' : ''
                      }`} />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {expandedPersonId === person.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 py-3 space-y-4">
                          {expandedItems.map(group => (
                            <div key={group.space}>
                              <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-muted-foreground mb-2">
                                {group.space}
                              </p>
                              <div className="space-y-1.5">
                                {group.items.slice(0, 5).map(item => (
                                  <button
                                    key={item.id}
                                    onClick={() => navigate(`/item/${item.id}`)}
                                    className="w-full text-left px-3 py-2 rounded-xl bg-secondary/30 dark:bg-white/[0.03] hover:bg-secondary/50 dark:hover:bg-white/[0.06] transition-colors"
                                  >
                                    <p className="text-[14px] text-foreground truncate">
                                      {item.title || item.content?.slice(0, 60) || 'Untitled'}
                                    </p>
                                    <p className="text-[12px] text-muted-foreground mt-0.5">
                                      {item.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </p>
                                  </button>
                                ))}
                                {group.items.length > 5 && (
                                  <p className="text-[13px] text-muted-foreground px-3">
                                    +{group.items.length - 5} more
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}

                          {expandedItems.length === 0 && (
                            <p className="text-[14px] text-muted-foreground">No items found.</p>
                          )}

                          {/* Delete person */}
                          <div className="pt-2 border-t border-border/20">
                            {confirmDeleteId === person.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] text-destructive">Remove this person?</span>
                                <button
                                  onClick={() => { deletePerson(person.id); setConfirmDeleteId(null); setExpandedPersonId(null); }}
                                  className="text-[13px] text-destructive font-medium px-2 py-1 rounded bg-destructive/10"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-[13px] text-muted-foreground px-2 py-1"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(person.id)}
                                className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="w-3 h-3" />
                                Remove person
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
