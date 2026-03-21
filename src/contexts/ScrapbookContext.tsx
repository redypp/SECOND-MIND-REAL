import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { ScrapbookEntry, ContentBlock, ListItem } from '@/types/scrapbook';

const STORAGE_KEY = 'scrapbook_entries_v2';
const OLD_STORAGE_KEY = 'scrapbook_entries';

// Migration: Check if old data exists and migrate it
function migrateOldData(): void {
  try {
    const oldData = localStorage.getItem(OLD_STORAGE_KEY);
    const newData = localStorage.getItem(STORAGE_KEY);
    
    if (oldData && !newData) {
      localStorage.setItem(STORAGE_KEY, oldData);
    }
  } catch (e) {
    console.error('Error migrating old scrapbook data:', e);
  }
}

// Run migration on module load
migrateOldData();

function loadFromStorage(): ScrapbookEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((entry: any) => ({
        ...entry,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      }));
    }
  } catch (e) {
    console.error('Error loading from storage:', e);
  }
  return [];
}

function saveToStorage(entries: ScrapbookEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error('Error saving to storage:', e);
  }
}

interface ScrapbookContextType {
  entries: ScrapbookEntry[];
  addEntry: (blocks: ContentBlock[], linkPreview?: ScrapbookEntry['linkPreview']) => string;
  updateEntry: (id: string, blocks: ContentBlock[]) => void;
  deleteEntry: (id: string) => void;
  toggleChecklistItem: (entryId: string, blockId: string, itemId: string) => void;
}

const ScrapbookContext = createContext<ScrapbookContextType | undefined>(undefined);

export function ScrapbookProvider({ children }: { children: ReactNode }) {
  const isInitialized = useRef(false);
  const [entries, setEntries] = useState<ScrapbookEntry[]>(() => loadFromStorage());

  // Only save after initial load to prevent overwriting with empty data
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      return;
    }
    saveToStorage(entries);
  }, [entries]);

  const addEntry = useCallback((blocks: ContentBlock[], linkPreview?: ScrapbookEntry['linkPreview']): string => {
    const id = Date.now().toString();
    const now = new Date();
    const newEntry: ScrapbookEntry = {
      id,
      blocks,
      createdAt: now,
      updatedAt: now,
      linkPreview,
    };
    setEntries(prev => [newEntry, ...prev]);
    return id;
  }, []);

  const updateEntry = useCallback((id: string, blocks: ContentBlock[]) => {
    setEntries(prev => prev.map(entry =>
      entry.id === id
        ? { ...entry, blocks, updatedAt: new Date() }
        : entry
    ));
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(entry => entry.id !== id));
  }, []);

  const toggleChecklistItem = useCallback((entryId: string, blockId: string, itemId: string) => {
    setEntries(prev => prev.map(entry => {
      if (entry.id !== entryId) return entry;
      
      return {
        ...entry,
        updatedAt: new Date(),
        blocks: entry.blocks.map(block => {
          if (block.id !== blockId || block.type !== 'checklist') return block;
          
          return {
            ...block,
            items: block.items?.map(item =>
              item.id === itemId ? { ...item, checked: !item.checked } : item
            ),
          };
        }),
      };
    }));
  }, []);

  return (
    <ScrapbookContext.Provider value={{
      entries,
      addEntry,
      updateEntry,
      deleteEntry,
      toggleChecklistItem,
    }}>
      {children}
    </ScrapbookContext.Provider>
  );
}

export function useScrapbook() {
  const context = useContext(ScrapbookContext);
  if (!context) {
    throw new Error('useScrapbook must be used within a ScrapbookProvider');
  }
  return context;
}
