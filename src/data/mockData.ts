import { Space, Item } from '@/types';

export const spaces: Space[] = [
  { id: '1', name: 'Skateboarding', itemCount: 0 },
  { id: '2', name: 'Ideas', itemCount: 0 },
  { id: '3', name: 'Music', itemCount: 0 },
  { id: '4', name: 'Design', itemCount: 0 },
  { id: '5', name: 'Books', itemCount: 0 },
  { id: '6', name: 'Travel', itemCount: 0 },
];

export const items: Item[] = [];

export const getItemsBySpaceId = (spaceId: string): Item[] => {
  return items.filter(item => item.spaceIds.includes(spaceId));
};

export const getSpaceById = (spaceId: string): Space | undefined => {
  return spaces.find(space => space.id === spaceId);
};

export const getItemById = (itemId: string): Item | undefined => {
  return items.find(item => item.id === itemId);
};

export const searchItems = (query: string): Item[] => {
  const lowerQuery = query.toLowerCase();
  return items.filter(item => 
    item.content.toLowerCase().includes(lowerQuery) ||
    item.title?.toLowerCase().includes(lowerQuery) ||
    item.keywords?.some(k => k.toLowerCase().includes(lowerQuery))
  );
};
