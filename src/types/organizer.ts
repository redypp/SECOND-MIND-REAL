// Core types for the AI Organizer
export type ItemType = 'note' | 'task' | 'event' | 'wishlist' | 'idea' | 'reflection' | 'question';
export type Category = 'fashion' | 'school' | 'work' | 'health' | 'life' | null;

export interface OrganizedItem {
  type: ItemType;
  category: Category;
  title: string;
  raw_text: string;
  entities: {
    item_name: string | null;
    normalized_name: string | null;
    brand: string | null;
    item_type: string | null;
  };
  datetime: {
    date: string | null;
    time: string | null;
    timezone: string;
  };
  tags: string[];
  actions: OrganizerAction[];
  confidence: number;
  clarifying_question: string | null;
}

export type ActionType = 
  | 'create_section_if_missing'
  | 'add_note'
  | 'add_task'
  | 'add_wishlist_item'
  | 'add_calendar_event'
  | 'add_tags'
  | 'ask_clarifying_question';

export interface OrganizerAction {
  action: ActionType;
  section?: string;
  item_name?: string;
  tags?: string[];
  question?: string;
}

// Allowed sections
export const ALLOWED_SECTIONS = ['Wishlist', 'Tasks', 'Calendar', 'Notes'] as const;
export type AllowedSection = typeof ALLOWED_SECTIONS[number];

// Category detection patterns
export const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  fashion: [/fashion[:\s]/i, /#fashion/i, /\[fashion\]/i, /shoes?/i, /sneakers?/i, /clothes?/i, /outfit/i, /wear/i],
  school: [/school[:\s]/i, /#school/i, /\[school\]/i, /class/i, /homework/i, /study/i, /exam/i, /assignment/i],
  work: [/work[:\s]/i, /#work/i, /\[work\]/i, /meeting/i, /project/i, /deadline/i, /office/i],
  health: [/health[:\s]/i, /#health/i, /\[health\]/i, /gym/i, /workout/i, /doctor/i, /medicine/i],
  life: [/life[:\s]/i, /#life/i, /\[life\]/i, /personal/i, /family/i, /home/i],
};

// Wishlist intent patterns
export const WISHLIST_PATTERNS = [
  /\bi want\b/i,
  /\bneed\b/i,
  /\bbuy\b/i,
  /\bcop\b/i,
  /\bwishlist\b/i,
  /\bget\b/i,
  /\bwant to get\b/i,
  /\bwanna\b/i,
];

// Task patterns
export const TASK_PATTERNS = [
  /\btodo\b/i,
  /\bremind(er)?\b/i,
  /\bneed to\b/i,
  /\bhave to\b/i,
  /\bshould\b/i,
  /\bmust\b/i,
  /\bdon't forget\b/i,
];

// Event patterns
export const EVENT_PATTERNS = [
  /\bmeeting\b/i,
  /\bappointment\b/i,
  /\bevent\b/i,
  /\bat \d/i,
  /\bon (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /\btomorrow\b/i,
  /\bnext (week|month)\b/i,
];

// Common brand typos/aliases
export const BRAND_ALIASES: Record<string, string> = {
  'marginal': 'Maison Margiela',
  'margiela': 'Maison Margiela',
  'margela': 'Maison Margiela',
  'gats': 'GAT sneakers',
  'jordans': 'Air Jordan',
  'yeezys': 'Yeezy',
  'dunks': 'Nike Dunk',
  'af1': 'Air Force 1',
  'nb': 'New Balance',
};
