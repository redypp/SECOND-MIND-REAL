import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/app-client';
import { useAuth } from '@/contexts/AuthContext';
import { Person, Item } from '@/types';

interface PeopleContextType {
  people: Person[];
  loading: boolean;
  addPerson: (name: string) => Promise<Person | null>;
  updatePerson: (id: string, updates: Partial<Pick<Person, 'name' | 'avatar'>>) => void;
  deletePerson: (id: string) => void;
  getPeopleForItem: (item: Item) => Person[];
  resolvePeopleNames: (names: string[]) => Promise<string[]>;
}

const PeopleContext = createContext<PeopleContextType | undefined>(undefined);

export function PeopleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch all people on mount / user change
  useEffect(() => {
    if (!user) {
      setPeople([]);
      return;
    }

    async function fetchPeople() {
      setLoading(true);
      const { data } = await supabase
        .from('people')
        .select('*')
        .eq('user_id', user!.id)
        .order('name', { ascending: true });

      if (data) {
        setPeople(data.map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar || undefined,
        })));
      }
      setLoading(false);
    }

    fetchPeople();
  }, [user]);

  const addPerson = useCallback(async (name: string): Promise<Person | null> => {
    if (!user) return null;

    // Check if already exists (case-insensitive)
    const existing = people.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;

    const { data, error } = await supabase
      .from('people')
      .insert({ user_id: user.id, name })
      .select()
      .single();

    if (error || !data) return null;

    const person: Person = { id: data.id, name: data.name, avatar: data.avatar || undefined };
    setPeople(prev => [...prev, person].sort((a, b) => a.name.localeCompare(b.name)));
    return person;
  }, [user, people]);

  const updatePerson = useCallback(async (id: string, updates: Partial<Pick<Person, 'name' | 'avatar'>>) => {
    if (!user) return;

    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;

    await supabase.from('people').update(dbUpdates).eq('id', id);

    setPeople(prev => prev.map(p =>
      p.id === id ? { ...p, ...updates } : p
    ).sort((a, b) => a.name.localeCompare(b.name)));
  }, [user]);

  const deletePerson = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from('people').delete().eq('id', id);
    setPeople(prev => prev.filter(p => p.id !== id));
  }, [user]);

  const getPeopleForItem = useCallback((item: Item): Person[] => {
    if (!item.peopleIds?.length) return [];
    return people.filter(p => item.peopleIds!.includes(p.id));
  }, [people]);

  /**
   * Resolve an array of extracted names to people UUIDs.
   * Matches case-insensitively against existing people.
   * Creates new people records for unmatched names.
   * Returns array of people UUIDs.
   */
  const resolvePeopleNames = useCallback(async (names: string[]): Promise<string[]> => {
    if (!user || names.length === 0) return [];

    const ids: string[] = [];
    const namesToCreate: string[] = [];

    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;

      const existing = people.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        ids.push(existing.id);
      } else {
        namesToCreate.push(trimmed);
      }
    }

    // Batch create new people
    if (namesToCreate.length > 0) {
      const inserts = namesToCreate.map(name => ({ user_id: user.id, name }));
      const { data } = await supabase
        .from('people')
        .upsert(inserts, { onConflict: 'user_id,name', ignoreDuplicates: true })
        .select();

      if (data) {
        const newPeople: Person[] = data.map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar || undefined,
        }));

        // Update local state
        setPeople(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const toAdd = newPeople.filter(p => !existingIds.has(p.id));
          return [...prev, ...toAdd].sort((a, b) => a.name.localeCompare(b.name));
        });

        ids.push(...data.map(p => p.id));
      }
    }

    return [...new Set(ids)]; // dedupe
  }, [user, people]);

  return (
    <PeopleContext.Provider value={{
      people,
      loading,
      addPerson,
      updatePerson,
      deletePerson,
      getPeopleForItem,
      resolvePeopleNames,
    }}>
      {children}
    </PeopleContext.Provider>
  );
}

export function usePeople() {
  const context = useContext(PeopleContext);
  if (!context) throw new Error('usePeople must be used within PeopleProvider');
  return context;
}
