// Note: Space interface moved to after Item for proper dependency ordering
// See bottom of file for Space interface

// Content block types for flexible entries
export interface TextBlock {
  id: string;
  type: 'text';
  content: string;
}

export interface ListBlock {
  id: string;
  type: 'list';
  items: string[];
  ordered?: boolean;
}

export interface ChecklistBlock {
  id: string;
  type: 'checklist';
  items: { id: string; text: string; checked: boolean }[];
}

export interface MediaBlock {
  id: string;
  type: 'media';
  url: string;
  mediaType: 'image' | 'video' | 'link';
  caption?: string;
}

export interface TableBlock {
  id: string;
  type: 'table';
  headers: string[];
  rows: string[][];
}

export type ContentBlock = TextBlock | ListBlock | ChecklistBlock | MediaBlock | TableBlock;

// Sub-categories for organizing items within a section
// Core storage categories (mapped from AI classification)
export type SubCategory =
  | 'scheduling' // Events, meetings, calendar entries with dates/times
  | 'notes'      // Ideas, knowledge, references, general notes (default)
  | 'todo'       // Tasks and action items
  | 'misc'       // Links, media, and catch-all entries
  | 'habit'      // Recurring habits and routines
  | 'journal'    // Personal reflections and diary entries
  | 'reminder'   // Time-sensitive reminders
  | 'idea'       // Creative and exploratory concepts
  | 'task';      // Explicit tasks (alias for todo, richer semantics)

export interface Item {
  id: string;
  subCategory: SubCategory;
  title?: string;
  blocks: ContentBlock[];
  spaceIds?: string[]; // Optional - only for notes/misc items linked to sections
  peopleIds?: string[];
  createdAt: Date;
  updatedAt?: Date; // Last modified timestamp for conflict resolution
  keywords?: string[];
  scheduledDate?: string;
  scheduledTime?: string;
  color?: string; // Custom color for the item
  // Canvas position fields for freeform layout
  canvasX?: number;
  canvasY?: number;
  canvasZ?: number;
  canvasScale?: number;
  // Version for optimistic locking
  version?: number;
  // AI-generated classification tags — first element is the semantic category
  aiTags?: string[];
  // Legacy fields for backwards compatibility
  type?: 'note' | 'link' | 'image' | 'video';
  content?: string;
  thumbnail?: string;
  url?: string;
}

export interface ArchiveGroup {
  label: string;
  item_ids: string[];
}

export interface GroupAssignments {
  groups: ArchiveGroup[];
  organized_at: string;
  item_count_at_organize: number;
}

export interface Space {
  id: string;
  name: string;
  image?: string;
  gifBackground?: string; // URL of animated GIF background for the archive title page
  itemCount: number;
  color?: string;
  mergedFrom?: string[]; // IDs of spaces that were merged into this one
  updatedAt?: Date; // Last modified timestamp for conflict resolution
  version?: number; // Version for optimistic locking
  isPinned?: boolean;
  pinnedAt?: Date | null;
  lastUsedAt?: Date;
  groupAssignments?: GroupAssignments | null;
  // Public archive fields
  isPublic?: boolean;
  publicSlug?: string;
  publicDescription?: string;
  publishedAt?: Date;
  authorName?: string;
}

export interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string;
  role: 'viewer' | 'editor';
  invitedAt: Date;
  acceptedAt: Date | null;
}

export interface SpaceInvite {
  id: string;
  spaceId: string;
  token: string;
  invitedEmail?: string;
  role: 'viewer' | 'editor';
  expiresAt: Date;
  acceptedAt: Date | null;
}

export interface Person {
  id: string;
  name: string;
  avatar?: string;
}
