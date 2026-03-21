import {
  OrganizedItem,
  Category,
  CATEGORY_PATTERNS,
} from '@/types/organizer';
import { SubCategory } from '@/types';

// Patterns to detect sub-categories
const SCHEDULING_PATTERNS = [
  /\bmeeting\b/i,
  /\bappointment\b/i,
  /\bevent\b/i,
  /\bschedule\b/i,
  /\bcalendar\b/i,
  /\btomorrow\b/i,
  /\bnext week\b/i,
  /\bat \d{1,2}(:\d{2})?\s*(am|pm)?/i,
  /\bon (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /\breminder\b/i,
];

const TODO_PATTERNS = [
  /\btodo\b/i,
  /\bto-do\b/i,
  /\bneed to\b/i,
  /\bhave to\b/i,
  /\bshould\b/i,
  /\bmust\b/i,
  /\bdon't forget\b/i,
  /\btask\b/i,
  /\bcomplete\b/i,
  /\bfinish\b/i,
];

const MISC_PATTERNS = [
  /\bphoto\b/i,
  /\bpicture\b/i,
  /\bimage\b/i,
  /\bvideo\b/i,
  /\bclip\b/i,
  /\bfile\b/i,
  /\battachment\b/i,
];

// Detect sub-category based on content
export function detectSubCategory(input: string, itemType: 'note' | 'link' | 'image' | 'video'): SubCategory {
  // If it's an image or video type, it's misc
  if (itemType === 'image' || itemType === 'video') {
    return 'misc';
  }
  
  // Check for scheduling patterns
  for (const pattern of SCHEDULING_PATTERNS) {
    if (pattern.test(input)) return 'scheduling';
  }
  
  // Check for todo patterns
  for (const pattern of TODO_PATTERNS) {
    if (pattern.test(input)) return 'todo';
  }
  
  // Check for misc patterns
  for (const pattern of MISC_PATTERNS) {
    if (pattern.test(input)) return 'misc';
  }
  
  // Default to general notes
  return 'notes';
}

// Extract category hint from input
function detectCategory(input: string): Category {
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return category as Category;
      }
    }
  }
  return null;
}

// Extract date/time from input
function extractDateTime(input: string): { date: string | null; time: string | null; timezone: string } {
  const now = new Date();
  let date: string | null = null;
  let time: string | null = null;
  
  // Tomorrow
  if (/\btomorrow\b/i.test(input)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    date = tomorrow.toISOString().split('T')[0];
  }
  
  // Next week
  if (/\bnext week\b/i.test(input)) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    date = nextWeek.toISOString().split('T')[0];
  }
  
  // Specific time pattern (e.g., "at 3pm", "at 15:00")
  const timeMatch = input.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const meridiem = timeMatch[3]?.toLowerCase();
    
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    
    time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }
  
  return { date, time, timezone: 'America/New_York' };
}

// Generate title from input
function generateTitle(input: string): string {
  let title = input;
  
  // Remove section hints (e.g., "skateboarding: ")
  title = title.replace(/^[a-zA-Z0-9\s]+:\s+/i, '');
  
  // Remove category hints
  title = title.replace(/^(fashion|school|work|health|life)[:\s]+/i, '');
  title = title.replace(/#\w+/g, '');
  title = title.replace(/\[\w+\]/g, '');
  
  // Clean and capitalize
  title = title.trim().replace(/\s+/g, ' ');
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  
  return title || 'Untitled';
}

// Extract tags from input
function extractTags(input: string, category: Category): string[] {
  const tags: string[] = [];
  
  // Add category as tag if present
  if (category) {
    tags.push(category);
  }
  
  // Extract hashtags
  const hashtagMatches = input.match(/#(\w+)/g);
  if (hashtagMatches) {
    hashtagMatches.forEach(tag => {
      const cleanTag = tag.slice(1).toLowerCase();
      if (!tags.includes(cleanTag)) {
        tags.push(cleanTag);
      }
    });
  }
  
  return [...new Set(tags)];
}

// Calculate confidence score
function calculateConfidence(input: string, category: Category): number {
  let confidence = 0.7; // Higher base since we're simpler now
  
  // Boost for explicit category hint
  if (/^(fashion|school|work|health|life)[:\s]/i.test(input) || /#(fashion|school|work|health|life)/i.test(input)) {
    confidence += 0.2;
  }
  
  // Boost for section hint
  if (/^[a-zA-Z0-9\s]+:\s/.test(input)) {
    confidence += 0.15;
  }
  
  // Reduce for short/ambiguous input
  if (input.length < 10) {
    confidence -= 0.15;
  }
  
  return Math.min(1, Math.max(0, confidence));
}

// Extract explicit section hint from input (e.g., "skateboarding: my note")
export function extractSectionHint(input: string): string | null {
  // Match pattern like "section_name:" at the start
  const match = input.match(/^([a-zA-Z0-9\s]+):\s/i);
  if (match) {
    return match[1].trim();
  }
  return null;
}

// Main organizer function
export function organize(input: string): OrganizedItem & { sectionHint: string | null } {
  const trimmedInput = input.trim();
  
  if (!trimmedInput) {
    return {
      type: 'note',
      category: null,
      title: 'Untitled',
      raw_text: input,
      entities: { item_name: null, normalized_name: null, brand: null, item_type: null },
      datetime: { date: null, time: null, timezone: 'America/New_York' },
      tags: [],
      actions: [],
      confidence: 0,
      clarifying_question: null,
      sectionHint: null,
    };
  }
  
  // Extract section hint first
  const sectionHint = extractSectionHint(trimmedInput);
  
  const category = detectCategory(trimmedInput);
  const title = generateTitle(trimmedInput);
  const tags = extractTags(trimmedInput, category);
  
  const confidence = calculateConfidence(trimmedInput, category);
  
  return {
    type: 'note',
    category,
    title,
    raw_text: input,
    entities: { item_name: null, normalized_name: null, brand: null, item_type: null },
    datetime: { date: null, time: null, timezone: 'America/New_York' },
    tags,
    actions: [],
    confidence,
    clarifying_question: null,
    sectionHint,
  };
}
